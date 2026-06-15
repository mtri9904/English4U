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

    private async Task<FallbackAnswerMappingResult> TryApplyFallbackAnswerMappingAsync(
        List<GemmaPassagePayload> parsedPassages,
        string answerZone,
        CancellationToken cancellationToken)
    {
        try
        {
            var candidates = CollectFallbackAnswerCandidates(parsedPassages);
            if (candidates.Count == 0)
            {
                return new FallbackAnswerMappingResult(0, new HashSet<int>());
            }

            var preparedAnswerKey = PrepareAnswerKeyForFallback(answerZone);
            if (string.IsNullOrWhiteSpace(preparedAnswerKey))
            {
                return new FallbackAnswerMappingResult(0, new HashSet<int>());
            }

            var prompt = BuildFallbackAnswerPrompt(preparedAnswerKey, candidates);
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
                        "Gemma fallback answer mapping transient failure at attempt {Attempt}/{MaxAttempts}. Retry in {RetryDelaySeconds}s. Reason: {Reason}",
                        attempt,
                        totalAttempts,
                        Math.Ceiling(retryDelay.TotalSeconds),
                        retryReason);

                    if (attempt == totalAttempts)
                    {
                        return new FallbackAnswerMappingResult(0, new HashSet<int>());
                    }

                    await Task.Delay(retryDelay, cancellationToken);
                    continue;
                }

                if (TryDeserializeFallbackAnswerMap(rawResponse, out var fallbackAnswers, out var parseError))
                {
                    if (fallbackAnswers.Count == 0)
                    {
                        logger.LogWarning(
                            "Gemma fallback answer mapping returned empty answer map at attempt {Attempt}/{MaxAttempts}.",
                            attempt,
                            totalAttempts);

                        if (attempt == totalAttempts)
                        {
                            return new FallbackAnswerMappingResult(0, new HashSet<int>());
                        }

                        continue;
                    }

                    var fallbackResult = ApplyFallbackAnswerMap(parsedPassages, fallbackAnswers);
                    if (fallbackResult.AppliedCount > 0 ||
                        fallbackResult.VerifiedQuestionNumbers.Count > 0 ||
                        attempt == totalAttempts)
                    {
                        return fallbackResult;
                    }

                    logger.LogWarning(
                        "Gemma fallback answer mapping returned {ReturnedCount} answer(s) but none passed validation at attempt {Attempt}/{MaxAttempts}.",
                        fallbackAnswers.Count,
                        attempt,
                        totalAttempts);
                    continue;
                }

                logger.LogWarning(
                    "Gemma fallback answer mapping returned invalid JSON at attempt {Attempt}/{MaxAttempts}: {Error}",
                    attempt,
                    totalAttempts,
                    parseError);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Fallback answer mapping failed unexpectedly and will be skipped.");
        }

        return new FallbackAnswerMappingResult(0, new HashSet<int>());
    }

    private static List<FallbackAnswerCandidate> CollectFallbackAnswerCandidates(IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        var result = new List<FallbackAnswerCandidate>();
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

                var currentAnswer = ReadJsonAsText(question.Answer);
                var hasValidAnswer = !string.IsNullOrWhiteSpace(currentAnswer) &&
                                     IsValidAnswerOverride(question, currentAnswer);

                if (hasValidAnswer || !seenQuestionNumbers.Add(effectiveQuestionNumber))
                {
                    continue;
                }

                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                var questionText = CollapseWhitespaceForPrompt(ReadJsonAsText(question.QuestionText), 240);
                var options = ExtractOptions(question.Options)
                    .Where(option => !string.IsNullOrWhiteSpace(option))
                    .Select(option => CollapseWhitespaceForPrompt(option, 120))
                    .Where(option => !string.IsNullOrWhiteSpace(option))
                    .Take(10)
                    .ToList();

                result.Add(new FallbackAnswerCandidate(
                    QuestionNumber: effectiveQuestionNumber,
                    QuestionType: mappedType,
                    QuestionText: questionText,
                    Options: options,
                    CurrentAnswer: currentAnswer?.Trim() ?? string.Empty));
            }
        }

        return result
            .OrderBy(x => x.QuestionNumber)
            .ToList();
    }

    private static string PrepareAnswerKeyForFallback(string answerZone)
    {
        if (string.IsNullOrWhiteSpace(answerZone))
        {
            return string.Empty;
        }

        var normalized = answerZone
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var reviewZone = ExtractReviewAndExplanationsZone(normalized);
        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            normalized = reviewZone;
        }

        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        var lines = normalized
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var answerLikeLines = lines
            .Where(line =>
                AnswerEntryLineRegex().IsMatch(line) ||
                CompactAnswerBlobRegex().IsMatch(line))
            .Take(500)
            .ToList();

        var compactText = answerLikeLines.Count >= 8
            ? string.Join('\n', answerLikeLines)
            : normalized;

        if (compactText.Length > MaxFallbackAnswerKeyCharacters)
        {
            compactText = compactText[..MaxFallbackAnswerKeyCharacters];
        }

        return compactText.Trim();
    }

    private static string BuildFallbackAnswerPrompt(
        string answerKeyText,
        IReadOnlyList<FallbackAnswerCandidate> candidates)
    {
        var candidatesJson = JsonSerializer.Serialize(
            candidates.Select(candidate => new
            {
                question_number = candidate.QuestionNumber,
                question_type = candidate.QuestionType,
                question_text = candidate.QuestionText,
                options = candidate.Options,
                current_answer = candidate.CurrentAnswer
            }),
            JsonOptions);

        return $"""
            Báº¡n lÃ  bá»™ mÃ¡y bÃ³c tÃ¡ch Ä‘Ã¡p Ã¡n IELTS.
            Nhiá»‡m vá»¥: map Ä‘Ã¡p Ã¡n cho danh sÃ¡ch cÃ¢u há»i dÆ°á»›i Ä‘Ã¢y CHá»ˆ dá»±a vÃ o ANSWER KEY/SOLUTION.

            QUY Táº®C Cá»¨NG:
            - KhÃ´ng tá»± giáº£i Ä‘á», khÃ´ng suy luáº­n theo passage.
            - CHá»ˆ Ä‘Æ°á»£c dÃ¹ng thÃ´ng tin tá»« Review and Explanations.
            - NghiÃªm cáº¥m dÃ¹ng khá»‘i "Solution:" dáº¡ng dÃ­nh chá»¯ (vÃ­ dá»¥: 1C2D3F... hoáº·c 1822A,C,D,E,H).
            - Náº¿u khÃ´ng tÃ¬m tháº¥y Ä‘Ã¡p Ã¡n rÃµ rÃ ng cho cÃ¢u nÃ o thÃ¬ Ä‘á»ƒ answer = "".
            - Náº¿u answer key/review cÃ³ Ä‘Ã¡p Ã¡n rÃµ cho question_number thÃ¬ TUYá»†T Äá»I khÃ´ng Ä‘á»ƒ answer rá»—ng.
            - Vá»›i dáº¡ng Choose N statements cho dáº£i cÃ¢u (vÃ­ dá»¥ 18-22), pháº£i map theo tá»«ng cÃ¢u riÃªng 18, 19, 20, 21, 22; khÃ´ng gá»™p range.
            - Giá»¯ Ä‘Ã¡p Ã¡n Ä‘Ãºng Ä‘á»‹nh dáº¡ng:
              + TFNG: TRUE/FALSE/NOT GIVEN
              + YNNG: YES/NO/NOT GIVEN
              + CÃ¢u chá»n chá»¯ cÃ¡i: A-H
              + Äiá»n tá»«: giá»¯ nguyÃªn tá»«/cá»¥m tá»« trong answer key, khÃ´ng paraphrase.
            - Tráº£ vá» DUY NHáº¤T JSON thuáº§n theo schema object cÃ³ field "answers";
              má»—i pháº§n tá»­ answers pháº£i cÃ³ "question_number" vÃ  "answer".

            QUESTIONS_TO_MAP_JSON:
            {candidatesJson}

            ANSWER_KEY_SOLUTION_TEXT:
            {answerKeyText}
            """;
    }

    private static bool TryDeserializeFallbackAnswerMap(
        string rawResponse,
        out Dictionary<int, string> fallbackAnswers,
        out string error)
    {
        fallbackAnswers = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeFallbackAnswerCandidate(candidate, out fallbackAnswers, out var parseError))
                {
                    return true;
                }

                error = parseError ?? "Unknown parse error";
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeFallbackAnswerCandidate(
        string candidateJson,
        out Dictionary<int, string> fallbackAnswers,
        out string? parseError)
    {
        var workingJson = candidateJson;
        parseError = null;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var payload = DeserializeFallbackAnswerPayload(workingJson);
                fallbackAnswers = ConvertFallbackAnswerPayloadToMap(payload);
                return true;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    break;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                break;
            }
        }

        fallbackAnswers = [];
        return false;
    }

    private static FallbackAnswerResponse DeserializeFallbackAnswerPayload(string json)
    {
        var objectPayload = JsonSerializer.Deserialize<FallbackAnswerResponse>(json, JsonOptions);
        if (objectPayload?.Answers is not null)
        {
            return objectPayload;
        }

        var arrayPayload = JsonSerializer.Deserialize<List<FallbackAnswerItem>>(json, JsonOptions);
        return new FallbackAnswerResponse
        {
            Answers = arrayPayload ?? []
        };
    }

    private static Dictionary<int, string> ConvertFallbackAnswerPayloadToMap(FallbackAnswerResponse payload)
    {
        var map = new Dictionary<int, string>();
        foreach (var item in payload.Answers ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(item.QuestionNumber));
            if (!questionNumber.HasValue || questionNumber.Value <= 0)
            {
                continue;
            }

            var normalizedAnswer = NormalizeFallbackAnswer(item.Answer);
            if (string.IsNullOrWhiteSpace(normalizedAnswer))
            {
                continue;
            }

            map[questionNumber.Value] = normalizedAnswer;
        }

        return map;
    }

    private static FallbackAnswerMappingResult ApplyFallbackAnswerMap(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> fallbackAnswers)
    {
        if (fallbackAnswers.Count == 0)
        {
            return new FallbackAnswerMappingResult(0, new HashSet<int>());
        }

        var applied = 0;
        var verifiedQuestionNumbers = new HashSet<int>();
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

                if (!fallbackAnswers.TryGetValue(effectiveQuestionNumber, out var fallbackAnswer) ||
                    string.IsNullOrWhiteSpace(fallbackAnswer))
                {
                    fallbackGlobalQuestionNumber++;
                    continue;
                }

                var canonicalFallbackAnswer = CanonicalizeAnswerForQuestionType(question, fallbackAnswer);
                if (string.IsNullOrWhiteSpace(canonicalFallbackAnswer) ||
                    !IsValidAnswerOverride(question, canonicalFallbackAnswer))
                {
                    fallbackGlobalQuestionNumber++;
                    continue;
                }

                verifiedQuestionNumbers.Add(effectiveQuestionNumber);

                var currentAnswer = NormalizeFallbackAnswer(ReadJsonAsText(question.Answer));
                var normalizedFallbackAnswer = NormalizeFallbackAnswer(canonicalFallbackAnswer);
                if (!string.Equals(currentAnswer, normalizedFallbackAnswer, StringComparison.Ordinal))
                {
                    question.Answer = JsonSerializer.SerializeToElement(canonicalFallbackAnswer);
                    applied++;
                }

                fallbackGlobalQuestionNumber++;
            }
        }

        return new FallbackAnswerMappingResult(applied, verifiedQuestionNumbers);
    }

    private static string NormalizeFallbackAnswer(string? rawAnswer)
    {
        var sanitized = SanitizeAnswerValue(rawAnswer);
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return string.Empty;
        }

        var normalized = NormalizeToken(sanitized);
        var orderedLetterTokens = SplitAnswerTokensOrdered(sanitized);
        return normalized switch
        {
            "NG" or "NOTGIVEN" => "NOT GIVEN",
            "TRUE" => "TRUE",
            "FALSE" => "FALSE",
            "YES" => "YES",
            "NO" => "NO",
            "NOT GIVEN" => "NOT GIVEN",
            _ when IsSingleLetterAnswerToken(normalized) => normalized,
            _ when orderedLetterTokens.Count > 1 &&
                   orderedLetterTokens.All(IsSingleLetterAnswerToken)
                => string.Join(", ", orderedLetterTokens),
            _ => sanitized
        };
    }

    private static string CanonicalizeAnswerForQuestionType(GemmaQuestionPayload question, string? rawAnswer)
    {
        var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
        var normalized = NormalizeFallbackAnswer(rawAnswer);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var tokens = SplitAnswerTokensOrdered(normalized);
        if (tokens.Count == 0)
        {
            return normalized;
        }

        if (mappedType == "TFNG")
        {
            var mappedTokens = tokens.Select(MapTfngToken).ToList();
            if (mappedTokens.All(token => !string.IsNullOrWhiteSpace(token)))
            {
                return string.Join(", ", mappedTokens);
            }
        }
        else if (mappedType == "YNNG")
        {
            var mappedTokens = tokens.Select(MapYnngToken).ToList();
            if (mappedTokens.All(token => !string.IsNullOrWhiteSpace(token)))
            {
                return string.Join(", ", mappedTokens);
            }
        }
        else if (mappedType == "SENTENCE_COMPLETION")
        {
            return NormalizeFillBlankAlternativeAnswer(normalized);
        }

        return normalized;
    }

    private static string NormalizeFillBlankAlternativeAnswer(string answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return string.Empty;
        }

        var candidate = answer.Trim();
        var hasAlternativeSeparator =
            candidate.Contains('/', StringComparison.Ordinal) ||
            candidate.Contains('|', StringComparison.Ordinal) ||
            candidate.Contains(';', StringComparison.Ordinal) ||
            Regex.IsMatch(candidate, @"(?i)\bor\b");

        if (!hasAlternativeSeparator)
        {
            return candidate;
        }

        var normalizedSeparators = Regex.Replace(candidate, @"(?i)\s+or\s+", "|");
        normalizedSeparators = normalizedSeparators
            .Replace("/", "|", StringComparison.Ordinal)
            .Replace(";", "|", StringComparison.Ordinal);

        var rawParts = normalizedSeparators
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (rawParts.Length <= 1)
        {
            return candidate;
        }

        var parts = new List<string>(rawParts.Length);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rawPart in rawParts)
        {
            var cleanedPart = SanitizeAnswerValue(rawPart);
            if (string.IsNullOrWhiteSpace(cleanedPart))
            {
                continue;
            }

            if (!seen.Add(cleanedPart))
            {
                continue;
            }

            parts.Add(cleanedPart);
        }

        return parts.Count <= 1
            ? candidate
            : string.Join("|", parts);
    }

    private static string MapTfngToken(string token) => token switch
    {
        "TRUE" or "T" => "TRUE",
        "FALSE" or "F" => "FALSE",
        "NG" or "NOTGIVEN" or "NOT GIVEN" => "NOT GIVEN",
        _ => string.Empty
    };

    private static string MapYnngToken(string token) => token switch
    {
        "YES" or "Y" => "YES",
        "NO" or "N" => "NO",
        "NG" or "NOTGIVEN" or "NOT GIVEN" => "NOT GIVEN",
        _ => string.Empty
    };

    private static string CollapseWhitespaceForPrompt(string? text, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var normalized = Regex.Replace(UnescapeExtractedText(text), @"\s+", " ").Trim();
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..maxLength] + "...";
    }
}
