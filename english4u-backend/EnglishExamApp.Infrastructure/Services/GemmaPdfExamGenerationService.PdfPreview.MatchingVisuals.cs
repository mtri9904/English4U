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

    private static HashSet<string> BuildQuestionAreaAnchorTokens(PdfRawQuestionInstructionPreviewDto group)
    {
        var tokens = new HashSet<string>(StringComparer.Ordinal);

        tokens.Add("QUESTIONS");
        tokens.Add("QUESTION");
        tokens.Add(group.StartQuestion.ToString(CultureInfo.InvariantCulture));
        tokens.Add(group.EndQuestion.ToString(CultureInfo.InvariantCulture));

        foreach (var token in BuildComparableSearchTokens(group.Instruction)
                     .Concat(BuildComparableSearchTokens(group.QuestionPreview))
                     .Take(8))
        {
            tokens.Add(token);
        }

        return tokens;
    }

    private static List<PdfExtractedPageImage> GetLikelyMatchingVisualImages(
        PdfExtractedPage page,
        PdfRawQuestionInstructionPreviewDto? anchorGroup = null)
    {
        var sourceImages = anchorGroup is null
            ? page.Images
            : GetImagesRelevantToQuestionBlock(anchorGroup, page);

        var filtered = sourceImages
            .Where(image => image.PageCoverage >= MinMatchingVisualPageCoverage)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .ToList();

        if (filtered.Count > 0)
        {
            return filtered;
        }

        return sourceImages
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .Take(1)
            .ToList();
    }

    private static List<PdfRawVisualPreviewItemDto> TrySplitMatchingVisualPreviewItems(
        PdfExtractedPageImage image,
        int pageNumber,
        int maxItems,
        ref char nextOptionLabel)
    {
        if (maxItems <= 0)
        {
            return [];
        }

        if (!OperatingSystem.IsWindows())
        {
            return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
        }

        try
        {
            var imageBytes = TryDecodeDataUrlBytes(image.DataUrl);
            if (imageBytes is null || imageBytes.Length == 0)
            {
                return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
            }

            using var inputStream = new MemoryStream(imageBytes, writable: false);
            using var bitmap = CreateBitmap(inputStream);

            var cropRectangles = DetectMatchingVisualCropRectangles(bitmap)
                .Take(maxItems)
                .ToList();
            if (cropRectangles.Count <= 1)
            {
                return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, cropRectangles.Count == 0 ? 1 : cropRectangles.Count, maxItems, ref nextOptionLabel);
            }

            var previewItems = new List<PdfRawVisualPreviewItemDto>(cropRectangles.Count);
            foreach (var cropRectangle in cropRectangles)
            {
                var croppedDataUrl = TryCropBitmapToDataUrl(bitmap, cropRectangle);
                if (string.IsNullOrWhiteSpace(croppedDataUrl))
                {
                    continue;
                }

                var label = nextOptionLabel <= 'Z' ? nextOptionLabel.ToString(CultureInfo.InvariantCulture) : "?";
                previewItems.Add(new PdfRawVisualPreviewItemDto(
                    ImageDataUrl: croppedDataUrl,
                    PageNumber: pageNumber,
                    Note: $"Option {label} candidate from page {pageNumber}."));
                if (nextOptionLabel < 'Z')
                {
                    nextOptionLabel++;
                }
            }

            return previewItems.Count > 0
                ? previewItems
                : BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
        }
        catch
        {
            return BuildFallbackMatchingVisualPreviewItems(image.DataUrl, pageNumber, 1, maxItems, ref nextOptionLabel);
        }
    }

    private static List<PdfRawVisualPreviewItemDto> BuildFallbackMatchingVisualPreviewItems(
        string imageDataUrl,
        int pageNumber,
        int detectedItemCount,
        int maxItems,
        ref char nextOptionLabel)
    {
        if (maxItems <= 0 || string.IsNullOrWhiteSpace(imageDataUrl))
        {
            return [];
        }

        var label = nextOptionLabel <= 'Z' ? nextOptionLabel.ToString(CultureInfo.InvariantCulture) : "?";
        if (nextOptionLabel < 'Z')
        {
            nextOptionLabel++;
        }

        var note = detectedItemCount > 1
            ? $"Combined visual candidates from page {pageNumber}; expected split into {detectedItemCount} item(s)."
            : $"Option {label} candidate from page {pageNumber}.";

        return
        [
            new PdfRawVisualPreviewItemDto(
                ImageDataUrl: imageDataUrl,
                PageNumber: pageNumber,
                Note: note)
        ];
    }

    private static byte[]? TryDecodeDataUrlBytes(string? dataUrl)
    {
        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            return null;
        }

        var commaIndex = dataUrl.IndexOf(',');
        if (commaIndex < 0 || commaIndex >= dataUrl.Length - 1)
        {
            return null;
        }

        try
        {
            return Convert.FromBase64String(dataUrl[(commaIndex + 1)..]);
        }
        catch
        {
            return null;
        }
    }

    [SupportedOSPlatform("windows")]
    private static Bitmap CreateBitmap(Stream inputStream) => new(inputStream);

    [SupportedOSPlatform("windows")]
    private static List<Rectangle> DetectMatchingVisualCropRectangles(Bitmap bitmap)
    {
        var verticalBands = FindForegroundBands(
            length: bitmap.Height,
            sampleAt: index => CountForegroundPixelsInRow(bitmap, index),
            activationThreshold: Math.Max(8, bitmap.Width / 80),
            minBandSize: Math.Max(60, bitmap.Height / 8),
            gapTolerance: Math.Max(12, bitmap.Height / 40));

        if (verticalBands.Count >= 2)
        {
            return verticalBands
                .Select(band => BuildTightCropRectangle(bitmap, band, splitVertically: true))
                .Where(rectangle => rectangle.Width >= 80 && rectangle.Height >= 80)
                .ToList();
        }

        var horizontalBands = FindForegroundBands(
            length: bitmap.Width,
            sampleAt: index => CountForegroundPixelsInColumn(bitmap, index),
            activationThreshold: Math.Max(8, bitmap.Height / 80),
            minBandSize: Math.Max(60, bitmap.Width / 8),
            gapTolerance: Math.Max(12, bitmap.Width / 40));

        if (horizontalBands.Count >= 2)
        {
            return horizontalBands
                .Select(band => BuildTightCropRectangle(bitmap, band, splitVertically: false))
                .Where(rectangle => rectangle.Width >= 80 && rectangle.Height >= 80)
                .ToList();
        }

        return [];
    }

    private static List<(int Start, int End)> FindForegroundBands(
        int length,
        Func<int, int> sampleAt,
        int activationThreshold,
        int minBandSize,
        int gapTolerance)
    {
        var bands = new List<(int Start, int End)>();
        var inBand = false;
        var bandStart = 0;
        var lastForeground = -1;

        for (var index = 0; index < length; index++)
        {
            var foregroundCount = sampleAt(index);
            if (foregroundCount >= activationThreshold)
            {
                if (!inBand)
                {
                    bandStart = index;
                    inBand = true;
                }

                lastForeground = index;
                continue;
            }

            if (!inBand || lastForeground < 0 || index - lastForeground <= gapTolerance)
            {
                continue;
            }

            if (lastForeground - bandStart + 1 >= minBandSize)
            {
                bands.Add((bandStart, lastForeground));
            }

            inBand = false;
            lastForeground = -1;
        }

        if (inBand && lastForeground >= bandStart && lastForeground - bandStart + 1 >= minBandSize)
        {
            bands.Add((bandStart, lastForeground));
        }

        return bands;
    }

    [SupportedOSPlatform("windows")]
    private static Rectangle BuildTightCropRectangle(Bitmap bitmap, (int Start, int End) band, bool splitVertically)
    {
        const int margin = 8;

        if (splitVertically)
        {
            var left = bitmap.Width - 1;
            var right = 0;
            for (var x = 0; x < bitmap.Width; x++)
            {
                var count = 0;
                for (var y = band.Start; y <= band.End; y++)
                {
                    if (IsForegroundPixel(bitmap.GetPixel(x, y)))
                    {
                        count++;
                    }
                }

                if (count < Math.Max(4, (band.End - band.Start + 1) / 80))
                {
                    continue;
                }

                left = Math.Min(left, x);
                right = Math.Max(right, x);
            }

            if (right <= left)
            {
                return Rectangle.Empty;
            }

            var xStart = Math.Max(0, left - margin);
            var yStart = Math.Max(0, band.Start - margin);
            var xEnd = Math.Min(bitmap.Width - 1, right + margin);
            var yEnd = Math.Min(bitmap.Height - 1, band.End + margin);
            return Rectangle.FromLTRB(xStart, yStart, xEnd + 1, yEnd + 1);
        }

        var top = bitmap.Height - 1;
        var bottom = 0;
        for (var y = 0; y < bitmap.Height; y++)
        {
            var count = 0;
            for (var x = band.Start; x <= band.End; x++)
            {
                if (IsForegroundPixel(bitmap.GetPixel(x, y)))
                {
                    count++;
                }
            }

            if (count < Math.Max(4, (band.End - band.Start + 1) / 80))
            {
                continue;
            }

            top = Math.Min(top, y);
            bottom = Math.Max(bottom, y);
        }

        if (bottom <= top)
        {
            return Rectangle.Empty;
        }

        var xStartHorizontal = Math.Max(0, band.Start - margin);
        var yStartHorizontal = Math.Max(0, top - margin);
        var xEndHorizontal = Math.Min(bitmap.Width - 1, band.End + margin);
        var yEndHorizontal = Math.Min(bitmap.Height - 1, bottom + margin);
        return Rectangle.FromLTRB(xStartHorizontal, yStartHorizontal, xEndHorizontal + 1, yEndHorizontal + 1);
    }

    [SupportedOSPlatform("windows")]
    private static int CountForegroundPixelsInRow(Bitmap bitmap, int y)
    {
        var count = 0;
        for (var x = 0; x < bitmap.Width; x++)
        {
            if (IsForegroundPixel(bitmap.GetPixel(x, y)))
            {
                count++;
            }
        }

        return count;
    }

    [SupportedOSPlatform("windows")]
    private static int CountForegroundPixelsInColumn(Bitmap bitmap, int x)
    {
        var count = 0;
        for (var y = 0; y < bitmap.Height; y++)
        {
            if (IsForegroundPixel(bitmap.GetPixel(x, y)))
            {
                count++;
            }
        }

        return count;
    }

    private static bool IsForegroundPixel(Color pixel) =>
        pixel.A > 0 && (pixel.R < 245 || pixel.G < 245 || pixel.B < 245);

    [SupportedOSPlatform("windows")]
    private static string? TryCropBitmapToDataUrl(Bitmap source, Rectangle cropRectangle)
    {
        if (cropRectangle == Rectangle.Empty ||
            cropRectangle.Width <= 0 ||
            cropRectangle.Height <= 0 ||
            cropRectangle.Right > source.Width ||
            cropRectangle.Bottom > source.Height)
        {
            return null;
        }

        using var cropped = new Bitmap(cropRectangle.Width, cropRectangle.Height);
        using (var graphics = Graphics.FromImage(cropped))
        {
            graphics.Clear(Color.White);
            graphics.DrawImage(
                source,
                new Rectangle(0, 0, cropRectangle.Width, cropRectangle.Height),
                cropRectangle,
                GraphicsUnit.Pixel);
        }

        using var outputStream = new MemoryStream();
        cropped.Save(outputStream, ImageFormat.Png);
        return $"data:image/png;base64,{Convert.ToBase64String(outputStream.ToArray())}";
    }

    private static List<(PdfExtractedPage Page, int Score)> RankVisualPreviewPages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);
        var instructionTokens = BuildComparableSearchTokens(group.Instruction);
        var questionTokens = BuildComparableSearchTokens(group.QuestionPreview);

        return pages
            .Select(page => (
                Page: page,
                Score: ScoreVisualPreviewPage(page, rangeRegex, instructionTokens, questionTokens)))
            .Where(item => item.Score > 0 && item.Page.Images.Count > 0)
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Page.Images.Count)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();
    }

    private static int ScoreVisualPreviewPage(
        PdfExtractedPage page,
        Regex rangeRegex,
        IReadOnlyList<string> instructionTokens,
        IReadOnlyList<string> questionTokens)
    {
        var comparableText = NormalizeComparableText(page.RawText);
        var score = 0;

        if (rangeRegex.IsMatch(page.RawText))
        {
            score += 8;
        }

        var instructionMatchCount = CountComparableTokenMatches(comparableText, instructionTokens);
        if (instructionMatchCount > 0)
        {
            score += Math.Min(6, instructionMatchCount * 2);
        }

        var questionMatchCount = CountComparableTokenMatches(comparableText, questionTokens);
        if (questionMatchCount > 0)
        {
            score += Math.Min(6, questionMatchCount * 2);
        }

        if (page.Images.Count > 0)
        {
            score += 1;
        }

        return score;
    }

    private static int CountComparableTokenMatches(string comparableText, IReadOnlyList<string> tokens)
    {
        if (string.IsNullOrWhiteSpace(comparableText) || tokens.Count == 0)
        {
            return 0;
        }

        return tokens.Count(token => comparableText.Contains(token, StringComparison.Ordinal));
    }

    private static IReadOnlyList<string> BuildComparableSearchTokens(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return [];
        }

        return Regex.Matches(source, @"[A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length >= 3)
            .Select(token => token.ToUpperInvariant())
            .Where(token =>
                token is not "ACCESS" and
                not "PAGE" and
                not "QUESTIONS" and
                not "QUESTION" and
                not "PRACTICES")
            .Distinct()
            .Take(12)
            .ToList();
    }

    private static string NormalizeComparableText(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return string.Empty;
        }

        var tokens = Regex.Matches(source, @"[A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length > 0)
            .Select(token => token.ToUpperInvariant());

        return string.Join(' ', tokens);
    }
}
