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

    private async Task<int> TryRecoverMissingOptionsAsync(
        List<GemmaPassagePayload> parsedPassages,
        string rawText,
        CancellationToken cancellationToken)
    {
        var totalApplied = 0;

        try
        {
            var candidates = CollectFallbackOptionCandidates(parsedPassages);
            if (candidates.Count == 0)
            {
                return 0;
            }

            var deterministicOptionMap = ExtractDeterministicOptionMapFromRawText(rawText, candidates);
            if (deterministicOptionMap.Count > 0)
            {
                totalApplied += ApplyRecoveredOptionMap(parsedPassages, deterministicOptionMap);
                candidates = CollectFallbackOptionCandidates(parsedPassages);
                if (candidates.Count == 0)
                {
                    return totalApplied;
                }
            }

            var optionSourceText = PrepareOptionRecoverySource(rawText, candidates);
            if (string.IsNullOrWhiteSpace(optionSourceText))
            {
                return totalApplied;
            }

            var prompt = BuildFallbackOptionPrompt(optionSourceText, candidates);
            var totalAttempts = MaxJsonParseRetries + 1;

            for (var attempt = 1; attempt <= totalAttempts; attempt++)
            {
                string rawResponse;
                try
                {
                    rawResponse = await RequestGemmaCompletionAsync(prompt, cancellationToken);
                }
                catch (Exception ex) when (GemmaApiRetryDelayResolver.TryResolve(ex, out var retryDelay, out var retryReason))
                {
                    logger.LogWarning(
                        ex,
                        "Gemma fallback option recovery transient failure at attempt {Attempt}/{MaxAttempts}. Retry in {RetryDelaySeconds}s. Reason: {Reason}",
                        attempt,
                        totalAttempts,
                        Math.Ceiling(retryDelay.TotalSeconds),
                        retryReason);

                    if (attempt == totalAttempts)
                    {
                        return totalApplied;
                    }

                    await Task.Delay(retryDelay, cancellationToken);
                    continue;
                }

                if (TryDeserializeFallbackOptionMap(rawResponse, out var recoveredOptionMap, out var parseError))
                {
                    if (recoveredOptionMap.Count == 0)
                    {
                        if (attempt == totalAttempts)
                        {
                            return totalApplied;
                        }

                        continue;
                    }

                    var applied = ApplyRecoveredOptionMap(parsedPassages, recoveredOptionMap);
                    if (applied > 0 || attempt == totalAttempts)
                    {
                        return totalApplied + applied;
                    }

                    logger.LogWarning(
                        "Gemma fallback option recovery returned {ReturnedCount} candidate question(s) but none passed validation at attempt {Attempt}/{MaxAttempts}.",
                        recoveredOptionMap.Count,
                        attempt,
                        totalAttempts);
                    continue;
                }

                logger.LogWarning(
                    "Gemma fallback option recovery returned invalid JSON at attempt {Attempt}/{MaxAttempts}: {Error}",
                    attempt,
                    totalAttempts,
                    parseError);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Fallback option recovery failed unexpectedly and will be skipped.");
        }

        return totalApplied;
    }

    private static Dictionary<int, List<string>> ExtractDeterministicOptionMapFromRawText(
        string rawText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        var result = new Dictionary<int, List<string>>();
        if (string.IsNullOrWhiteSpace(rawText) || candidates.Count == 0)
        {
            return result;
        }

        var chooseNCandidates = candidates
            .Where(candidate => string.Equals(candidate.QuestionType, "MCQ_CHOOSE_N", StringComparison.Ordinal))
            .ToList();
        if (chooseNCandidates.Count == 0)
        {
            return result;
        }

        var normalizedText = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var reviewZone = ExtractReviewAndExplanationsZone(normalizedText);

        var rangeSegments = QuestionRangeBoundaryRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Select(match => new QuestionRangeSegment(
                StartQuestion: ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion: ParseOcrQuestionNumber(match.Groups["end"].Value),
                StartIndex: match.Index))
            .Where(segment =>
                segment.StartQuestion >= 1 &&
                segment.StartQuestion <= 40 &&
                segment.EndQuestion >= segment.StartQuestion &&
                segment.EndQuestion <= 40)
            .OrderBy(segment => segment.StartIndex)
            .ToList();

        if (rangeSegments.Count == 0)
        {
            return result;
        }

        var reviewHeadingMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        var reviewStartIndex = reviewHeadingMatch.Success ? reviewHeadingMatch.Index : normalizedText.Length;

        var candidatesByRangeIndex = new Dictionary<int, List<FallbackOptionCandidate>>();
        foreach (var candidate in chooseNCandidates)
        {
            var matchedRangeIndex = -1;
            for (var index = 0; index < rangeSegments.Count; index++)
            {
                var segment = rangeSegments[index];
                if (candidate.QuestionNumber >= segment.StartQuestion &&
                    candidate.QuestionNumber <= segment.EndQuestion)
                {
                    matchedRangeIndex = index;
                    break;
                }
            }

            if (matchedRangeIndex < 0)
            {
                continue;
            }

            if (!candidatesByRangeIndex.TryGetValue(matchedRangeIndex, out var rangeCandidates))
            {
                rangeCandidates = [];
                candidatesByRangeIndex[matchedRangeIndex] = rangeCandidates;
            }

            rangeCandidates.Add(candidate);
        }

        foreach (var pair in candidatesByRangeIndex.OrderBy(pair => pair.Key))
        {
            var snippet = ExtractQuestionRangeSnippet(normalizedText, rangeSegments, pair.Key, reviewStartIndex);
            if (string.IsNullOrWhiteSpace(snippet))
            {
                continue;
            }

            var expectedOptionCount = pair.Value
                .Select(candidate => candidate.ExpectedOptionLabels.Count)
                .DefaultIfEmpty(0)
                .Max();
            var recoveredOptions = ExtractLabeledOptionsFromRawSnippet(snippet, expectedOptionCount);
            if (!HasMeaningfulMcqOptionSet(recoveredOptions) && !string.IsNullOrWhiteSpace(reviewZone))
            {
                recoveredOptions = ExtractLabeledOptionsFromReviewZone(
                    reviewZone,
                    rangeSegments[pair.Key].StartQuestion,
                    rangeSegments[pair.Key].EndQuestion,
                    expectedOptionCount);
            }

            if (!HasMeaningfulMcqOptionSet(recoveredOptions))
            {
                continue;
            }

            foreach (var candidate in pair.Value)
            {
                result[candidate.QuestionNumber] = recoveredOptions;
            }
        }

        return result;
    }

    private static List<string> ExtractLabeledOptionsFromReviewZone(
        string reviewZone,
        int startQuestion,
        int endQuestion,
        int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(reviewZone))
        {
            return [];
        }

        foreach (Match match in ReviewAnswerEntryRegex().Matches(reviewZone))
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var reviewStart, out var reviewEnd))
            {
                continue;
            }

            if (reviewStart != startQuestion || reviewEnd != endQuestion)
            {
                continue;
            }

            var options = ExtractLabeledOptionsFromReviewEntryRaw(match.Groups["raw"].Value, expectedOptionCount);
            if (HasMeaningfulMcqOptionSet(options))
            {
                return options;
            }
        }

        return [];
    }

    private static List<FallbackOptionCandidate> CollectFallbackOptionCandidates(
        IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        var result = new List<FallbackOptionCandidate>();
        var seenQuestionNumbers = new HashSet<int>();
        var fallbackGlobalQuestionNumber = 1;

        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var parsedQuestionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                var effectiveQuestionNumber = parsedQuestionNumber ?? fallbackGlobalQuestionNumber;
                fallbackGlobalQuestionNumber++;

                if (!seenQuestionNumbers.Add(effectiveQuestionNumber))
                {
                    continue;
                }

                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                if (!IsMcqType(mappedType))
                {
                    continue;
                }

                var options = ExtractOptions(question.Options);
                if (HasMeaningfulMcqOptionSet(options))
                {
                    continue;
                }

                result.Add(new FallbackOptionCandidate(
                    QuestionNumber: effectiveQuestionNumber,
                    QuestionType: mappedType,
                    QuestionText: CollapseWhitespaceForPrompt(ReadJsonAsText(question.QuestionText), 260),
                    ExpectedOptionLabels: BuildExpectedOptionLabels(options),
                    CurrentOptions: options
                        .Select(option => CollapseWhitespaceForPrompt(option, 120))
                        .Where(option => !string.IsNullOrWhiteSpace(option))
                        .Take(10)
                        .ToList()));
            }
        }

        return result
            .OrderBy(x => x.QuestionNumber)
            .ToList();
    }

    private static string PrepareOptionRecoverySource(
        string rawText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return string.Empty;
        }

        var normalized = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = RemoveSelectionMarkers(normalized);

        var reviewZone = ExtractReviewAndExplanationsZone(normalized);
        var questionContext = ExtractQuestionContextForOptionRecovery(normalized, candidates);

        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(questionContext))
        {
            parts.Add($"QUESTION_CONTEXT_FROM_RAW_TEXT:\n{questionContext}");
        }

        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            parts.Add($"REVIEW_AND_EXPLANATIONS:\n{reviewZone}");
        }

        if (parts.Count == 0)
        {
            return string.Empty;
        }

        var combined = string.Join("\n\n", parts);
        combined = Regex.Replace(combined, @"\n{3,}", "\n\n");
        if (combined.Length > MaxFallbackOptionSourceCharacters)
        {
            combined = combined[..MaxFallbackOptionSourceCharacters];
        }

        return combined.Trim();
    }

    private static string ExtractQuestionContextForOptionRecovery(
        string normalizedText,
        IReadOnlyList<FallbackOptionCandidate> candidates)
    {
        if (string.IsNullOrWhiteSpace(normalizedText) || candidates.Count == 0)
        {
            return string.Empty;
        }

        var rangeSegments = QuestionRangeBoundaryRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Select(match => new QuestionRangeSegment(
                StartQuestion: ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion: ParseOcrQuestionNumber(match.Groups["end"].Value),
                StartIndex: match.Index))
            .Where(segment =>
                segment.StartQuestion >= 1 &&
                segment.StartQuestion <= 40 &&
                segment.EndQuestion >= segment.StartQuestion &&
                segment.EndQuestion <= 40)
            .OrderBy(segment => segment.StartIndex)
            .ToList();

        if (rangeSegments.Count == 0)
        {
            return string.Empty;
        }

        var reviewHeadingMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        var reviewStartIndex = reviewHeadingMatch.Success ? reviewHeadingMatch.Index : normalizedText.Length;

        var candidateQuestionNumbers = candidates
            .Select(candidate => candidate.QuestionNumber)
            .Where(number => number >= 1 && number <= 40)
            .Distinct()
            .OrderBy(number => number)
            .ToList();
        if (candidateQuestionNumbers.Count == 0)
        {
            return string.Empty;
        }

        var selectedRangeIndexes = new HashSet<int>();
        var snippets = new List<string>();

        foreach (var questionNumber in candidateQuestionNumbers)
        {
            var matchedRangeIndex = -1;
            for (var index = 0; index < rangeSegments.Count; index++)
            {
                var segment = rangeSegments[index];
                if (questionNumber >= segment.StartQuestion && questionNumber <= segment.EndQuestion)
                {
                    matchedRangeIndex = index;
                    break;
                }
            }

            if (matchedRangeIndex < 0 || !selectedRangeIndexes.Add(matchedRangeIndex))
            {
                continue;
            }

            var rangeStartIndex = rangeSegments[matchedRangeIndex].StartIndex;
            var nextRangeStartIndex = matchedRangeIndex < rangeSegments.Count - 1
                ? rangeSegments[matchedRangeIndex + 1].StartIndex
                : reviewStartIndex;

            var snippetEndIndex = Math.Min(reviewStartIndex, nextRangeStartIndex);
            if (snippetEndIndex <= rangeStartIndex)
            {
                snippetEndIndex = Math.Min(normalizedText.Length, rangeStartIndex + 7000);
            }

            var length = snippetEndIndex - rangeStartIndex;
            if (length <= 0)
            {
                continue;
            }

            var snippet = normalizedText.Substring(rangeStartIndex, length).Trim();
            if (snippet.Length > 7000)
            {
                snippet = snippet[..7000].Trim();
            }

            if (!string.IsNullOrWhiteSpace(snippet))
            {
                snippets.Add(snippet);
            }
        }

        return string.Join("\n\n", snippets);
    }

    private static string ExtractQuestionRangeSnippet(
        string normalizedText,
        IReadOnlyList<QuestionRangeSegment> rangeSegments,
        int rangeIndex,
        int reviewStartIndex)
    {
        if (string.IsNullOrWhiteSpace(normalizedText) ||
            rangeIndex < 0 ||
            rangeIndex >= rangeSegments.Count)
        {
            return string.Empty;
        }

        var rangeStartIndex = rangeSegments[rangeIndex].StartIndex;
        var nextRangeStartIndex = rangeIndex < rangeSegments.Count - 1
            ? rangeSegments[rangeIndex + 1].StartIndex
            : reviewStartIndex;

        var snippetEndIndex = Math.Min(reviewStartIndex, nextRangeStartIndex);
        if (snippetEndIndex <= rangeStartIndex)
        {
            snippetEndIndex = Math.Min(normalizedText.Length, rangeStartIndex + 7000);
        }

        var length = snippetEndIndex - rangeStartIndex;
        if (length <= 0)
        {
            return string.Empty;
        }

        var snippet = normalizedText.Substring(rangeStartIndex, length).Trim();
        return snippet.Length > 7000
            ? snippet[..7000].Trim()
            : snippet;
    }

    private static List<string> ExtractLabeledOptionsFromRawSnippet(string snippet, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(snippet))
        {
            return [];
        }

        var normalized = snippet
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = StripInlinePassageFooterNoise(normalized);
        normalized = RemoveSelectionMarkers(normalized);

        var optionBuilders = new Dictionary<char, StringBuilder>();
        var optionOrder = new List<char>();
        char? currentLabel = null;

        foreach (var rawLine in normalized.Split('\n'))
        {
            var line = Regex.Replace(rawLine, @"\s+", " ").Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (QuestionRangeBoundaryRegex().IsMatch(line) ||
                ReviewSectionHeadingRegex().IsMatch(line) ||
                LooseAnswerSectionHeadingRegex().IsMatch(line))
            {
                if (optionOrder.Count > 0)
                {
                    break;
                }

                continue;
            }

            if (PassageNoiseLineRegex().IsMatch(line) ||
                AccessOrPageNoiseRegex().IsMatch(line))
            {
                continue;
            }

            if (TryParseLabeledOptionLine(line, out var label, out var optionText))
            {
                if (!optionBuilders.ContainsKey(label))
                {
                    optionBuilders[label] = new StringBuilder();
                    optionOrder.Add(label);
                }

                currentLabel = label;
                if (!string.IsNullOrWhiteSpace(optionText))
                {
                    if (optionBuilders[label].Length > 0)
                    {
                        optionBuilders[label].Append(' ');
                    }

                    optionBuilders[label].Append(optionText);
                }

                continue;
            }

            if (!currentLabel.HasValue)
            {
                continue;
            }

            if (LeadingQuestionNumberRegex().IsMatch(line))
            {
                break;
            }

            var builder = optionBuilders[currentLabel.Value];
            if (builder.Length > 0)
            {
                builder.Append(' ');
            }

            builder.Append(line);
        }

        var options = optionOrder
            .OrderBy(label => label)
            .Select(label => Regex.Replace(optionBuilders[label].ToString(), @"\s+", " ").Trim())
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Where(option => !IsOptionLabelOnly(option))
            .ToList();

        var compactOptions = ExtractChooseNOptionsFromCompactLabelBlob(normalized, expectedOptionCount);
        if (HasMeaningfulMcqOptionSet(compactOptions) &&
            compactOptions.Count >= options.Count)
        {
            options = compactOptions;
        }

        if (expectedOptionCount > 0)
        {
            if (options.Count < expectedOptionCount)
            {
                return [];
            }

            if (options.Count > expectedOptionCount)
            {
                options = options.Take(expectedOptionCount).ToList();
            }
        }

        return options;
    }
}