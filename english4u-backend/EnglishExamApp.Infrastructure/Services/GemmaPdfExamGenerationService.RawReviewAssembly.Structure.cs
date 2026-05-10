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

    private async Task<List<IReadOnlyList<PdfRawQuestionInstructionPreviewDto>>> BuildReviewedQuestionGroupPreviewsAsync(
        IReadOnlyList<string> rawPassages,
        IReadOnlyList<PdfExtractedPage> pages,
        byte[] pdfBytes,
        CancellationToken cancellationToken)
    {
        if (rawPassages.Count == 0)
        {
            return [];
        }

        var trace = new List<PdfRawReviewRequestTraceDto>();
        var reviewedQuestionGroupsByPassage = new List<IReadOnlyList<PdfRawQuestionInstructionPreviewDto>>(rawPassages.Count);

        for (var index = 0; index < rawPassages.Count; index++)
        {
            var rawPassageText = rawPassages[index];
            if (string.IsNullOrWhiteSpace(rawPassageText))
            {
                reviewedQuestionGroupsByPassage.Add([]);
                continue;
            }

            var passageSeed = BuildReviewPassageSeed(
                index + 1,
                rawPassageText,
                null,
                null);

            var reviewedQuestionGroups = await ReviewPassageQuestionGroupsAsync(
                passageSeed,
                trace,
                cancellationToken);

            reviewedQuestionGroupsByPassage.Add(AttachDiagramPreviewImages(
                reviewedQuestionGroups,
                pages,
                pdfBytes));

            if (index < rawPassages.Count - 1)
            {
                await Task.Delay(RawReviewDelayBetweenAiCallsMs, cancellationToken);
            }
        }

        return reviewedQuestionGroupsByPassage;
    }

    private static List<PdfRawQuestionInstructionPreviewDto> BuildQuestionGroupInstructionPreviews(
        IReadOnlyList<string> passages)
    {
        var previews = new List<PdfRawQuestionInstructionPreviewDto>();
        for (var index = 0; index < passages.Count; index++)
        {
            previews.AddRange(BuildQuestionGroupInstructionPreviews(index + 1, passages[index]));
        }

        return previews;
    }

    private static IEnumerable<PdfRawQuestionInstructionPreviewDto> BuildQuestionGroupInstructionPreviews(
        int passageNumber,
        string rawPassageText)
    {
        var outlines = ExtractQuestionGroupOutlines(rawPassageText);
        var reviewBlocks = BuildQuestionGroupReviewBlocks(rawPassageText, outlines);
        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);

        return outlines.Select(outline =>
        {
            reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
            var resolvedInstruction = ResolveQuestionGroupInstruction(
                outline.Instruction,
                block?.BlockText,
                rawPassageText,
                outline.StartQuestion,
                outline.EndQuestion);
            return new PdfRawQuestionInstructionPreviewDto(
                PassageNumber: passageNumber,
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                Tags: outline.Tags,
                GroupType: block?.HeuristicGroupType ?? outline.GroupType,
                Instruction: resolvedInstruction ?? string.Empty,
                QuestionPreview: block?.QuestionPreview,
                TypeEvidence: block?.TypeEvidence);
        });
    }

    private static IReadOnlyList<ReadingQuestionGroupOutline> ExtractQuestionGroupOutlines(string? rawPassageText)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return [];
        }

        var baseOutlines = ExtractRawQuestionGroupOutlines(rawPassageText);
        if (baseOutlines.Count == 0)
        {
            return baseOutlines;
        }

        var reviewBlocks = BuildQuestionGroupReviewBlocks(rawPassageText, baseOutlines);
        if (reviewBlocks.Count == 0)
        {
            return baseOutlines;
        }

        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);

        return baseOutlines.Select(outline =>
        {
            if (!reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block))
            {
                return outline;
            }

            return new ReadingQuestionGroupOutline(
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                BoundaryToken: outline.BoundaryToken,
                Tags: outline.Tags,
                Instruction: ResolveQuestionGroupInstruction(
                    outline.Instruction,
                    block.BlockText,
                    rawPassageText,
                    outline.StartQuestion,
                    outline.EndQuestion),
                GroupType: block.HeuristicGroupType ?? outline.GroupType);
        }).ToList();
    }

    private static IReadOnlyList<ReadingQuestionGroupOutline> ExtractRawQuestionGroupOutlines(string? rawPassageText) =>
        ReadingQuestionGroupOutlineParser.Extract(rawPassageText);

    private static PdfRawReviewStructureDto BuildDeterministicReviewStructure(
        IReadOnlyList<string> deterministicPassages,
        string answerZone,
        string reviewZone)
    {
        var passages = deterministicPassages.Count > 0
            ? deterministicPassages
                .Select((rawText, index) => BuildReviewPassageSeed(index + 1, rawText, null, null))
                .ToList()
            : [];

        return new PdfRawReviewStructureDto(
            Passages: passages,
            SolutionSectionRaw: answerZone,
            ReviewSectionRaw: reviewZone);
    }

    private static List<PdfRawReviewPassageSeedDto> NormalizeStructurePassages(
        List<RawReviewStructurePassage>? aiPassages,
        IReadOnlyList<string> deterministicPassages)
    {
        if (aiPassages is null || aiPassages.Count == 0)
        {
            return deterministicPassages
                .Select((rawText, index) => BuildReviewPassageSeed(index + 1, rawText, null, null))
                .ToList();
        }

        var ordered = aiPassages
            .Where(item => item.PassageNumber > 0)
            .OrderBy(item => item.PassageNumber)
            .GroupBy(item => item.PassageNumber)
            .Select(group => group.First())
            .ToList();

        var result = new List<PdfRawReviewPassageSeedDto>(ordered.Count);
        foreach (var item in ordered)
        {
            var deterministicRawText =
                item.PassageNumber - 1 >= 0 && item.PassageNumber - 1 < deterministicPassages.Count
                    ? deterministicPassages[item.PassageNumber - 1]
                    : string.Empty;
            var rawText = !string.IsNullOrWhiteSpace(deterministicRawText)
                ? deterministicRawText
                : string.IsNullOrWhiteSpace(item.RawText)
                    ? string.Empty
                    : CleanPassageChunk(StripTrailingAnswerAndExplanationBlock(item.RawText.Trim()));
            if (string.IsNullOrWhiteSpace(rawText))
            {
                continue;
            }

            result.Add(BuildReviewPassageSeed(
                item.PassageNumber,
                rawText,
                item.Title,
                item.QuestionRange));
        }

        return result.Count > 0
            ? result
            : deterministicPassages
                .Select((rawText, index) => BuildReviewPassageSeed(index + 1, rawText, null, null))
                .ToList();
    }

    private static PdfRawReviewPassageSeedDto BuildReviewPassageSeed(
        int passageNumber,
        string rawText,
        string? title,
        string? questionRange)
    {
        var normalizedRawText = rawText.Trim();
        var normalizedTitle = string.IsNullOrWhiteSpace(title)
            ? $"Reading Passage {passageNumber}"
            : title.Trim();
        var normalizedQuestionRange = string.IsNullOrWhiteSpace(questionRange)
            ? InferPassageQuestionRange(normalizedRawText)
            : questionRange.Trim();

        return new PdfRawReviewPassageSeedDto(
            PassageNumber: passageNumber,
            Title: normalizedTitle,
            QuestionRange: normalizedQuestionRange,
            RawText: normalizedRawText);
    }

    private static string InferPassageQuestionRange(string rawText)
    {
        var outlines = ReadingQuestionGroupOutlineParser.Extract(rawText);
        if (outlines.Count == 0)
        {
            return string.Empty;
        }

        var start = outlines.Min(item => item.StartQuestion);
        var end = outlines.Max(item => item.EndQuestion);
        return BuildQuestionRangeLabel(start, end);
    }

    private static string BuildQuestionRangeLabel(int startQuestion, int endQuestion) =>
        startQuestion == endQuestion
            ? $"Question {startQuestion}"
            : $"Questions {startQuestion}-{endQuestion}";

    private static List<QuestionGroupReviewContextBlock> BuildQuestionGroupReviewBlocks(
        string rawPassageText,
        IReadOnlyList<ReadingQuestionGroupOutline>? sourceOutlines = null)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return [];
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var outlines = (sourceOutlines ?? ExtractRawQuestionGroupOutlines(rawPassageText))
            .OrderBy(outline => outline.StartQuestion)
            .ThenBy(outline => outline.EndQuestion)
            .ToList();
        if (outlines.Count == 0)
        {
            return [];
        }

        var boundaryMarkers = QuestionRangeBoundaryRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Where(match => match.Success &&
                            match.Index >= 0 &&
                            TryParseBoundaryQuestions(match, out _, out _) &&
                            !IsIgnoredQuestionRangeHeading(normalized, match.Index))
            .Select(match =>
            {
                TryParseBoundaryQuestions(match, out var startQuestion, out var endQuestion);
                return (StartQuestion: startQuestion, EndQuestion: endQuestion, Index: match.Index, Length: match.Length);
            })
            .Concat(
                SingleQuestionBoundaryRegex()
                    .Matches(normalized)
                    .Cast<Match>()
                    .Where(match => match.Success &&
                                    match.Index >= 0 &&
                                    TryParseSingleBoundaryQuestion(match, out _) &&
                                    !IsIgnoredQuestionRangeHeading(normalized, match.Index))
                    .Select(match =>
                    {
                        TryParseSingleBoundaryQuestion(match, out var questionNumber);
                        return (StartQuestion: questionNumber, EndQuestion: questionNumber, Index: match.Index, Length: match.Length);
                    }))
            .OrderBy(marker => marker.Index)
            .GroupBy(marker => (marker.StartQuestion, marker.EndQuestion))
            .Select(group => group.First())
            .ToList();
        var contentBoundaryIndex = FindQuestionGroupContentBoundaryIndex(normalized);
        var result = new List<QuestionGroupReviewContextBlock>(outlines.Count);
        var minSearchIndex = 0;
        foreach (var outline in outlines)
        {
            var boundaryCandidates = boundaryMarkers
                .Where(marker =>
                    marker.Index >= minSearchIndex &&
                    marker.StartQuestion == outline.StartQuestion &&
                    marker.EndQuestion == outline.EndQuestion)
                .ToList();

            if (boundaryCandidates.Count == 0)
            {
                var fallbackInstruction = ResolveQuestionGroupInstruction(
                    outline.Instruction,
                    null,
                    rawPassageText,
                    outline.StartQuestion,
                    outline.EndQuestion);
                var (fallbackType, fallbackEvidence) = InferQuestionGroupTypeAndEvidence(
                    fallbackInstruction,
                    null,
                    null,
                    outline.GroupType,
                    outline.StartQuestion,
                    outline.EndQuestion);
                result.Add(new QuestionGroupReviewContextBlock(
                    StartQuestion: outline.StartQuestion,
                    EndQuestion: outline.EndQuestion,
                    Tags: outline.Tags,
                    Instruction: fallbackInstruction ?? string.Empty,
                    QuestionPreview: null,
                    BlockText: null,
                    HeuristicGroupType: fallbackType,
                    TypeEvidence: fallbackEvidence));
                continue;
            }

            var boundaryMarker = boundaryCandidates[0];

            minSearchIndex = boundaryMarker.Index + 1;
            var questionStartIndex = FindQuestionStartAfterIndex(normalized, outline.StartQuestion, boundaryMarker.Index + boundaryMarker.Length);
            var nextBoundaryIndex = boundaryMarkers
                .Where(marker => marker.Index > Math.Max(questionStartIndex, boundaryMarker.Index))
                .Select(marker => marker.Index)
                .DefaultIfEmpty(contentBoundaryIndex)
                .First();
            nextBoundaryIndex = Math.Min(nextBoundaryIndex, contentBoundaryIndex);
            if (nextBoundaryIndex <= boundaryMarker.Index)
            {
                nextBoundaryIndex = contentBoundaryIndex > boundaryMarker.Index
                    ? contentBoundaryIndex
                    : normalized.Length;
            }

            var blockText = normalized[boundaryMarker.Index..Math.Min(normalized.Length, nextBoundaryIndex)].Trim();
            var resolvedInstruction = ResolveQuestionGroupInstruction(
                outline.Instruction,
                blockText,
                rawPassageText,
                outline.StartQuestion,
                outline.EndQuestion);
            var questionPreview = BuildQuestionPreview(blockText, resolvedInstruction, outline.StartQuestion);
            var (heuristicType, typeEvidence) = InferQuestionGroupTypeAndEvidence(
                resolvedInstruction,
                questionPreview,
                blockText,
                outline.GroupType,
                outline.StartQuestion,
                outline.EndQuestion);

            result.Add(new QuestionGroupReviewContextBlock(
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                Tags: outline.Tags,
                Instruction: resolvedInstruction ?? string.Empty,
                QuestionPreview: questionPreview,
                BlockText: blockText,
                HeuristicGroupType: heuristicType,
                TypeEvidence: typeEvidence));
        }

        return result;
    }

    private static bool TryParseBoundaryQuestions(Match match, out int startQuestion, out int endQuestion)
    {
        startQuestion = -1;
        endQuestion = -1;
        if (match is null || !match.Success)
        {
            return false;
        }

        startQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value);
        endQuestion = ParseOcrQuestionNumber(match.Groups["end"].Value);
        return startQuestion is >= 1 and <= 40 &&
               endQuestion >= startQuestion &&
               endQuestion <= 40;
    }

    private static bool TryParseSingleBoundaryQuestion(Match match, out int questionNumber)
    {
        questionNumber = -1;
        if (match is null || !match.Success)
        {
            return false;
        }

        questionNumber = ParseOcrQuestionNumber(match.Groups["number"].Value);
        return questionNumber is >= 1 and <= 40;
    }

    private static bool IsIgnoredQuestionRangeHeading(string text, int index)
    {
        var line = ExtractLineAt(text, index);
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var normalizedLine = Regex.Replace(line, @"\s+", " ").Trim();
        return PassageQuestionIntroLineRegex().IsMatch(normalizedLine);
    }

    private static string ExtractLineAt(string text, int index)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        index = Math.Clamp(index, 0, text.Length - 1);
        var lineStart = text.LastIndexOf('\n', index);
        lineStart = lineStart < 0 ? 0 : lineStart + 1;
        var lineEnd = text.IndexOf('\n', index);
        lineEnd = lineEnd < 0 ? text.Length : lineEnd;
        return text[lineStart..lineEnd];
    }

    private static int FindQuestionStartAfterIndex(string text, int questionNumber, int startIndex)
    {
        if (string.IsNullOrWhiteSpace(text) || questionNumber <= 0)
        {
            return -1;
        }

        startIndex = Math.Clamp(startIndex, 0, text.Length);
        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var patterns = new[]
        {
            $@"(?<number>{escapedQuestionNumber})(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'â€œâ€˜(\[])",
            $@"(?<number>{escapedQuestionNumber})(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=[A-Za-z""'â€œâ€˜(\[])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(text[startIndex..], pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, startIndex + match.Index);
            }
        }

        return bestIndex == int.MaxValue ? -1 : bestIndex;
    }
}
