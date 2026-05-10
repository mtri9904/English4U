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

    private static PdfRawQuestionInstructionPreviewDto AttachMatchingVisualPreviewImages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        if (string.Equals(group.GroupType, "MATCHING_VISUALS", StringComparison.Ordinal))
        {
            return AttachDedicatedMatchingVisualPreviewImages(group, pages);
        }

        var matchedPages = FindBestMatchingVisualPreviewPages(group, pages);
        if (matchedPages.Count == 0)
        {
            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF pages for this visual matching set."
            };
        }

        var previewItems = matchedPages
            .SelectMany(page => page.Images
                .OrderByDescending(image => image.PageCoverage)
                .ThenByDescending(image => image.PixelArea)
                .Take(MaxVisualPreviewImagesPerPage)
                .Select(image => new PdfRawVisualPreviewItemDto(
                    ImageDataUrl: image.DataUrl,
                    PageNumber: page.PageNumber)))
            .Take(MaxVisualPreviewPagesPerGroup * MaxVisualPreviewImagesPerPage)
            .ToList();

        if (previewItems.Count == 0)
        {
            var pageNumbers = string.Join(", ", matchedPages.Select(page => page.PageNumber));
            return group with
            {
                VisualPreviewNote = $"Preview unavailable: detected page(s) {pageNumbers}, but no extractable image was found there."
            };
        }

        var previewNote = matchedPages.Count > 1
            ? $"Best-effort preview collected from pages {string.Join(", ", matchedPages.Select(page => page.PageNumber))}."
            : $"Preview extracted from page {matchedPages[0].PageNumber}.";

        return group with
        {
            VisualPreviewItems = previewItems,
            VisualPreviewNote = previewNote
        };
    }

    private static PdfRawQuestionInstructionPreviewDto AttachDedicatedMatchingVisualPreviewImages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var anchorPage = FindDedicatedMatchingVisualAnchorPage(group, pages);
        if (anchorPage is null)
        {
            return group with
            {
                VisualPreviewNote = "Preview unavailable: could not confidently locate the source PDF page for this visual matching set."
            };
        }

        var expectedImageCount = EstimateExpectedMatchingVisualOptionCount(group);
        var anchorPageIndex = pages
            .Select((page, index) => new { page.PageNumber, Index = index })
            .FirstOrDefault(item => item.PageNumber == anchorPage.PageNumber)?
            .Index ?? -1;
        if (anchorPageIndex < 0)
        {
            return group with
            {
                VisualPreviewNote = $"Preview unavailable: located anchor page {anchorPage.PageNumber}, but it could not be resolved in the extracted page list."
            };
        }

        var candidatePages = pages
            .Skip(anchorPageIndex)
            .Take(MaxDedicatedMatchingVisualSearchPages)
            .OrderBy(page => page.PageNumber)
            .ToList();

        var previewItems = new List<PdfRawVisualPreviewItemDto>(expectedImageCount);
        var nextOptionLabel = 'A';
        foreach (var page in candidatePages)
        {
            var candidateImages = GetLikelyMatchingVisualImages(
                page,
                page.PageNumber == anchorPage.PageNumber
                    ? group
                    : null);
            if (candidateImages.Count == 0)
            {
                continue;
            }

            var remaining = Math.Max(0, expectedImageCount - previewItems.Count);
            if (remaining == 0)
            {
                break;
            }

            foreach (var image in candidateImages.Take(MaxVisualPreviewImagesPerPage))
            {
                var splitItems = TrySplitMatchingVisualPreviewItems(
                    image,
                    page.PageNumber,
                    remaining,
                    ref nextOptionLabel);
                if (splitItems.Count == 0)
                {
                    continue;
                }

                previewItems.AddRange(splitItems);
                remaining = Math.Max(0, expectedImageCount - previewItems.Count);
                if (remaining == 0)
                {
                    break;
                }
            }

            if (previewItems.Count >= expectedImageCount)
            {
                break;
            }
        }

        if (previewItems.Count == 0)
        {
            return group with
            {
                VisualPreviewNote = $"Preview unavailable: located anchor page {anchorPage.PageNumber}, but no extractable visual options were found nearby."
            };
        }

        var previewPageNumbers = previewItems
            .Select(item => item.PageNumber)
            .Distinct()
            .OrderBy(pageNumber => pageNumber)
            .ToList();

        var previewNote = previewItems.Count < expectedImageCount
            ? $"Partial preview extracted from page(s) {string.Join(", ", previewPageNumbers)}: found {previewItems.Count} visual item(s), expected about {expectedImageCount}."
            : previewPageNumbers.Count > 1
                ? $"Preview extracted from the visual option pages {string.Join(", ", previewPageNumbers)}."
                : $"Preview extracted from page {previewPageNumbers[0]}.";

        return group with
        {
            VisualPreviewItems = previewItems,
            VisualPreviewNote = previewNote
        };
    }

    private static PdfExtractedPage? FindBestDiagramPreviewPage(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);

        var exactRangePage = pages
            .Where(page => rangeRegex.IsMatch(page.RawText))
            .OrderBy(page => page.PageNumber)
            .FirstOrDefault();
        if (exactRangePage is not null)
        {
            return exactRangePage;
        }

        var anchorTokens = BuildDiagramAnchorTokens(group);
        var scoredPages = pages
            .Select(page => (
                Page: page,
                Score: ScoreDiagramAnchorPage(page, anchorTokens, group.StartQuestion, group.EndQuestion)))
            .Where(item =>
                item.Score >= 10 &&
                CountQuestionNumbersOnPage(item.Page, group.StartQuestion, group.EndQuestion) >= 2)
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();

        return scoredPages.Count == 0
            ? null
            : scoredPages[0].Page;
    }

    private static IReadOnlyList<string> BuildDiagramAnchorTokens(PdfRawQuestionInstructionPreviewDto group)
    {
        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);

        return Regex.Matches(combined, @"[A-Za-z][A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length >= 4)
            .Select(token => token.ToUpperInvariant())
            .Where(token =>
                token is not "QUESTIONS" and
                not "QUESTION" and
                not "WRITE" and
                not "WORDS" and
                not "PASSAGE" and
                not "PRACTICES" and
                not "ACCESS")
            .Distinct()
            .Take(10)
            .ToList();
    }

    private static int ScoreDiagramAnchorPage(
        PdfExtractedPage page,
        IReadOnlyList<string> anchorTokens,
        int startQuestion,
        int endQuestion)
    {
        var comparableText = NormalizeComparableText(page.RawText);
        var score = 0;
        var questionNumberCount = CountQuestionNumbersOnPage(page, startQuestion, endQuestion);

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{startQuestion}\b"))
        {
            score += 3;
        }

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{endQuestion}\b"))
        {
            score += 2;
        }

        var tokenMatches = CountComparableTokenMatches(comparableText, anchorTokens);
        if (tokenMatches > 0)
        {
            score += tokenMatches * 3;
        }

        score += Math.Min(8, questionNumberCount * 2);

        if (page.Images.Count > 0)
        {
            score += 1;
        }

        return score;
    }

    private static int CountQuestionNumbersOnPage(PdfExtractedPage page, int startQuestion, int endQuestion)
    {
        if (page.Words.Count == 0 || endQuestion < startQuestion)
        {
            return 0;
        }

        var expected = Enumerable.Range(startQuestion, endQuestion - startQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);

        return page.Words
            .Select(word => word.Text.Trim())
            .Where(expected.Contains)
            .Distinct(StringComparer.Ordinal)
            .Count();
    }

    private static PdfExtractedPage? FindDedicatedMatchingVisualAnchorPage(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*[-–]\s*{group.EndQuestion}\b",
            RegexOptions.Compiled);

        var exactRangePage = pages
            .Where(page => rangeRegex.IsMatch(page.RawText))
            .OrderBy(page => page.PageNumber)
            .FirstOrDefault();
        if (exactRangePage is not null)
        {
            return exactRangePage;
        }

        var anchorTokens = BuildMatchingVisualAnchorTokens(group);
        var scoredPages = pages
            .Select(page => (
                Page: page,
                Score: ScoreDedicatedMatchingVisualAnchorPage(page, anchorTokens, group.StartQuestion, group.EndQuestion)))
            .Where(item =>
                item.Score >= 8 &&
                Regex.IsMatch(item.Page.RawText, $@"(?i)\b{group.StartQuestion}\b") &&
                Regex.IsMatch(item.Page.RawText, $@"(?i)\b{group.EndQuestion}\b"))
            .OrderByDescending(item => item.Score)
            .ThenBy(item => item.Page.PageNumber)
            .ToList();

        return scoredPages.Count == 0
            ? null
            : scoredPages[0].Page;
    }

    private static int EstimateExpectedMatchingVisualOptionCount(PdfRawQuestionInstructionPreviewDto group)
    {
        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);
        var rangeMatch = Regex.Match(
            combined,
            @"(?i)\b(?:list|lists?|drawing|drawings|diagram|diagrams|figure|figures|image|images|picture|pictures|projection|projections)\s*\(?\s*([A-Z])\s*[-–]\s*([A-Z])\s*\)?");

        if (rangeMatch.Success)
        {
            var start = char.ToUpperInvariant(rangeMatch.Groups[1].Value[0]);
            var end = char.ToUpperInvariant(rangeMatch.Groups[2].Value[0]);
            if (end >= start)
            {
                return Math.Clamp(end - start + 1, 1, MaxVisualPreviewPagesPerGroup * MaxVisualPreviewImagesPerPage);
            }
        }

        return MaxVisualPreviewPagesPerGroup * MaxVisualPreviewImagesPerPage;
    }

    private static IReadOnlyList<string> BuildMatchingVisualAnchorTokens(PdfRawQuestionInstructionPreviewDto group)
    {
        var combined = string.Join(" ", [group.Instruction ?? string.Empty, group.QuestionPreview ?? string.Empty]);

        return Regex.Matches(combined, @"[A-Za-z][A-Za-z0-9]+")
            .Select(match => match.Value.Trim())
            .Where(token => token.Length >= 5)
            .Select(token => token.ToUpperInvariant())
            .Where(token =>
                token is not "QUESTIONS" and
                not "QUESTION" and
                not "CHOOSE" and
                not "DRAWING" and
                not "DRAWINGS" and
                not "MATCH" and
                not "PROJECTION" and
                not "PROJECTIONS" and
                not "PRACTICES" and
                not "ACCESS")
            .Distinct()
            .Take(10)
            .ToList();
    }

    private static int ScoreDedicatedMatchingVisualAnchorPage(
        PdfExtractedPage page,
        IReadOnlyList<string> anchorTokens,
        int startQuestion,
        int endQuestion)
    {
        var comparableText = NormalizeComparableText(page.RawText);
        var score = 0;

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{startQuestion}\b"))
        {
            score += 2;
        }

        if (Regex.IsMatch(page.RawText, $@"(?i)\b{endQuestion}\b"))
        {
            score += 2;
        }

        var tokenMatches = CountComparableTokenMatches(comparableText, anchorTokens);
        if (tokenMatches > 0)
        {
            score += tokenMatches * 3;
        }

        if (page.Images.Any(image => image.PageCoverage >= MinMatchingVisualPageCoverage))
        {
            score += 2;
        }

        return score;
    }

    private static List<PdfExtractedPage> FindBestMatchingVisualPreviewPages(
        PdfRawQuestionInstructionPreviewDto group,
        IReadOnlyList<PdfExtractedPage> pages)
    {
        var rankedPages = RankVisualPreviewPages(group, pages);
        if (rankedPages.Count == 0)
        {
            return [];
        }

        return rankedPages
            .Where(item => item.Score >= 2)
            .Take(MaxVisualPreviewPagesPerGroup)
            .OrderBy(item => item.Page.PageNumber)
            .Select(item => item.Page)
            .ToList();
    }

    private static List<PdfExtractedPageImage> GetImagesRelevantToQuestionBlock(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Images.Count == 0)
        {
            return [];
        }

        var headerBottom = TryGetQuestionHeaderBottomFromPageTop(group, page);
        if (headerBottom is null)
        {
            return GetQuestionRegionFallbackImages(page);
        }

        var margin = Math.Max(8d, page.PageHeight * 0.015d);
        var filtered = page.Images
            .Where(image => image.TopFromPageTop >= headerBottom.Value - margin)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .ToList();

        return filtered.Count > 0
            ? filtered
            : GetQuestionRegionFallbackImages(page);
    }

    private static List<PdfExtractedPageImage> GetQuestionRegionFallbackImages(PdfExtractedPage page)
    {
        var minTop = Math.Max(48d, page.PageHeight * 0.12d);
        var filtered = page.Images
            .Where(image =>
                image.TopFromPageTop >= minTop &&
                image.PageCoverage <= 0.92d)
            .OrderByDescending(image => image.PageCoverage)
            .ThenByDescending(image => image.PixelArea)
            .ToList();

        return filtered.Count > 0
            ? filtered
            : page.Images
                .Where(image => image.PageCoverage <= 0.92d)
                .OrderByDescending(image => image.PageCoverage)
                .ThenByDescending(image => image.PixelArea)
                .ToList();
    }
}