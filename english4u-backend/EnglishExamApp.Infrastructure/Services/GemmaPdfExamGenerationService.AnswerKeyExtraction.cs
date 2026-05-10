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

    private static Dictionary<int, string> ExtractAnswerKeyMap(string rawText)
    {
        var result = new Dictionary<int, string>();
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return result;
        }

        var normalized = rawText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var reviewZone = ExtractReviewAndExplanationsZone(normalized);
        if (!string.IsNullOrWhiteSpace(reviewZone))
        {
            MergeReviewAnswerEntries(reviewZone, result);
        }

        var answerZone = ExtractAnswerZone(normalized);
        if (string.IsNullOrWhiteSpace(answerZone))
        {
            MergeSupplementalCompactAnswerPairs(normalized, result);
            MergeSupplementalUltraCompactAnswerPairs(normalized, result);
            MergeReviewAnswerEntries(normalized, result);
            NormalizeAndExpandAnswerKeyMap(result);
            return result;
        }

        var lines = answerZone.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var line in lines)
        {
            if (line.Length < 2)
            {
                continue;
            }

            if (ShouldSkipAnswerLine(line))
            {
                continue;
            }

            var compactMatches = CompactAnswerPairRegex().Matches(line);
            if (compactMatches.Count >= 2)
            {
                foreach (Match compactMatch in compactMatches)
                {
                    if (!int.TryParse(compactMatch.Groups["number"].Value, out var compactNumber))
                    {
                        continue;
                    }

                    var compactAnswer = SanitizeAnswerValue(compactMatch.Groups["answer"].Value);
                    if (string.IsNullOrWhiteSpace(compactAnswer))
                    {
                        continue;
                    }

                    if (!IsLikelyDirectAnswerToken(compactAnswer))
                    {
                        continue;
                    }

                    if (result.ContainsKey(compactNumber))
                    {
                        continue;
                    }

                    result[compactNumber] = compactAnswer;
                }

                continue;
            }

            if (TryExtractSingleAnswerLine(line, out var number, out var answer))
            {
                if (!result.ContainsKey(number))
                {
                    result[number] = answer;
                }
                continue;
            }

            foreach (Match pairMatch in AnswerPairInLineRegex().Matches(line))
            {
                if (!int.TryParse(pairMatch.Groups["number"].Value, out var pairNumber))
                {
                    continue;
                }

                var pairAnswer = SanitizeAnswerValue(pairMatch.Groups["answer"].Value);
                if (string.IsNullOrWhiteSpace(pairAnswer))
                {
                    continue;
                }

                if (!IsLikelyDirectAnswerToken(pairAnswer))
                {
                    continue;
                }

                if (result.ContainsKey(pairNumber))
                {
                    continue;
                }

                result[pairNumber] = pairAnswer;
            }
        }

        if (result.Count < 30)
        {
            var trailingStart = (int)(normalized.Length * 0.50d);
            trailingStart = Math.Clamp(trailingStart, 0, Math.Max(0, normalized.Length - 1));
            MergeSupplementalCompactAnswerPairs(normalized[trailingStart..], result);
            MergeSupplementalUltraCompactAnswerPairs(normalized[trailingStart..], result);
        }

        // Review/Explanations thÆ°á»ng cÃ³ Ä‘á»‹nh dáº¡ng "X Answer: Y" á»•n Ä‘á»‹nh hÆ¡n Solution bá»‹ dÃ­nh chá»¯.
        MergeReviewAnswerEntries(answerZone, result);
        if (result.Count < 30)
        {
            MergeReviewAnswerEntries(normalized, result);
        }

        NormalizeAndExpandAnswerKeyMap(result);
        return result;
    }

    private static void NormalizeAndExpandAnswerKeyMap(IDictionary<int, string> result)
    {
        if (result.Count == 0)
        {
            return;
        }

        var questionNumbers = result.Keys
            .Where(number => number is >= 1 and <= 40)
            .Distinct()
            .OrderBy(number => number)
            .ToList();

        // 1) Clean toÃ n bá»™ answer Ä‘Ã£ parse: bá» page/footer/url, normalize token.
        foreach (var questionNumber in questionNumbers)
        {
            if (!result.TryGetValue(questionNumber, out var rawAnswer))
            {
                continue;
            }

            var cleaned = NormalizeFallbackAnswer(rawAnswer);
            if (string.IsNullOrWhiteSpace(cleaned))
            {
                continue;
            }

            result[questionNumber] = cleaned;
        }

        // 2) Fallback expansion: náº¿u bá»‹ dá»“n range thÃ nh 1 dÃ²ng kiá»ƒu "18. A,C,D,E,H",
        // tá»± tÃ¡ch ra 18..22 khi khoáº£ng trá»‘ng key khá»›p vá»›i sá»‘ token.
        var ordered = result.Keys
            .Where(number => number is >= 1 and <= 40)
            .Distinct()
            .OrderBy(number => number)
            .ToList();

        foreach (var startQuestion in ordered)
        {
            if (!result.TryGetValue(startQuestion, out var answer) || string.IsNullOrWhiteSpace(answer))
            {
                continue;
            }

            var letterTokens = SplitAnswerTokensOrdered(answer)
                .Where(IsSingleLetterAnswerToken)
                .ToList();
            if (letterTokens.Count < 3)
            {
                continue;
            }

            var nextExistingQuestion = ordered.FirstOrDefault(number => number > startQuestion);
            if (nextExistingQuestion <= startQuestion)
            {
                continue;
            }

            var expectedEndQuestion = startQuestion + letterTokens.Count - 1;
            if (expectedEndQuestion > 40)
            {
                continue;
            }

            if (nextExistingQuestion != expectedEndQuestion + 1)
            {
                continue;
            }

            var allIntermediateMissing = true;
            for (var questionNumber = startQuestion + 1; questionNumber <= expectedEndQuestion; questionNumber++)
            {
                if (result.ContainsKey(questionNumber))
                {
                    allIntermediateMissing = false;
                    break;
                }
            }

            if (!allIntermediateMissing)
            {
                continue;
            }

            for (var offset = 0; offset < letterTokens.Count; offset++)
            {
                result[startQuestion + offset] = letterTokens[offset];
            }
        }
    }

    private static string ExtractReviewAndExplanationsZone(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        var headingMatches = ReviewSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        if (headingMatches.Count == 0)
        {
            return string.Empty;
        }

        var preferredHeading = headingMatches
            .FirstOrDefault(match => match.Index >= normalizedText.Length * 0.45d)
            ?? headingMatches[^1];
        if (preferredHeading.Index < 0 || preferredHeading.Index >= normalizedText.Length)
        {
            return string.Empty;
        }

        return normalizedText[preferredHeading.Index..].Trim();
    }

    private static void MergeSupplementalCompactAnswerPairs(
        string text,
        IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = CompactAnswerPairRegex().Matches(text);
        if (matches.Count < 12)
        {
            return;
        }

        foreach (Match match in matches)
        {
            if (!int.TryParse(match.Groups["number"].Value, out var number))
            {
                continue;
            }

            if (number is < 1 or > 40 || result.ContainsKey(number))
            {
                continue;
            }

            var answer = SanitizeAnswerValue(match.Groups["answer"].Value);
            if (!IsLikelyAnswerToken(answer))
            {
                continue;
            }

            result[number] = answer;
        }
    }

    private static void MergeSupplementalUltraCompactAnswerPairs(
        string text,
        IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = UltraCompactAnswerPairRegex().Matches(text);
        if (matches.Count < 20)
        {
            return;
        }

        var candidatePairs = new List<(int Number, string Answer)>(matches.Count);
        foreach (Match match in matches)
        {
            if (!int.TryParse(match.Groups["number"].Value, out var number) ||
                number is < 1 or > 40)
            {
                continue;
            }

            var answer = SanitizeAnswerValue(match.Groups["answer"].Value);
            if (!IsLikelyAnswerToken(answer))
            {
                continue;
            }

            candidatePairs.Add((number, answer));
        }

        var distinctQuestionCount = candidatePairs
            .Select(pair => pair.Number)
            .Distinct()
            .Count();
        if (distinctQuestionCount < 20)
        {
            return;
        }

        foreach (var pair in candidatePairs)
        {
            if (result.ContainsKey(pair.Number))
            {
                continue;
            }

            result[pair.Number] = pair.Answer;
        }
    }

    private static void MergeReviewAnswerEntries(string text, IDictionary<int, string> result)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var matches = ReviewAnswerEntryRegex().Matches(text);
        if (matches.Count == 0)
        {
            return;
        }

        foreach (Match match in matches)
        {
            if (!TryParseReviewQuestionRange(match.Groups["range"].Value, out var startQuestion, out var endQuestion))
            {
                continue;
            }

            var rawEntryBlock = match.Groups["raw"].Value;
            var normalizedAnswer = ExtractAnswerFromReviewEntryRaw(rawEntryBlock);
            if (string.IsNullOrWhiteSpace(normalizedAnswer))
            {
                continue;
            }

            if (endQuestion > startQuestion)
            {
                var orderedTokens = SplitAnswerTokensOrdered(normalizedAnswer)
                    .Where(IsSingleLetterAnswerToken)
                    .ToList();
                var expectedTokenCount = endQuestion - startQuestion + 1;

                if (orderedTokens.Count == expectedTokenCount)
                {
                    for (var offset = 0; offset < expectedTokenCount; offset++)
                    {
                        result[startQuestion + offset] = orderedTokens[offset];
                    }

                    continue;
                }
            }

            result[startQuestion] = normalizedAnswer;
        }
    }

    private static List<string> SplitAnswerTokensOrdered(string? answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return [];
        }

        return Regex.Split(answer, @"\s*(?:\||,|/|;|&|\band\b)\s*", RegexOptions.IgnoreCase)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(NormalizeToken)
            .ToList();
    }

    private static string ExtractAnswerFromReviewEntryRaw(string rawEntryBlock)
    {
        if (string.IsNullOrWhiteSpace(rawEntryBlock))
        {
            return string.Empty;
        }

        var normalizedRaw = NormalizeReviewEntryRawText(rawEntryBlock);
        if (string.IsNullOrWhiteSpace(normalizedRaw))
        {
            return string.Empty;
        }

        var explanationMarkerIndex = FindReviewExplanationMarkerIndex(normalizedRaw);
        var answerCandidate = explanationMarkerIndex > 0
            ? normalizedRaw[..explanationMarkerIndex]
            : normalizedRaw;

        answerCandidate = answerCandidate.Trim().Trim('.', ',', ';', ':', '-', '\u2013', '\u2014');
        return NormalizeFallbackAnswer(answerCandidate);
    }

    private static string ExtractExplanationFromReviewEntryRaw(string rawEntryBlock)
    {
        if (string.IsNullOrWhiteSpace(rawEntryBlock))
        {
            return string.Empty;
        }

        var normalizedRaw = NormalizeReviewEntryRawText(rawEntryBlock);
        if (string.IsNullOrWhiteSpace(normalizedRaw))
        {
            return string.Empty;
        }

        var explanationMarkerIndex = FindReviewExplanationMarkerIndex(normalizedRaw);
        if (explanationMarkerIndex < 0 || explanationMarkerIndex >= normalizedRaw.Length)
        {
            return string.Empty;
        }

        var explanationCandidate = normalizedRaw[explanationMarkerIndex..].Trim();
        return NormalizeExplanationText(explanationCandidate);
    }

    private static string NormalizeReviewEntryRawText(string rawEntryBlock)
    {
        var normalized = rawEntryBlock
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        // OCR/PDF thÆ°á»ng lÃ m dÃ­nh chá»¯ Ä‘Ã¡p Ã¡n vá»›i marker giáº£i thÃ­ch: "ADHDThe keywords", "ADHDpage 18".
        normalized = GluedReviewMarkerRegex().Replace(normalized, " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        return normalized;
    }

    private static int FindReviewExplanationMarkerIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var markerMatch = ReviewExplanationMarkerRegex().Match(value);
        return markerMatch.Success ? markerMatch.Index : -1;
    }

    private static bool TryParseReviewQuestionRange(string? rangeToken, out int startQuestion, out int endQuestion)
    {
        startQuestion = -1;
        endQuestion = -1;

        if (string.IsNullOrWhiteSpace(rangeToken))
        {
            return false;
        }

        var normalized = Regex.Replace(rangeToken, @"(?i)\bquestions?\b", string.Empty);
        normalized = Regex.Replace(normalized, @"(?i)\bq\b", string.Empty);
        normalized = Regex.Replace(normalized, @"(?i)\bto\b", "-");
        normalized = Regex.Replace(normalized, @"\s+", string.Empty);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var explicitRangeMatch = Regex.Match(normalized, @"^(?<start>\d{1,2})[-â€“â€”](?<end>\d{1,2})$");
        if (explicitRangeMatch.Success)
        {
            startQuestion = ParseOcrQuestionNumber(explicitRangeMatch.Groups["start"].Value);
            endQuestion = ParseOcrQuestionNumber(explicitRangeMatch.Groups["end"].Value);

            return startQuestion is >= 1 and <= 40 &&
                   endQuestion >= startQuestion &&
                   endQuestion <= 40;
        }

        // OCR fallback: "18-22" cÃ³ thá»ƒ bá»‹ dÃ­nh thÃ nh "1822".
        if (normalized.Length == 4 &&
            int.TryParse(normalized[..2], out var firstTwoDigits) &&
            int.TryParse(normalized[2..], out var lastTwoDigits) &&
            firstTwoDigits is >= 1 and <= 40 &&
            lastTwoDigits >= firstTwoDigits &&
            lastTwoDigits <= 40)
        {
            startQuestion = firstTwoDigits;
            endQuestion = lastTwoDigits;
            return true;
        }

        // OCR fallback: "9-13" cÃ³ thá»ƒ bá»‹ dÃ­nh thÃ nh "913".
        if (normalized.Length == 3 &&
            int.TryParse(normalized[..1], out var firstOneDigit) &&
            int.TryParse(normalized[1..], out var lastTwoDigitsFromThree) &&
            firstOneDigit is >= 1 and <= 40 &&
            lastTwoDigitsFromThree >= firstOneDigit &&
            lastTwoDigitsFromThree <= 40)
        {
            startQuestion = firstOneDigit;
            endQuestion = lastTwoDigitsFromThree;
            return true;
        }

        var parsedSingle = ParseOcrQuestionNumber(normalized);
        if (parsedSingle is >= 1 and <= 40)
        {
            startQuestion = parsedSingle;
            endQuestion = parsedSingle;
            return true;
        }

        return false;
    }
}