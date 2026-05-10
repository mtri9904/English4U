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



    private static async Task<string> ExtractPdfTextAsync(Stream pdfStream, CancellationToken cancellationToken)
    {
        var extraction = await ExtractPdfTextResultAsync(pdfStream, cancellationToken);
        return extraction.RawText;
    }

    private static async Task<PdfTextExtractionResult> ExtractPdfTextResultAsync(Stream pdfStream, CancellationToken cancellationToken)
    {
        await using var memoryStream = new MemoryStream();
        await pdfStream.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;
        var pdfBytes = memoryStream.ToArray();

        using var document = PdfDocument.Open(memoryStream);
        var stringBuilder = new StringBuilder();
        var pageCount = 0;
        var pages = new List<PdfExtractedPage>();

        foreach (var page in document.GetPages().OrderBy(p => p.Number))
        {
            cancellationToken.ThrowIfCancellationRequested();
            pageCount++;

            var pageWords = ExtractPageWords(page);
            var pageText = ExtractPageText(pageWords, page.Text);
            pages.Add(new PdfExtractedPage(
                PageNumber: page.Number,
                RawText: pageText,
                PageHeight: page.Height,
                Words: pageWords,
                Images: ExtractPreviewablePageImages(page, page.Height)));

            if (string.IsNullOrWhiteSpace(pageText))
            {
                continue;
            }

            stringBuilder.AppendLine(pageText.TrimEnd());
            stringBuilder.AppendLine();
        }

        return new PdfTextExtractionResult(
            RawText: stringBuilder.ToString(),
            PageCount: pageCount,
            Engine: "PdfPig.Page.GetWords",
            Pages: pages,
            PdfBytes: pdfBytes);
    }

    private static List<PdfExtractedWord> ExtractPageWords(Page page)
    {
        var words = page.GetWords().ToList();
        if (words.Count == 0)
        {
            return [];
        }

        return words
            .Select(word =>
            {
                var bounds = word.BoundingBox;
                return new PdfExtractedWord(
                    Text: word.Text,
                    TopFromPageTop: Math.Max(0d, page.Height - bounds.Top),
                    BottomFromPageTop: Math.Max(0d, page.Height - bounds.Bottom),
                    Left: bounds.Left,
                    Right: bounds.Right);
            })
            .ToList();
    }

    private static string ExtractPageText(IReadOnlyList<PdfExtractedWord> words, string? fallbackText)
    {
        if (words.Count == 0)
        {
            return fallbackText ?? string.Empty;
        }

        return string.Join(" ", words.Select(word => word.Text));
    }

    private static IReadOnlyList<PdfExtractedPageImage> ExtractPreviewablePageImages(Page page, double pageHeight)
    {
        var pageArea = Math.Max(1d, page.Width * page.Height);

        return page.GetImages()
            .Select(image => TryBuildPreviewablePageImage(image, pageArea, pageHeight))
            .Where(image => image is not null)
            .Select(image => image!)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .Take(3)
            .ToList();
    }

    private static PdfExtractedPageImage? TryBuildPreviewablePageImage(IPdfImage image, double pageArea, double pageHeight)
    {
        if (image.IsImageMask)
        {
            return null;
        }

        if (image.WidthInSamples < MinDiagramPreviewImageSamples || image.HeightInSamples < MinDiagramPreviewImageSamples)
        {
            return null;
        }

        var dataUrl = TryBuildImageDataUrl(image);
        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            return null;
        }

        var bounds = image.Bounds;
        var pageCoverage = Math.Max(0d, Math.Abs(bounds.Width) * Math.Abs(bounds.Height)) / pageArea;
        var pixelArea = Math.Max(1, image.WidthInSamples) * Math.Max(1, image.HeightInSamples);

        return new PdfExtractedPageImage(
            DataUrl: dataUrl,
            PageCoverage: pageCoverage,
            PixelArea: pixelArea,
            WidthInSamples: image.WidthInSamples,
            HeightInSamples: image.HeightInSamples,
            TopFromPageTop: Math.Max(0d, pageHeight - bounds.Top),
            BottomFromPageTop: Math.Max(0d, pageHeight - bounds.Bottom),
            Left: bounds.Left,
            Right: bounds.Right);
    }

    private static string? TryBuildImageDataUrl(IPdfImage image)
    {
        if (image.TryGetPng(out var pngBytes) &&
            pngBytes is { Length: > 0 } &&
            pngBytes.Length <= MaxRawReviewDiagramPreviewBytes)
        {
            return $"data:image/png;base64,{Convert.ToBase64String(pngBytes)}";
        }

        var rawBytes = image.RawBytes;
        if (rawBytes is not { Count: > 0 } ||
            rawBytes.Count > MaxRawReviewDiagramPreviewBytes ||
            !TryGetSupportedImageMimeType(rawBytes, out var mimeType))
        {
            return null;
        }

        return $"data:{mimeType};base64,{Convert.ToBase64String(rawBytes.ToArray())}";
    }

    private static bool TryGetSupportedImageMimeType(IReadOnlyList<byte> rawBytes, out string mimeType)
    {
        mimeType = string.Empty;
        if (rawBytes.Count >= 8 &&
            rawBytes[0] == 0x89 &&
            rawBytes[1] == 0x50 &&
            rawBytes[2] == 0x4E &&
            rawBytes[3] == 0x47 &&
            rawBytes[4] == 0x0D &&
            rawBytes[5] == 0x0A &&
            rawBytes[6] == 0x1A &&
            rawBytes[7] == 0x0A)
        {
            mimeType = "image/png";
            return true;
        }

        if (rawBytes.Count >= 3 &&
            rawBytes[0] == 0xFF &&
            rawBytes[1] == 0xD8 &&
            rawBytes[2] == 0xFF)
        {
            mimeType = "image/jpeg";
            return true;
        }

        return false;
    }
}
