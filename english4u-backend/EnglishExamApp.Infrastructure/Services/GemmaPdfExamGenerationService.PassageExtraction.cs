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

    private async Task<GemmaPassagePayload> ExtractPassageWithAdaptiveSegmentationAsync(
        string preparedPassageText,
        int passageNumber,
        int totalPassages,
        Func<int, int, int, int, Task>? onInvalidJson,
        Func<int, int, TimeSpan, string, int, int, Task>? onApiRetry,
        CancellationToken cancellationToken)
    {
        var segments = BuildPassageQuestionSegments(preparedPassageText, passageNumber);
        if (segments.Count <= 1)
        {
            var singlePassageInput = preparedPassageText.Length > MaxPassageInputCharacters
                ? preparedPassageText[..MaxPassageInputCharacters].TrimEnd()
                : preparedPassageText;

            if (singlePassageInput.Length < preparedPassageText.Length)
            {
                logger.LogInformation(
                    "Passage {PassageNumber}/{TotalPassages} was trimmed before Gemma call: {OriginalLength} -> {PreparedLength}",
                    passageNumber,
                    totalPassages,
                    preparedPassageText.Length,
                    singlePassageInput.Length);
            }

            return await ExtractPassageWithRetryAsync(
                singlePassageInput,
                passageNumber,
                totalPassages,
                onInvalidJson: onInvalidJson is null
                    ? null
                    : (attempt, maxAttempts, _) => onInvalidJson(attempt, maxAttempts, 1, 1),
                onApiRetry: onApiRetry is null
                    ? null
                    : (attempt, maxAttempts, retryDelay, reason) => onApiRetry(attempt, maxAttempts, retryDelay, reason, 1, 1),
                cancellationToken: cancellationToken);
        }

        logger.LogInformation(
            "Passage {PassageNumber}/{TotalPassages} was split into {SegmentCount} segment(s) for Gemma extraction.",
            passageNumber,
            totalPassages,
            segments.Count);

        var segmentPayloads = new List<GemmaPassagePayload>(segments.Count);
        for (var segmentIndex = 0; segmentIndex < segments.Count; segmentIndex++)
        {
            var segment = segments[segmentIndex];
            var segmentPayload = await ExtractPassageWithRetryAsync(
                segment.Text,
                passageNumber,
                totalPassages,
                onInvalidJson: onInvalidJson is null
                    ? null
                    : (attempt, maxAttempts, _) => onInvalidJson(attempt, maxAttempts, segmentIndex + 1, segments.Count),
                onApiRetry: onApiRetry is null
                    ? null
                    : (attempt, maxAttempts, retryDelay, reason) => onApiRetry(attempt, maxAttempts, retryDelay, reason, segmentIndex + 1, segments.Count),
                cancellationToken: cancellationToken);

            segmentPayloads.Add(segmentPayload);

            if (segmentIndex < segments.Count - 1)
            {
                await Task.Delay(SegmentDelayBetweenCallsMs, cancellationToken);
            }
        }

        return MergeSegmentedPassagePayload(segmentPayloads, preparedPassageText, passageNumber);
    }

    private List<PassageQuestionSegment> BuildPassageQuestionSegments(string preparedPassageText, int passageNumber)
    {
        if (string.IsNullOrWhiteSpace(preparedPassageText) || preparedPassageText.Length <= MaxSegmentInputCharacters)
        {
            return [];
        }

        var headingMatches = QuestionRangeBoundaryRegex()
            .Matches(preparedPassageText)
            .Cast<Match>()
            .Select(match => new
            {
                Match = match,
                StartQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion = ParseOcrQuestionNumber(match.Groups["end"].Value)
            })
            .Where(item => item.StartQuestion > 0 &&
                           item.EndQuestion >= item.StartQuestion &&
                           item.Match.Index >= 0)
            .OrderBy(item => item.Match.Index)
            .ToList();

        if (headingMatches.Count < 2)
        {
            return [];
        }

        var rawContext = preparedPassageText[..headingMatches[0].Match.Index].Trim();
        var sharedContext = rawContext.Length > MaxSegmentSharedPassageContextCharacters
            ? rawContext[..MaxSegmentSharedPassageContextCharacters].TrimEnd()
            : rawContext;

        var result = new List<PassageQuestionSegment>(headingMatches.Count);
        for (var i = 0; i < headingMatches.Count; i++)
        {
            var blockStart = headingMatches[i].Match.Index;
            var blockEnd = i == headingMatches.Count - 1
                ? preparedPassageText.Length
                : headingMatches[i + 1].Match.Index;
            if (blockEnd <= blockStart)
            {
                continue;
            }

            var block = preparedPassageText[blockStart..blockEnd].Trim();
            if (string.IsNullOrWhiteSpace(block))
            {
                continue;
            }

            var candidateText = string.IsNullOrWhiteSpace(sharedContext)
                ? block
                : $"{sharedContext}\n\n{block}";

            if (candidateText.Length > MaxSegmentInputCharacters)
            {
                var contextLength = string.IsNullOrWhiteSpace(sharedContext) ? 0 : sharedContext.Length + 2;
                var maxBlockLength = Math.Max(1200, MaxSegmentInputCharacters - contextLength);
                var clippedBlock = block.Length > maxBlockLength
                    ? block[..maxBlockLength].TrimEnd()
                    : block;

                candidateText = string.IsNullOrWhiteSpace(sharedContext)
                    ? clippedBlock
                    : $"{sharedContext}\n\n{clippedBlock}";

                if (candidateText.Length > MaxSegmentInputCharacters)
                {
                    candidateText = candidateText[..MaxSegmentInputCharacters].TrimEnd();
                }
            }

            if (candidateText.Length < 200)
            {
                continue;
            }

            result.Add(new PassageQuestionSegment(
                SegmentIndex: i + 1,
                SegmentCount: headingMatches.Count,
                StartQuestion: headingMatches[i].StartQuestion,
                EndQuestion: headingMatches[i].EndQuestion,
                Text: candidateText));
        }

        if (result.Count < 2 && passageNumber >= 3)
        {
            logger.LogWarning(
                "Passage {PassageNumber} appears long but could not be split into reliable question segments. Falling back to single-call extraction.",
                passageNumber);
        }

        return result.Count >= 2 ? result : [];
    }

    private static GemmaPassagePayload MergeSegmentedPassagePayload(
        IReadOnlyList<GemmaPassagePayload> segmentPayloads,
        string preparedPassageText,
        int passageNumber)
    {
        if (segmentPayloads.Count == 0)
        {
            return new GemmaPassagePayload
            {
                PassageTitle = $"Reading Passage {passageNumber}",
                PassageContent = preparedPassageText,
                Questions = []
            };
        }

        var passageTitle = segmentPayloads
            .Select(payload => payload.PassageTitle?.Trim())
            .FirstOrDefault(title => !string.IsNullOrWhiteSpace(title))
            ?? $"Reading Passage {passageNumber}";

        var passageContent = segmentPayloads
            .Select(payload => payload.PassageContent)
            .Where(content => !string.IsNullOrWhiteSpace(content))
            .OrderByDescending(content => content!.Length)
            .FirstOrDefault();

        if (string.IsNullOrWhiteSpace(passageContent))
        {
            passageContent = preparedPassageText;
        }

        var questionsByNumber = new Dictionary<int, GemmaQuestionPayload>();
        var questionsWithoutNumber = new List<GemmaQuestionPayload>();

        foreach (var payload in segmentPayloads)
        {
            foreach (var question in payload.Questions ?? [])
            {
                var parsedNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
                if (!parsedNumber.HasValue || parsedNumber.Value <= 0)
                {
                    questionsWithoutNumber.Add(question);
                    continue;
                }

                if (!questionsByNumber.TryGetValue(parsedNumber.Value, out var existingQuestion))
                {
                    questionsByNumber[parsedNumber.Value] = question;
                    continue;
                }

                var existingScore = ScoreQuestionCompleteness(existingQuestion);
                var incomingScore = ScoreQuestionCompleteness(question);
                if (incomingScore > existingScore)
                {
                    questionsByNumber[parsedNumber.Value] = question;
                }
            }
        }

        var mergedQuestions = questionsByNumber
            .OrderBy(pair => pair.Key)
            .Select(pair => pair.Value)
            .ToList();
        mergedQuestions.AddRange(questionsWithoutNumber);

        return new GemmaPassagePayload
        {
            PassageTitle = passageTitle,
            PassageContent = passageContent,
            Questions = mergedQuestions
        };
    }

    private static int ScoreQuestionCompleteness(GemmaQuestionPayload question)
    {
        var score = 0;

        var questionText = ReadJsonAsText(question.QuestionText);
        if (!string.IsNullOrWhiteSpace(questionText))
        {
            score += 2;
        }

        var options = ExtractOptions(question.Options);
        score += options.Count(option => !IsOptionLabelOnly(option));

        if (!string.IsNullOrWhiteSpace(ReadJsonAsText(question.Answer)))
        {
            score++;
        }

        return score;
    }

    private async Task<GemmaPassagePayload> ExtractPassageWithRetryAsync(
        string passageText,
        int passageNumber,
        int totalPassages,
        Func<int, int, string, Task>? onInvalidJson,
        Func<int, int, TimeSpan, string, Task>? onApiRetry,
        CancellationToken cancellationToken)
    {
        var totalAttempts = MaxJsonParseRetries + 1;

        for (var attempt = 1; attempt <= totalAttempts; attempt++)
        {
            string rawResponse;
            try
            {
                rawResponse = await RequestGemmaPassageAsync(passageText, cancellationToken);
            }
            catch (Exception ex) when (GemmaApiRetryDelayResolver.TryResolve(ex, out var retryDelay, out var retryReason))
            {
                logger.LogWarning(
                    ex,
                    "Gemma API transient failure for passage {PassageNumber}/{TotalPassages} at attempt {Attempt}/{MaxAttempts}. Retry in {RetryDelaySeconds}s. Reason: {Reason}",
                    passageNumber,
                    totalPassages,
                    attempt,
                    totalAttempts,
                    Math.Ceiling(retryDelay.TotalSeconds),
                    retryReason);

                if (onApiRetry is not null)
                {
                    await onApiRetry(attempt, totalAttempts, retryDelay, retryReason);
                }

                if (attempt == totalAttempts)
                {
                    throw;
                }

                await Task.Delay(retryDelay, cancellationToken);
                continue;
            }

            if (TryDeserializePassage(rawResponse, out var payload, out var parseError))
            {
                return payload;
            }

            logger.LogWarning(
                "Gemma returned invalid JSON for passage {PassageNumber}/{TotalPassages} at attempt {Attempt}/{MaxAttempts}: {Error}",
                passageNumber,
                totalPassages,
                attempt,
                totalAttempts,
                parseError);

            if (onInvalidJson is not null)
            {
                await onInvalidJson(attempt, totalAttempts, parseError);
            }
        }

        throw new InvalidOperationException(
            $"Unable to parse Gemma response into JSON for passage {passageNumber} after {totalAttempts} attempts.");
    }

    private Task<string> RequestGemmaPassageAsync(string passageText, CancellationToken cancellationToken) =>
        RequestGemmaCompletionAsync(BuildGemmaCompatiblePrompt(passageText), cancellationToken);

    private Task<string> RequestGemmaCompletionAsync(string prompt, CancellationToken cancellationToken) =>
        gemmaCompletionClient.CompleteAsync(prompt, cancellationToken);
}
