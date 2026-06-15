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

    private static Dictionary<int, string> ExtractExplanationMap(string answerZone)
    {
        var result = new Dictionary<int, string>();
        if (string.IsNullOrWhiteSpace(answerZone))
        {
            return result;
        }

        var normalized = answerZone
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        MergeReviewExplanationEntries(normalized, result);

        var headingMatches = ExplanationBlockStartRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        if (headingMatches.Count == 0)
        {
            return result;
        }

        for (var i = 0; i < headingMatches.Count; i++)
        {
            var heading = headingMatches[i];
            if (!int.TryParse(heading.Groups["number"].Value, out var questionNumber) ||
                questionNumber is < 1 or > 40)
            {
                continue;
            }

            var blockStart = heading.Index + heading.Length;
            var blockEnd = i == headingMatches.Count - 1
                ? normalized.Length
                : headingMatches[i + 1].Index;
            if (blockEnd <= blockStart)
            {
                continue;
            }

            var rawExplanation = normalized[blockStart..blockEnd].Trim();
            var normalizedExplanation = NormalizeExplanationText(rawExplanation);
            if (string.IsNullOrWhiteSpace(normalizedExplanation))
            {
                continue;
            }

            result[questionNumber] = normalizedExplanation;
        }

        return result;
    }

    private static void MergeReviewExplanationEntries(string text, IDictionary<int, string> result)
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

            var explanation = ExtractExplanationFromReviewEntryRaw(match.Groups["raw"].Value);
            if (string.IsNullOrWhiteSpace(explanation))
            {
                continue;
            }

            for (var questionNumber = startQuestion; questionNumber <= endQuestion; questionNumber++)
            {
                if (questionNumber is < 1 or > 40)
                {
                    continue;
                }

                result[questionNumber] = explanation;
            }
        }
    }

    private static string NormalizeExplanationText(string rawExplanation)
    {
        if (string.IsNullOrWhiteSpace(rawExplanation))
        {
            return string.Empty;
        }

        var cleaned = Regex.Replace(rawExplanation, @"\s+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)\bpage\s*\d+\s*access\s+https?://\S+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)\baccess\s+https?://\S+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"(?i)\bhttps?://\S+", " ").Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return string.Empty;
        }

        if (cleaned.Length <= 20 && IsLikelyAnswerToken(cleaned))
        {
            return string.Empty;
        }

        var answerLeadMatch = LeadingAnswerTokenRegex().Match(cleaned);
        if (answerLeadMatch.Success)
        {
            var remainder = answerLeadMatch.Groups["explanation"].Value.Trim();
            if (!string.IsNullOrWhiteSpace(remainder))
            {
                cleaned = remainder;
            }
        }

        if (cleaned.Length < 25 ||
            AccessOrPageNoiseRegex().IsMatch(cleaned) ||
            CompactAnswerBlobRegex().IsMatch(cleaned))
        {
            return string.Empty;
        }

        var maxExplanationLength = 1800;
        if (cleaned.Length > maxExplanationLength)
        {
            cleaned = cleaned[..maxExplanationLength].TrimEnd() + "...";
        }

        return cleaned;
    }

    private static int ApplyExplanationOverrides(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> explanationMap)
    {
        if (explanationMap.Count == 0)
        {
            return 0;
        }

        var appliedCount = 0;
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

                if (!explanationMap.TryGetValue(effectiveQuestionNumber, out var explanationText) ||
                    string.IsNullOrWhiteSpace(explanationText))
                {
                    continue;
                }

                question.Explanation = JsonSerializer.SerializeToElement(explanationText);
                appliedCount++;
            }
        }

        return appliedCount;
    }

    private static bool IsLikelyAnswerToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var normalized = NormalizeToken(value);
        if (normalized is "TRUE" or "FALSE" or "YES" or "NO" or "NOT GIVEN")
        {
            return true;
        }

        if (IsSingleLetterAnswerToken(normalized))
        {
            return true;
        }

        if (value.Length > 80 || AccessOrPageNoiseRegex().IsMatch(value))
        {
            return false;
        }

        return true;
    }

    private static bool IsLikelyDirectAnswerToken(string value)
    {
        if (!IsLikelyAnswerToken(value))
        {
            return false;
        }

        var normalized = NormalizeToken(value);
        if (IsSingleLetterAnswerToken(normalized) ||
            IsTfngAnswerToken(normalized) ||
            IsYnngAnswerToken(normalized))
        {
            return true;
        }

        var tokens = SplitAnswerTokens(value).ToList();
        if (tokens.Count > 1 && tokens.All(IsSingleLetterAnswerToken))
        {
            return true;
        }

        if (value.Length > 60)
        {
            return false;
        }

        if (value.IndexOfAny(new[] { '.', '!', '?' }) >= 0)
        {
            return false;
        }

        var lexicalTokenCount = Regex.Matches(value, @"[A-Za-z0-9][A-Za-z0-9'â€™\-]*").Count;
        return lexicalTokenCount is >= 1 and <= 6;
    }

    private static string ExtractAnswerZone(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        var headingMatches = AnswerSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        var answerStart = headingMatches
            .Select(match => match.Index)
            .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);

        if (answerStart <= 0)
        {
            var looseMatches = LooseAnswerSectionHeadingRegex()
                .Matches(normalizedText)
                .Cast<Match>()
                .Where(match => match.Success)
                .OrderBy(match => match.Index)
                .ToList();

            answerStart = looseMatches
                .Select(match => match.Index)
                .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);
        }

        if (answerStart <= 0)
        {
            // Fallback cho file cÃ³ "Solution:1C2F..." dÃ­nh liá»n cÃ¹ng dÃ²ng.
            var inlineSolutionMatch = InlineSolutionHeadingRegex().Match(normalizedText);
            if (inlineSolutionMatch.Success &&
                inlineSolutionMatch.Index >= normalizedText.Length * 0.35d)
            {
                answerStart = inlineSolutionMatch.Index;
            }
        }

        if (answerStart <= 0)
        {
            // Fallback: láº¥y vÃ¹ng 40% cuá»‘i file náº¿u cÃ³ máº­t Ä‘á»™ answer-pair cao.
            var trailingStart = (int)(normalizedText.Length * 0.60d);
            trailingStart = Math.Clamp(trailingStart, 0, Math.Max(0, normalizedText.Length - 1));
            var trailingChunk = normalizedText[trailingStart..];

            var firstCompactPair = CompactAnswerPairRegex().Match(trailingChunk);
            var compactPairCount = CompactAnswerPairRegex().Matches(trailingChunk).Count;
            var firstUltraCompactPair = UltraCompactAnswerPairRegex().Match(trailingChunk);
            var ultraCompactPairCount = UltraCompactAnswerPairRegex().Matches(trailingChunk).Count;
            var singleLineAnswerCount = SingleAnswerLineRegex().Matches(trailingChunk).Count;

            if (firstCompactPair.Success && (compactPairCount >= 8 || singleLineAnswerCount >= 8))
            {
                answerStart = trailingStart + firstCompactPair.Index;
            }
            else if (firstUltraCompactPair.Success && ultraCompactPairCount >= 12)
            {
                answerStart = trailingStart + firstUltraCompactPair.Index;
            }
            else
            {
                // KhÃ´ng tÃ¬m Ä‘Æ°á»£c vÃ¹ng Ä‘Ã¡p Ã¡n Ä‘á»§ tin cáº­y thÃ¬ khÃ´ng parse Ä‘á»ƒ trÃ¡nh override sai.
                return string.Empty;
            }
        }

        return normalizedText[answerStart..];
    }

    private static string ExtractSolutionOnlyZone(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return string.Empty;
        }

        var headingMatches = SolutionSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .Where(match => match.Success)
            .OrderBy(match => match.Index)
            .ToList();

        var solutionStart = headingMatches
            .Select(match => match.Index)
            .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);

        if (solutionStart <= 0)
        {
            var looseMatches = LooseSolutionSectionHeadingRegex()
                .Matches(normalizedText)
                .Cast<Match>()
                .Where(match => match.Success)
                .OrderBy(match => match.Index)
                .ToList();

            solutionStart = looseMatches
                .Select(match => match.Index)
                .FirstOrDefault(index => index >= normalizedText.Length * 0.45d);
        }

        if (solutionStart <= 0)
        {
            var compactSolutionZone = ExtractCompactSolutionZone(normalizedText);
            if (!string.IsNullOrWhiteSpace(compactSolutionZone))
            {
                return compactSolutionZone;
            }

            return string.Empty;
        }

        var reviewMatch = ReviewSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .FirstOrDefault(match => match.Success && match.Index > solutionStart);
        var end = reviewMatch is not null
            ? reviewMatch.Index
            : Math.Min(normalizedText.Length, solutionStart + 5000);

        if (end <= solutionStart)
        {
            return string.Empty;
        }

        return TrimSolutionSectionRaw(normalizedText[solutionStart..end]);
    }

    private static string NormalizeSolutionSectionRaw(
        string? aiSolutionSectionRaw,
        string deterministicSolutionZone,
        IReadOnlyDictionary<int, string> answerKey)
    {
        var preferred = TrimSolutionSectionRaw(aiSolutionSectionRaw);
        var fallback = TrimSolutionSectionRaw(deterministicSolutionZone);

        if (string.IsNullOrWhiteSpace(preferred))
        {
            preferred = fallback;
        }

        if (string.IsNullOrWhiteSpace(preferred) && answerKey.Count > 0)
        {
            return BuildNormalizedAnswerList(answerKey);
        }

        if (ReviewSectionHeadingRegex().IsMatch(preferred) && !string.IsNullOrWhiteSpace(fallback))
        {
            preferred = fallback;
        }

        if (preferred.Length > 2500 && answerKey.Count > 0)
        {
            return BuildNormalizedAnswerList(answerKey);
        }

        return preferred;
    }

    private static string TrimSolutionSectionRaw(string? solutionSectionRaw)
    {
        if (string.IsNullOrWhiteSpace(solutionSectionRaw))
        {
            return string.Empty;
        }

        var normalized = solutionSectionRaw
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var reviewMatch = ReviewSectionHeadingRegex().Match(normalized);
        if (reviewMatch.Success && reviewMatch.Index > 0)
        {
            normalized = normalized[..reviewMatch.Index].TrimEnd();
        }
        else if (reviewMatch.Success && reviewMatch.Index == 0)
        {
            return string.Empty;
        }

        return normalized.Trim();
    }

    private static string BuildNormalizedAnswerList(IReadOnlyDictionary<int, string> answerKey)
    {
        if (answerKey.Count == 0)
        {
            return string.Empty;
        }

        return string.Join(
            "\n",
            answerKey
                .OrderBy(pair => pair.Key)
                .Select(pair => $"{pair.Key}. {pair.Value}"));
    }
}
