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
        if (pdfBytes.Length == 0 || pageNumber <= 0)
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

            var leftRatio = Math.Clamp(cropBounds.LeftRatio, 0d, 0.98d);
            var rightRatio = Math.Clamp(cropBounds.RightRatio, leftRatio + 0.02d, 1d);
            var left = Math.Clamp((int)Math.Floor(width * leftRatio), 0, Math.Max(0, width - 1));
            var right = Math.Clamp((int)Math.Ceiling(width * rightRatio), left + 1, width);
            var top = Math.Clamp((int)Math.Floor(height * cropBounds.TopRatio), 0, Math.Max(0, height - 1));
            var bottom = Math.Clamp((int)Math.Ceiling(height * cropBounds.BottomRatio), top + 1, height);

            var cropX = left;
            var cropY = top;
            var cropWidth = Math.Max(1, right - left);
            var cropHeight = Math.Max(1, bottom - top);

            if (cropWidth <= 0 || cropHeight <= 0)
            {
                return null;
            }

            var croppedBgra = new byte[cropWidth * cropHeight * 4];
            for (var r = 0; r < cropHeight; r++)
            {
                var srcY = cropY + r;
                var srcOffset = (srcY * width + cropX) * 4;
                var destOffset = r * cropWidth * 4;
                if (srcOffset + cropWidth * 4 <= rawBytes.Length && destOffset + cropWidth * 4 <= croppedBgra.Length)
                {
                    Array.Copy(rawBytes, srcOffset, croppedBgra, destOffset, cropWidth * 4);
                }
            }

            var pngBytes = ConvertBgraToPng(croppedBgra, cropWidth, cropHeight);
            return "data:image/png;base64," + Convert.ToBase64String(pngBytes);
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
        var leftRatio = Math.Clamp(cropBounds.LeftRatio, 0d, 0.98d);
        var rightRatio = Math.Clamp(cropBounds.RightRatio, leftRatio + 0.02d, 1d);
        var left = Math.Clamp((int)Math.Floor(width * leftRatio), 0, Math.Max(0, width - 1));
        var right = Math.Clamp((int)Math.Ceiling(width * rightRatio), left + 1, width);
        var top = Math.Clamp((int)Math.Floor(height * cropBounds.TopRatio), 0, Math.Max(0, height - 1));
        var bottom = Math.Clamp((int)Math.Ceiling(height * cropBounds.BottomRatio), top + 1, height);
        return new Rectangle(left, top, Math.Max(1, right - left), Math.Max(1, bottom - top));
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

    private static byte[] ConvertBgraToPng(byte[] rawBgra, int widthPx, int heightPx)
    {
        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms);

        void WriteChunk(string type, byte[] data)
        {
            bw.Write(ToBigEndian(data.Length));
            var typeBytes = System.Text.Encoding.ASCII.GetBytes(type);
            bw.Write(typeBytes);
            bw.Write(data);
            var crc = ComputeCrc32(typeBytes.Concat(data).ToArray());
            bw.Write(ToBigEndian((int)crc));
        }

        bw.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });

        var ihdr = new byte[13];
        ihdr[0] = (byte)(widthPx >> 24);
        ihdr[1] = (byte)(widthPx >> 16);
        ihdr[2] = (byte)(widthPx >> 8);
        ihdr[3] = (byte)widthPx;
        ihdr[4] = (byte)(heightPx >> 24);
        ihdr[5] = (byte)(heightPx >> 16);
        ihdr[6] = (byte)(heightPx >> 8);
        ihdr[7] = (byte)heightPx;
        ihdr[8] = 8;
        ihdr[9] = 2; // RGB (Color Type 2)
        WriteChunk("IHDR", ihdr);

        var stride = widthPx * 3;
        var raw = new byte[heightPx * (stride + 1)];
        for (var y = 0; y < heightPx; y++)
        {
            raw[y * (stride + 1)] = 0; // Filter type 0
            for (var x = 0; x < widthPx; x++)
            {
                var srcOffset = (y * widthPx + x) * 4;
                var dstOffset = y * (stride + 1) + 1 + x * 3;
                raw[dstOffset] = srcOffset + 2 < rawBgra.Length ? rawBgra[srcOffset + 2] : (byte)255;
                raw[dstOffset + 1] = srcOffset + 1 < rawBgra.Length ? rawBgra[srcOffset + 1] : (byte)255;
                raw[dstOffset + 2] = srcOffset < rawBgra.Length ? rawBgra[srcOffset] : (byte)255;
            }
        }

        using var deflated = new MemoryStream();
        using (var deflate = new System.IO.Compression.DeflateStream(
                   deflated, System.IO.Compression.CompressionLevel.Fastest, true))
        {
            deflate.Write(raw, 0, raw.Length);
        }

        var zlib = new byte[deflated.Length + 6];
        zlib[0] = 0x78;
        zlib[1] = 0x9C;
        deflated.ToArray().CopyTo(zlib, 2);
        var adler = ComputeAdler32(raw);
        zlib[zlib.Length - 4] = (byte)(adler >> 24);
        zlib[zlib.Length - 3] = (byte)(adler >> 16);
        zlib[zlib.Length - 2] = (byte)(adler >> 8);
        zlib[zlib.Length - 1] = (byte)adler;

        WriteChunk("IDAT", zlib);
        WriteChunk("IEND", []);

        return ms.ToArray();
    }

    private static byte[] ToBigEndian(int value) =>
        [(byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value];

    private static uint ComputeCrc32(byte[] data)
    {
        var table = BuildCrc32Table();
        uint crc = 0xFFFFFFFF;
        foreach (var b in data)
        {
            crc = (crc >> 8) ^ table[(crc ^ b) & 0xFF];
        }

        return crc ^ 0xFFFFFFFF;
    }

    private static uint[] BuildCrc32Table()
    {
        var table = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            var c = i;
            for (var k = 0; k < 8; k++)
            {
                c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
            }

            table[i] = c;
        }

        return table;
    }

    private static uint ComputeAdler32(byte[] data)
    {
        const uint mod = 65521;
        uint a = 1, b = 0;
        foreach (var v in data)
        {
            a = (a + v) % mod;
            b = (b + a) % mod;
        }

        return (b << 16) | a;
    }
}
