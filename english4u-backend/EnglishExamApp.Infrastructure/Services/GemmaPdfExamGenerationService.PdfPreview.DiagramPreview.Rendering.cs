using System.Net;
using System.Text;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Docnet.Core;
using Docnet.Core.Models;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService
{

    private static string? TryRenderDiagramPreviewDataUrl(
        byte[] pdfBytes,
        int pageNumber,
        DiagramPreviewCropBounds cropBounds)
    {
        if (!OperatingSystem.IsWindows() || pdfBytes.Length == 0 || pageNumber <= 0)
        {
            return null;
        }

        try
        {
            using var docReader = DocLib.Instance.GetDocReader(
                pdfBytes,
                new PageDimensions(2200, 3200));
            if (pageNumber > docReader.GetPageCount())
            {
                return null;
            }

            using var pageReader = docReader.GetPageReader(pageNumber - 1);
            var rawBytes = pageReader.GetImage();
            var width = pageReader.GetPageWidth();
            var height = pageReader.GetPageHeight();
            if (rawBytes is null || rawBytes.Length == 0 || width <= 0 || height <= 0)
            {
                return null;
            }

            using var bitmap = CreateBitmapFromRawBgra(width, height, rawBytes);
            var cropRectangle = BuildDiagramCropRectangle(bitmap.Width, bitmap.Height, cropBounds);
            if (cropRectangle.Width <= 0 || cropRectangle.Height <= 0)
            {
                return null;
            }

            using var croppedBitmap = bitmap.Clone(cropRectangle, PixelFormat.Format32bppArgb);
            var tightenedRectangle = cropBounds.HasExplicitBottomBoundary
                ? null
                : DetectPrimaryDiagramRectangle(croppedBitmap);
            using var preliminaryBitmap = tightenedRectangle is null
                ? (Bitmap)croppedBitmap.Clone()
                : croppedBitmap.Clone(tightenedRectangle.Value, PixelFormat.Format32bppArgb);
            var topNoiseTrimmedRectangle = DetectLeadingTopNoiseTrimRectangle(preliminaryBitmap);
            using var intermediateBitmap = topNoiseTrimmedRectangle is null
                ? (Bitmap)preliminaryBitmap.Clone()
                : preliminaryBitmap.Clone(topNoiseTrimmedRectangle.Value, PixelFormat.Format32bppArgb);
            var finalTopTrimmedRectangle = DetectTopWhitespaceTrimRectangle(intermediateBitmap);
            using var finalBitmap = finalTopTrimmedRectangle is null
                ? (Bitmap)intermediateBitmap.Clone()
                : intermediateBitmap.Clone(finalTopTrimmedRectangle.Value, PixelFormat.Format32bppArgb);

            return ConvertBitmapToDataUrl(finalBitmap);
        }
        catch
        {
            return null;
        }
    }

    [SupportedOSPlatform("windows")]
    private static Bitmap CreateBitmapFromRawBgra(int width, int height, byte[] rawBytes)
    {
        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        var bitmapData = bitmap.LockBits(
            new Rectangle(0, 0, width, height),
            ImageLockMode.WriteOnly,
            PixelFormat.Format32bppArgb);

        try
        {
            Marshal.Copy(rawBytes, 0, bitmapData.Scan0, Math.Min(rawBytes.Length, Math.Abs(bitmapData.Stride) * height));
        }
        finally
        {
            bitmap.UnlockBits(bitmapData);
        }

        return bitmap;
    }

    private static Rectangle BuildDiagramCropRectangle(int width, int height, DiagramPreviewCropBounds cropBounds)
    {
        var top = Math.Clamp((int)Math.Floor(height * cropBounds.TopRatio), 0, Math.Max(0, height - 1));
        var bottom = Math.Clamp((int)Math.Ceiling(height * cropBounds.BottomRatio), top + 1, height);
        return new Rectangle(0, top, width, Math.Max(1, bottom - top));
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle? DetectPrimaryDiagramRectangle(Bitmap bitmap)
    {
        var verticalBands = FindForegroundBands(
            length: bitmap.Height,
            sampleAt: index => CountForegroundPixelsInRow(bitmap, index),
            activationThreshold: Math.Max(8, bitmap.Width / 90),
            minBandSize: Math.Max(80, bitmap.Height / 10),
            gapTolerance: Math.Max(12, bitmap.Height / 45));

        if (verticalBands.Count == 0)
        {
            return null;
        }

        var candidateRectangles = verticalBands
            .Select(band => BuildTightCropRectangle(bitmap, band, splitVertically: true))
            .Where(rectangle => rectangle.Width >= bitmap.Width * 0.35 && rectangle.Height >= bitmap.Height * 0.08)
            .ToList();

        if (candidateRectangles.Count == 0)
        {
            return null;
        }

        var dominantDiagramCandidates = candidateRectangles
            .Where(rectangle =>
                rectangle.Width >= bitmap.Width * 0.52d &&
                rectangle.Height >= bitmap.Height * 0.18d &&
                GetRectangleAreaRatio(rectangle, bitmap) >= 0.12d)
            .OrderByDescending(rectangle => ScoreDiagramRectangle(bitmap, rectangle))
            .ThenBy(rectangle => rectangle.Y)
            .ToList();

        if (dominantDiagramCandidates.Count > 0)
        {
            return dominantDiagramCandidates[0];
        }

        var relaxedDiagramCandidates = candidateRectangles
            .Where(rectangle =>
                rectangle.Width >= bitmap.Width * 0.45d &&
                rectangle.Height >= bitmap.Height * 0.14d &&
                GetRectangleAreaRatio(rectangle, bitmap) >= 0.08d &&
                ComputeForegroundDensity(bitmap, rectangle) >= 0.012d)
            .Where(rectangle => !(rectangle.Y <= bitmap.Height * 0.14d && rectangle.Height <= bitmap.Height * 0.14d))
            .OrderByDescending(rectangle => ScoreDiagramRectangle(bitmap, rectangle))
            .ThenBy(rectangle => rectangle.Y)
            .ToList();

        if (relaxedDiagramCandidates.Count > 0)
        {
            return relaxedDiagramCandidates[0];
        }

        return null;
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle? DetectLeadingTopNoiseTrimRectangle(Bitmap bitmap)
    {
        if (bitmap.Height < 120 || bitmap.Width < 160)
        {
            return null;
        }

        var verticalBands = FindForegroundBands(
            length: bitmap.Height,
            sampleAt: index => CountForegroundPixelsInRow(bitmap, index),
            activationThreshold: Math.Max(5, bitmap.Width / 140),
            minBandSize: Math.Max(10, bitmap.Height / 80),
            gapTolerance: Math.Max(6, bitmap.Height / 90));

        if (verticalBands.Count < 2)
        {
            return null;
        }

        var firstRectangle = BuildTightCropRectangle(bitmap, verticalBands[0], splitVertically: true);
        var secondRectangle = BuildTightCropRectangle(bitmap, verticalBands[1], splitVertically: true);
        if (firstRectangle == Rectangle.Empty || secondRectangle == Rectangle.Empty)
        {
            return null;
        }

        var firstAreaRatio = GetRectangleAreaRatio(firstRectangle, bitmap);
        var secondAreaRatio = GetRectangleAreaRatio(secondRectangle, bitmap);
        var firstHeightRatio = (double)firstRectangle.Height / bitmap.Height;
        var secondHeightRatio = (double)secondRectangle.Height / bitmap.Height;
        var verticalGap = secondRectangle.Y - firstRectangle.Bottom;

        var looksLikeTopNoise =
            firstRectangle.Y <= bitmap.Height * 0.08d &&
            firstHeightRatio <= 0.07d &&
            firstAreaRatio <= 0.03d &&
            secondHeightRatio >= 0.18d &&
            secondAreaRatio >= 0.12d &&
            verticalGap >= bitmap.Height * 0.015d;

        if (!looksLikeTopNoise)
        {
            return null;
        }

        var trimTop = Math.Max(0, secondRectangle.Y - Math.Max(6, bitmap.Height / 100));
        if (trimTop <= 4)
        {
            return null;
        }

        return new Rectangle(
            0,
            trimTop,
            bitmap.Width,
            Math.Max(1, bitmap.Height - trimTop));
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle? DetectTopWhitespaceTrimRectangle(Bitmap bitmap)
    {
        if (bitmap.Height < 80 || bitmap.Width < 120)
        {
            return null;
        }

        var activationThreshold = Math.Max(10, bitmap.Width / 55);
        var stableBandRowsNeeded = Math.Max(8, bitmap.Height / 80);
        var trimTop = -1;
        var stableRows = 0;

        for (var y = 0; y < Math.Min(bitmap.Height / 4, bitmap.Height - 1); y++)
        {
            var foregroundCount = CountForegroundPixelsInRow(bitmap, y);
            if (foregroundCount >= activationThreshold)
            {
                stableRows++;
                if (stableRows >= stableBandRowsNeeded)
                {
                    trimTop = Math.Max(0, y - stableBandRowsNeeded + 1);
                    break;
                }
            }
            else
            {
                stableRows = 0;
            }
        }

        if (trimTop <= 2)
        {
            return null;
        }

        return new Rectangle(
            0,
            trimTop,
            bitmap.Width,
            Math.Max(1, bitmap.Height - trimTop));
    }

    [SupportedOSPlatform("windows")]
    private static string? ConvertBitmapToDataUrl(Bitmap bitmap)
    {
        using var output = new MemoryStream();
        bitmap.Save(output, ImageFormat.Png);
        var base64 = Convert.ToBase64String(output.ToArray());
        return $"data:image/png;base64,{base64}";
    }
}