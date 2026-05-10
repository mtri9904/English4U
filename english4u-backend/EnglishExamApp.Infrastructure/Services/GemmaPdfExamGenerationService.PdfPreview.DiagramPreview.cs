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

    private static List<PdfRawQuestionInstructionPreviewDto> AttachDiagramPreviewImages(
        IReadOnlyList<PdfRawQuestionInstructionPreviewDto> questionGroups,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes)
    {
        if (questionGroups.Count == 0 || pages.Count == 0)
        {
            return questionGroups.ToList();
        }

        return questionGroups
            .Select(group => AttachGroupVisualPreview(group, pages, pdfBytes))
            .ToList();
    }

    private static PdfRawQuestionInstructionPreviewDto AttachGroupVisualPreview(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes)
    {
        if (string.Equals(group.GroupType, "MAP_LABELLING", StringComparison.Ordinal) ||
            string.Equals(group.GroupType, "FLOWCHART_COMPLETION", StringComparison.Ordinal))
        {
            return AttachDiagramPreviewImage(group, pages, pdfBytes);
        }

        return ShouldAttachMatchingVisualPreview(group)
            ? AttachMatchingVisualPreviewImages(group, pages)
            : group;
    }

    private static bool ShouldAttachMatchingVisualPreview(PdfRawQuestionInstructionPreviewDto group)
    {
        if (!string.Equals(group.GroupType, "MATCHING_VISUALS", StringComparison.Ordinal))
        {
            return false;
        }

        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);
        return Regex.IsMatch(
            combined,
            @"(?i)\b(drawings?|diagrams?|figures?|maps?|plans?|pictures?|photos?|images?|illustrations?|projections?)\b");
    }

    private static PdfRawQuestionInstructionPreviewDto AttachDiagramPreviewImage(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes)
    {
        var candidates = FindDiagramPreviewCandidates(group, pages);
        if (candidates.Count == 0)
        {
            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this diagram.",
                DiagramPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this diagram."
            };
        }

        foreach (var candidate in candidates)
        {
            var renderedPreviewDataUrl = TryRenderDiagramPreviewDataUrl(pdfBytes, candidate.Page.PageNumber, candidate.CropBounds);
            if (!string.IsNullOrWhiteSpace(renderedPreviewDataUrl))
            {
                return group with
                {
                    VisualPreviewItems =
                    [
                        new PdfRawVisualPreviewItemDto(
                            ImageDataUrl: renderedPreviewDataUrl,
                            PageNumber: candidate.Page.PageNumber)
                    ],
                    VisualPreviewNote = $"Preview rendered from page {candidate.Page.PageNumber}.",
                    DiagramPreviewImageDataUrl = renderedPreviewDataUrl,
                    DiagramPreviewPageNumber = candidate.Page.PageNumber,
                    DiagramPreviewNote = $"Preview rendered from page {candidate.Page.PageNumber}."
                };
            }
        }

        foreach (var candidate in candidates)
        {
            var relevantImages = GetImagesRelevantToQuestionBlock(group, candidate.Page);
            if (relevantImages.Count == 0)
            {
                continue;
            }

            var previewImage = relevantImages[0];
            return group with
            {
                VisualPreviewItems =
                [
                    new PdfRawVisualPreviewItemDto(
                        ImageDataUrl: previewImage.DataUrl,
                        PageNumber: candidate.Page.PageNumber)
                ],
                VisualPreviewNote = relevantImages.Count > 1
                    ? $"Best-effort preview from the largest extractable image on page {candidate.Page.PageNumber}."
                    : $"Preview extracted from page {candidate.Page.PageNumber}.",
                DiagramPreviewImageDataUrl = previewImage.DataUrl,
                DiagramPreviewPageNumber = candidate.Page.PageNumber,
                DiagramPreviewNote = relevantImages.Count > 1
                    ? $"Best-effort preview from the largest extractable image on page {candidate.Page.PageNumber}."
                    : $"Preview extracted from page {candidate.Page.PageNumber}."
            };
        }

        var firstCandidatePage = candidates[0].Page.PageNumber;

        return group with
        {
            VisualPreviewNote = $"Preview unavailable: detected page {firstCandidatePage}, but no extractable image was found there.",
            DiagramPreviewPageNumber = firstCandidatePage,
            DiagramPreviewNote = $"Preview unavailable: detected page {firstCandidatePage}, but no extractable image was found there."
        };
    }

    private static List<(PdfExtractedPage Page, DiagramPreviewCropBounds CropBounds, int Score)> FindDiagramPreviewCandidates(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var anchorPage = FindBestDiagramPreviewPage(group, pages);
        if (anchorPage is null)
        {
            return [];
        }

        var anchorIndex = pages
            .Select((page, index) => new { page.PageNumber, Index = index })
            .FirstOrDefault(item => item.PageNumber == anchorPage.PageNumber)?
            .Index ?? -1;
        if (anchorIndex < 0)
        {
            return [];
        }

        return pages
            .Skip(anchorIndex)
            .Take(3)
            .Select((page, offset) => new
            {
                Page = page,
                Offset = offset,
                CropBounds = TryBuildDiagramPreviewCrop(group, page)
                    ?? TryBuildContinuationDiagramPreviewCrop(group, page)
            })
            .Where(item => item.CropBounds is not null)
            .Select(item => (
                Page: item.Page,
                CropBounds: item.CropBounds!,
                Score: ScoreDiagramPreviewCandidate(group, item.Page, item.CropBounds!, item.Offset)))
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();
    }

    private static int ScoreDiagramPreviewCandidate(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds,
        int pageOffsetFromAnchor)
    {
        var score = 0;
        var cropWordCount = CountWordsInsideDiagramCrop(page, cropBounds);
        var cropLineCount = CountLinesInsideDiagramCrop(page, cropBounds);
        var cropComparableText = BuildDiagramCropComparableText(page, cropBounds);
        var questionTokenMatches = CountComparableTokenMatches(
            cropComparableText,
            BuildComparableSearchTokens(group.QuestionPreview));
        var expectedQuestionNumberCount = CountExpectedQuestionNumbersInsideDiagramCrop(group, page, cropBounds);
        var foreignQuestionNumberCount = CountForeignQuestionNumbersInsideDiagramCrop(group, page, cropBounds);

        if (cropBounds.HasExplicitBottomBoundary)
        {
            score += 80;
        }

        if (cropBounds.HasExplicitInstructionBoundary)
        {
            score += 35;
        }

        score += Math.Min(50, cropWordCount * 2);
        score += Math.Min(18, cropLineCount * 3);
        score += Math.Max(0, 20 - (pageOffsetFromAnchor * 5));
        score += Math.Min(10, page.Images.Count * 2);
        score += Math.Min(40, questionTokenMatches * 4);
        score += Math.Min(70, expectedQuestionNumberCount * 18);

        if (foreignQuestionNumberCount > 0)
        {
            score -= Math.Min(120, foreignQuestionNumberCount * 24);
        }

        if (!cropBounds.HasExplicitBottomBoundary && cropWordCount <= 8)
        {
            score -= 40;
        }

        if (!cropBounds.HasExplicitBottomBoundary && cropLineCount <= 2)
        {
            score -= 20;
        }

        if (pageOffsetFromAnchor > 0 &&
            !cropBounds.HasExplicitInstructionBoundary &&
            expectedQuestionNumberCount == 0)
        {
            score -= 70;
        }

        if (pageOffsetFromAnchor > 0 && foreignQuestionNumberCount > expectedQuestionNumberCount)
        {
            score -= 50;
        }

        return score;
    }

    private static int CountWordsInsideDiagramCrop(PdfExtractedPage page, DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return page.Words.Count(word =>
        {
            var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
            return center >= top && center <= bottom;
        });
    }

    private static int CountLinesInsideDiagramCrop(PdfExtractedPage page, DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return BuildPdfWordLines(page.Words)
            .Count(line =>
            {
                var center = (line.TopFromPageTop + line.BottomFromPageTop) / 2d;
                return center >= top && center <= bottom;
            });
    }

    private static string BuildDiagramCropComparableText(
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        var cropText = string.Join(
            ' ',
            page.Words
                .Where(word =>
                {
                    var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
                    return center >= top && center <= bottom;
                })
                .Select(word => word.Text));

        return NormalizeComparableText(cropText);
    }

    private static int CountExpectedQuestionNumbersInsideDiagramCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return ExtractQuestionNumbersInsideDiagramCrop(page, cropBounds)
            .Count(number => expectedNumbers.Contains(number));
    }

    private static int CountForeignQuestionNumbersInsideDiagramCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return ExtractQuestionNumbersInsideDiagramCrop(page, cropBounds)
            .Count(number => !expectedNumbers.Contains(number));
    }

    private static HashSet<string> ExtractQuestionNumbersInsideDiagramCrop(
        PdfExtractedPage page,
        DiagramPreviewCropBounds cropBounds)
    {
        var top = page.PageHeight * cropBounds.TopRatio;
        var bottom = page.PageHeight * cropBounds.BottomRatio;

        return page.Words
            .Where(word =>
            {
                var center = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
                return center >= top && center <= bottom;
            })
            .Select(word => word.Text.Trim())
            .Where(text => Regex.IsMatch(text, @"^\d{1,2}$"))
            .ToHashSet(StringComparer.Ordinal);
    }
}