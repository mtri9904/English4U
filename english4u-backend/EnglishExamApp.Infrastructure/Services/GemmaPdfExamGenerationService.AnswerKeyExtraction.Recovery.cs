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

    private static bool ShouldTriggerAiAnswerKeyRecovery(
        IReadOnlyDictionary<int, string> deterministicAnswerKeyMap,
        string answerZone)
    {
        if (deterministicAnswerKeyMap.Count < 28)
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(answerZone))
        {
            return true;
        }

        var suspiciousCount = deterministicAnswerKeyMap.Values
            .Count(value =>
                string.IsNullOrWhiteSpace(value) ||
                value.Length > 50 ||
                AnswerKeyNoiseHintRegex().IsMatch(value));

        return suspiciousCount >= 3;
    }

    private static bool ShouldPreferAiAnswerKeyMap(
        IReadOnlyDictionary<int, string> deterministicAnswerKeyMap,
        IReadOnlyDictionary<int, string> aiAnswerKeyMap)
    {
        if (aiAnswerKeyMap.Count == 0)
        {
            return false;
        }

        if (deterministicAnswerKeyMap.Count == 0)
        {
            return true;
        }

        var deterministicScore = ComputeAnswerKeyQualityScore(deterministicAnswerKeyMap);
        var aiScore = ComputeAnswerKeyQualityScore(aiAnswerKeyMap);
        return aiScore > deterministicScore + 3;
    }

    private static int CountNoisyAnswerKeyEntries(IReadOnlyDictionary<int, string> answerKeyMap)
    {
        if (answerKeyMap.Count == 0)
        {
            return 0;
        }

        return answerKeyMap.Values.Count(value => !IsStrictAnswerKeyValue(value));
    }

    private static Dictionary<int, string> BuildStrictDeterministicBackfill(
        IReadOnlyDictionary<int, string> deterministicAnswerKeyMap,
        IReadOnlyDictionary<int, string> primaryAnswerKeyMap)
    {
        var backfill = new Dictionary<int, string>();
        foreach (var pair in deterministicAnswerKeyMap)
        {
            if (pair.Key is < 1 or > 40 || primaryAnswerKeyMap.ContainsKey(pair.Key))
            {
                continue;
            }

            var normalized = NormalizeFallbackAnswer(pair.Value);
            if (!IsStrictAnswerKeyValue(normalized))
            {
                continue;
            }

            backfill[pair.Key] = normalized;
        }

        return backfill;
    }

    private static bool IsStrictAnswerKeyValue(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return false;
        }

        var normalized = NormalizeFallbackAnswer(rawValue);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (normalized.Length > 60 || AnswerKeyNoiseHintRegex().IsMatch(normalized))
        {
            return false;
        }

        return IsLikelyDirectAnswerToken(normalized);
    }

    private static int ComputeAnswerKeyQualityScore(IReadOnlyDictionary<int, string> answerKeyMap)
    {
        if (answerKeyMap.Count == 0)
        {
            return int.MinValue;
        }

        var score = answerKeyMap.Count * 2;
        foreach (var answer in answerKeyMap.Values)
        {
            var normalized = NormalizeFallbackAnswer(answer);
            if (string.IsNullOrWhiteSpace(normalized))
            {
                score -= 4;
                continue;
            }

            if (AnswerKeyNoiseHintRegex().IsMatch(normalized))
            {
                score -= 4;
            }

            if (normalized.Length > 50)
            {
                score -= 2;
            }

            if (IsLikelyDirectAnswerToken(normalized))
            {
                score += 3;
            }
        }

        return score;
    }

    private static string PrepareRawTextForAiAnswerKeyRecovery(string normalizedRawText)
    {
        if (string.IsNullOrWhiteSpace(normalizedRawText))
        {
            return string.Empty;
        }

        var answerZone = ExtractAnswerZone(normalizedRawText);
        var reviewZone = ExtractReviewAndExplanationsZone(normalizedRawText);
        var compactSolutionZone = ExtractCompactSolutionZone(normalizedRawText);
        var reviewAnswerHints = BuildReviewAnswerHints(normalizedRawText);
        var trailingStart = (int)(normalizedRawText.Length * 0.55d);
        trailingStart = Math.Clamp(trailingStart, 0, Math.Max(0, normalizedRawText.Length - 1));
        var trailingChunk = normalizedRawText[trailingStart..];

        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(reviewAnswerHints))
        {
            parts.Add($"REVIEW_ANSWER_HINTS:\n{reviewAnswerHints}");
        }

        if (!string.IsNullOrWhiteSpace(compactSolutionZone))
        {
            parts.Add($"COMPACT_SOLUTION_ZONE:\n{compactSolutionZone}");
        }

        if (!string.IsNullOrWhiteSpace(answerZone))
        {
            parts.Add($"ANSWER_ZONE:\n{ClipForAiSource(answerZone.Trim(), 9000)}");
        }

        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            parts.Add($"REVIEW_AND_EXPLANATIONS:\n{ClipForAiSource(reviewZone.Trim(), 12000)}");
        }

        if (!string.IsNullOrWhiteSpace(trailingChunk))
        {
            parts.Add($"TRAILING_RAW_TEXT:\n{ClipForAiSource(trailingChunk.Trim(), 8000, fromEnd: true)}");
        }

        if (parts.Count == 0)
        {
            parts.Add(ClipForAiSource(normalizedRawText.Trim(), 12000, fromEnd: true));
        }

        var combined = string.Join("\n\n", parts);
        combined = Regex.Replace(combined, @"\n{3,}", "\n\n");
        if (combined.Length > MaxAiAnswerKeySourceCharacters)
        {
            var headLength = Math.Min((int)(MaxAiAnswerKeySourceCharacters * 0.65d), combined.Length);
            var tailLength = Math.Min(MaxAiAnswerKeySourceCharacters - headLength - 32, Math.Max(0, combined.Length - headLength));
            var head = combined[..headLength];
            var tail = tailLength > 0 ? combined[^tailLength..] : string.Empty;
            combined = $"{head}\n\n[...TRUNCATED...]\n\n{tail}";
        }

        return combined.Trim();
    }

    private static string ClipForAiSource(string value, int maxChars, bool fromEnd = false)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length <= maxChars)
        {
            return value.Trim();
        }

        return fromEnd
            ? value[^maxChars..].Trim()
            : value[..maxChars].Trim();
    }

    private static string ExtractCompactSolutionZone(string normalizedRawText)
    {
        if (string.IsNullOrWhiteSpace(normalizedRawText))
        {
            return string.Empty;
        }

        var solutionMatch = InlineSolutionHeadingRegex().Match(normalizedRawText);
        if (!solutionMatch.Success)
        {
            return string.Empty;
        }

        var start = solutionMatch.Index;
        if (start < 0 || start >= normalizedRawText.Length)
        {
            return string.Empty;
        }

        var reviewMatch = ReviewSectionHeadingRegex()
            .Matches(normalizedRawText)
            .Cast<Match>()
            .FirstOrDefault(match => match.Success && match.Index > start);
        var end = reviewMatch is not null
            ? reviewMatch.Index
            : Math.Min(normalizedRawText.Length, start + 8000);

        if (end <= start)
        {
            return string.Empty;
        }

        return normalizedRawText[start..end].Trim();
    }

    private static string BuildReviewAnswerHints(string normalizedRawText)
    {
        if (string.IsNullOrWhiteSpace(normalizedRawText))
        {
            return string.Empty;
        }

        var lines = new List<string>();
        foreach (Match match in ReviewAnswerEntryRegex().Matches(normalizedRawText))
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var startQuestion, out var endQuestion))
            {
                continue;
            }

            var answer = ExtractAnswerFromReviewEntryRaw(match.Groups["raw"].Value);
            if (!IsStrictAnswerKeyValue(answer))
            {
                continue;
            }

            var keyToken = startQuestion == endQuestion
                ? startQuestion.ToString(CultureInfo.InvariantCulture)
                : $"{startQuestion}-{endQuestion}";
            lines.Add($"{keyToken} Answer: {answer}");
        }

        return lines.Count == 0
            ? string.Empty
            : string.Join('\n', lines.Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static string BuildAiAnswerKeyExtractionPrompt(string sourceText) => $$"""
        Báº¡n lÃ  bá»™ mÃ¡y trÃ­ch xuáº¥t Ä‘Ã¡p Ã¡n IELTS tá»« vÄƒn báº£n PDF thÃ´ bá»‹ lá»—i dÃ­nh chá»¯/layout.
        Nhiá»‡m vá»¥: trÃ­ch xuáº¥t Ä‘Ã¡p Ã¡n cho cÃ¢u 1..40 tá»« nguá»“n dá»¯ liá»‡u dÆ°á»›i Ä‘Ã¢y.

        QUY Táº®C Cá»¨NG:
        - KhÃ´ng giáº£i Ä‘á», khÃ´ng suy luáº­n tá»« passage.
        - Æ¯u tiÃªn láº¥y Ä‘Ã¡p Ã¡n tá»« "Review and Explanations". CÃ³ thá»ƒ dÃ¹ng "Solution:" náº¿u Ä‘á»§ rÃµ.
        - Loáº¡i bá» toÃ n bá»™ rÃ¡c: page number, Access/http, Keywords..., HOW TO USE...
        - Vá»›i dáº£i cÃ¢u kiá»ƒu 18-22 vÃ  Ä‘Ã¡p Ã¡n nhiá»u chá»¯ cÃ¡i, tráº£ vá» theo key range hoáº·c tÃ¡ch thÃ nh tá»«ng cÃ¢u Ä‘á»u Ä‘Æ°á»£c.
        - Báº®T BUá»˜C tráº£ Ä‘á»§ key tá»« 1..40. Náº¿u cÃ¢u nÃ o khÃ´ng cháº¯c thÃ¬ Ä‘á»ƒ chuá»—i rá»—ng.
        - Tráº£ vá» DUY NHáº¤T JSON thuáº§n, khÃ´ng markdown fence.
        - KhÃ´ng Ä‘Æ°á»£c tráº£ lá»i báº±ng vÄƒn báº£n giáº£i thÃ­ch.
        - KhÃ´ng láº¥y cÃ¡c dÃ²ng hÆ°á»›ng dáº«n kiá»ƒu "Open this URL", "HOW TO USE", "Questions ...", "Keywords in Questions" lÃ m Ä‘Ã¡p Ã¡n.

        Schema há»£p lá»‡ (má»™t trong hai):
        1) { "answers": { "1":"...", "2":"...", ... "40":"..." } }
        2) { "answers": [{"question_number":"1","answer":"..."}, ...] }

        PDF_RAW_SOURCE:
        {{sourceText}}
        """;

    private async Task<Dictionary<int, string>> TryExtractAnswerKeyWithGemmaAsync(
        string normalizedRawText,
        CancellationToken cancellationToken)
    {
        try
        {
            var sourceText = PrepareRawTextForAiAnswerKeyRecovery(normalizedRawText);
            if (string.IsNullOrWhiteSpace(sourceText))
            {
                return [];
            }

            var prompt = BuildAiAnswerKeyExtractionPrompt(sourceText);
            var rawResponse = await RequestGemmaCompletionAsync(prompt, cancellationToken);

            if (!TryDeserializeAiAnswerKeyMap(rawResponse, out var extractedMap, out var parseError))
            {
                logger.LogWarning(
                    "AI answer-key preprocessing returned invalid JSON: {Error}",
                    parseError);
                return [];
            }

            var normalizedMap = extractedMap
                .Where(pair => pair.Key is >= 1 and <= 40)
                .Select(pair => new KeyValuePair<int, string>(pair.Key, NormalizeFallbackAnswer(pair.Value)))
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
                .ToDictionary(pair => pair.Key, pair => pair.Value);

            NormalizeAndExpandAnswerKeyMap(normalizedMap);

            if (normalizedMap.Count < 34)
            {
                var compactHints = BuildReviewAnswerHints(normalizedRawText);
                if (!string.IsNullOrWhiteSpace(compactHints))
                {
                    var knownAnswersPreview = string.Join(
                        ", ",
                        normalizedMap
                            .OrderBy(pair => pair.Key)
                            .Select(pair => $"{pair.Key}:{pair.Value}"));
                    var retrySource = $"""
                        RETRY_MODE: Æ°u tiÃªn Ä‘iá»n Ä‘á»§ Ä‘Ã¡p Ã¡n cÃ²n thiáº¿u 1..40.
                        KNOWN_ANSWERS_CURRENT:
                        {knownAnswersPreview}

                        REVIEW_HINTS:
                        {compactHints}
                        """;

                    var retryPrompt = BuildAiAnswerKeyExtractionPrompt(retrySource);
                    var retryRawResponse = await RequestGemmaCompletionAsync(retryPrompt, cancellationToken);
                    if (TryDeserializeAiAnswerKeyMap(retryRawResponse, out var retryExtractedMap, out _))
                    {
                        var retryNormalizedMap = retryExtractedMap
                            .Where(pair => pair.Key is >= 1 and <= 40)
                            .Select(pair => new KeyValuePair<int, string>(pair.Key, NormalizeFallbackAnswer(pair.Value)))
                            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
                            .ToDictionary(pair => pair.Key, pair => pair.Value);
                        NormalizeAndExpandAnswerKeyMap(retryNormalizedMap);

                        if (retryNormalizedMap.Count > normalizedMap.Count ||
                            ComputeAnswerKeyQualityScore(retryNormalizedMap) > ComputeAnswerKeyQualityScore(normalizedMap))
                        {
                            normalizedMap = retryNormalizedMap;
                        }
                    }
                }
            }

            return normalizedMap;
        }
        catch (Exception ex) when (GemmaApiRetryDelayResolver.TryResolve(ex, out _, out _))
        {
            logger.LogWarning(ex, "AI answer-key preprocessing skipped due transient Gemma error.");
            return [];
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI answer-key preprocessing failed unexpectedly.");
            return [];
        }
    }

    private static bool TryDeserializeAiAnswerKeyMap(
        string rawResponse,
        out Dictionary<int, string> answerMap,
        out string error)
    {
        answerMap = [];
        error = string.Empty;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeAiAnswerKeyCandidate(candidate, out answerMap, out var parseError))
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

    private static bool TryDeserializeAiAnswerKeyCandidate(
        string candidateJson,
        out Dictionary<int, string> answerMap,
        out string? parseError)
    {
        answerMap = [];
        parseError = null;

        var workingJson = candidateJson;
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                using var document = JsonDocument.Parse(workingJson);
                answerMap = ConvertAiAnswerKeyPayloadToMap(document.RootElement);
                if (answerMap.Count > 0)
                {
                    return true;
                }

                parseError = "Parsed JSON but no answer entries were found.";
                return false;
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

        return false;
    }

    private static Dictionary<int, string> ConvertAiAnswerKeyPayloadToMap(JsonElement root)
    {
        var map = new Dictionary<int, string>();

        var payload = root;
        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty("answers", out var answersElement))
        {
            payload = answersElement;
        }

        if (payload.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in payload.EnumerateObject())
            {
                AddAiAnswerEntryFromKeyToken(map, property.Name, property.Value);
            }

            return map;
        }

        if (payload.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in payload.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                string? keyToken = null;
                if (item.TryGetProperty("question_number", out var questionNumberElement))
                {
                    keyToken = ReadJsonAsText(questionNumberElement);
                }
                else if (item.TryGetProperty("number", out var numberElement))
                {
                    keyToken = ReadJsonAsText(numberElement);
                }

                if (string.IsNullOrWhiteSpace(keyToken))
                {
                    continue;
                }

                JsonElement answerElement;
                if (item.TryGetProperty("answer", out var directAnswer))
                {
                    answerElement = directAnswer;
                }
                else if (item.TryGetProperty("answers", out var answersArray))
                {
                    answerElement = answersArray;
                }
                else
                {
                    continue;
                }

                AddAiAnswerEntryFromKeyToken(map, keyToken, answerElement);
            }
        }

        return map;
    }

    private static void AddAiAnswerEntryFromKeyToken(
        IDictionary<int, string> map,
        string keyToken,
        JsonElement answerElement)
    {
        if (string.IsNullOrWhiteSpace(keyToken))
        {
            return;
        }

        var answerTokens = ReadAiAnswerTokens(answerElement);
        if (answerTokens.Count == 0)
        {
            return;
        }

        if (TryParseReviewQuestionRange(keyToken, out var startQuestion, out var endQuestion))
        {
            if (endQuestion > startQuestion)
            {
                var expectedCount = endQuestion - startQuestion + 1;
                var letterTokens = answerTokens
                    .SelectMany(token => SplitAnswerTokensOrdered(token))
                    .Where(IsSingleLetterAnswerToken)
                    .ToList();

                if (letterTokens.Count == expectedCount)
                {
                    for (var offset = 0; offset < expectedCount; offset++)
                    {
                        map[startQuestion + offset] = letterTokens[offset];
                    }

                    return;
                }
            }

            var merged = NormalizeFallbackAnswer(string.Join(", ", answerTokens));
            if (!string.IsNullOrWhiteSpace(merged))
            {
                map[startQuestion] = merged;
            }

            return;
        }

        if (!int.TryParse(Regex.Replace(keyToken, @"[^\d]", string.Empty), out var questionNumber) ||
            questionNumber is < 1 or > 40)
        {
            return;
        }

        var normalized = NormalizeFallbackAnswer(answerTokens[0]);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            map[questionNumber] = normalized;
        }
    }

    private static List<string> ReadAiAnswerTokens(JsonElement answerElement)
    {
        var values = new List<string>();

        switch (answerElement.ValueKind)
        {
            case JsonValueKind.String:
            case JsonValueKind.Number:
            case JsonValueKind.True:
            case JsonValueKind.False:
                var scalar = ReadJsonAsText(answerElement);
                if (!string.IsNullOrWhiteSpace(scalar))
                {
                    values.Add(scalar.Trim());
                }

                break;

            case JsonValueKind.Array:
                foreach (var item in answerElement.EnumerateArray())
                {
                    var value = ReadJsonAsText(item);
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        values.Add(value.Trim());
                    }
                }

                break;

            case JsonValueKind.Object:
                if (answerElement.TryGetProperty("answer", out var nestedAnswer))
                {
                    values.AddRange(ReadAiAnswerTokens(nestedAnswer));
                }
                else if (answerElement.TryGetProperty("value", out var nestedValue))
                {
                    values.AddRange(ReadAiAnswerTokens(nestedValue));
                }

                break;
        }

        return values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}