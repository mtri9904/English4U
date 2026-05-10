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

    private static List<CreateQuestionDto> RepairSentenceCompletionQuestionSet(
        List<CreateQuestionDto> questions,
        string? rawBlockText)
    {
        if (questions.Count == 0 || string.IsNullOrWhiteSpace(rawBlockText))
        {
            return questions;
        }

        var orderedQuestionNumbers = questions
            .Select(question => question.QuestionNumber)
            .Where(questionNumber => questionNumber.HasValue)
            .Select(questionNumber => questionNumber!.Value)
            .Distinct()
            .OrderBy(questionNumber => questionNumber)
            .ToList();
        if (orderedQuestionNumbers.Count == 0)
        {
            return questions;
        }

        var source = BuildSentenceCompletionRepairSource(rawBlockText, orderedQuestionNumbers[0]);
        if (string.IsNullOrWhiteSpace(source))
        {
            return questions;
        }

        var anchorMap = LocateSentenceCompletionQuestionAnchors(source, orderedQuestionNumbers);
        if (anchorMap.Count == 0)
        {
            return questions;
        }

        var candidateMap = BuildSentenceCompletionRawCandidateMap(source, orderedQuestionNumbers, anchorMap);
        if (candidateMap.Count == 0)
        {
            return questions;
        }

        return questions
            .Select(question =>
            {
                if (!question.QuestionNumber.HasValue ||
                    !candidateMap.TryGetValue(question.QuestionNumber.Value, out var rawCandidate))
                {
                    return question;
                }

                var normalizedCandidate = NormalizeQuestionBody(
                    "SENTENCE_COMPLETION",
                    rawCandidate,
                    question.QuestionNumber);
                if (!ShouldPreferSentenceCompletionCandidate(question.Content, normalizedCandidate))
                {
                    return question;
                }

                return question with { Content = normalizedCandidate };
            })
            .ToList();
    }

    private static string BuildSentenceCompletionRepairSource(string rawBlockText, int startQuestion)
    {
        var instruction = TryExtractInstructionFromBlockText(rawBlockText, startQuestion);
        var preview = BuildQuestionPreview(rawBlockText, instruction, startQuestion);
        var normalizedRawBlock = NormalizeSentenceCompletionRepairSource(rawBlockText);
        var normalizedPreview = NormalizeSentenceCompletionRepairSource(preview);

        if (string.IsNullOrWhiteSpace(normalizedRawBlock))
        {
            return normalizedPreview;
        }

        if (string.IsNullOrWhiteSpace(normalizedPreview))
        {
            return normalizedRawBlock;
        }

        if (normalizedRawBlock.Contains(normalizedPreview, StringComparison.OrdinalIgnoreCase))
        {
            return normalizedRawBlock;
        }

        if (normalizedPreview.Contains(normalizedRawBlock, StringComparison.OrdinalIgnoreCase))
        {
            return normalizedPreview;
        }

        return string.Join("\n", [normalizedRawBlock, normalizedPreview]);
    }

    private static string NormalizeSentenceCompletionRepairSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return string.Empty;
        }

        source = source
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        source = Regex.Replace(source, @"(?i)\bAccess\s+https?://\S+\b", " ");
        source = Regex.Replace(source, @"(?i)\bhttps?://\S+\b", " ");
        source = Regex.Replace(source, @"(?i)\bfor\s+more\s+practices\b", " ");
        source = Regex.Replace(source, @"(?i)\bpage\s*\d+\b", " ");
        source = Regex.Replace(source, @"[ \t]+\n", "\n");
        source = Regex.Replace(source, @"\n[ \t]+", "\n");
        source = Regex.Replace(source, @"[ \t]{2,}", " ");
        source = Regex.Replace(source, @"\n{3,}", "\n\n");
        return source.Trim();
    }

    private static Dictionary<int, int> LocateSentenceCompletionQuestionAnchors(
        string source,
        IReadOnlyList<int> orderedQuestionNumbers)
    {
        var result = new Dictionary<int, int>();
        var searchIndex = 0;

        foreach (var questionNumber in orderedQuestionNumbers)
        {
            var anchorIndex = FindSentenceCompletionQuestionAnchor(source, questionNumber, searchIndex);
            if (anchorIndex < 0)
            {
                anchorIndex = FindSentenceCompletionQuestionAnchor(source, questionNumber, 0);
            }

            if (anchorIndex < 0)
            {
                continue;
            }

            result[questionNumber] = anchorIndex;
            searchIndex = Math.Min(source.Length, anchorIndex + 1);
        }

        return result;
    }

    private static int FindSentenceCompletionQuestionAnchor(string source, int questionNumber, int startIndex)
    {
        if (string.IsNullOrWhiteSpace(source) || questionNumber <= 0)
        {
            return -1;
        }

        startIndex = Math.Clamp(startIndex, 0, source.Length);
        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var matches = Regex.Matches(
            source[startIndex..],
            $@"(?<!\d){escapedQuestionNumber}(?!\d)",
            RegexOptions.IgnoreCase);

        var bestIndex = -1;
        var bestScore = int.MinValue;
        foreach (Match match in matches)
        {
            if (!match.Success)
            {
                continue;
            }

            var candidateIndex = startIndex + match.Index;
            var score = ScoreSentenceCompletionQuestionAnchor(source, candidateIndex, match.Length);
            if (score > bestScore)
            {
                bestScore = score;
                bestIndex = candidateIndex;
            }
        }

        return bestScore >= 4 ? bestIndex : -1;
    }

    private static int ScoreSentenceCompletionQuestionAnchor(string source, int index, int length)
    {
        if (string.IsNullOrWhiteSpace(source) || index < 0 || index >= source.Length)
        {
            return int.MinValue;
        }

        var previousChar = index > 0 ? source[index - 1] : '\0';
        var nextChar = index + length < source.Length ? source[index + length] : '\0';
        if ("-â€“â€”â€‘âˆ’".IndexOf(previousChar) >= 0 || "-â€“â€”â€‘âˆ’".IndexOf(nextChar) >= 0)
        {
            return int.MinValue;
        }

        var windowStart = Math.Max(0, index - 24);
        var windowEnd = Math.Min(source.Length, index + length + 24);
        var window = source[windowStart..windowEnd];
        if (QuestionRangeBoundaryRegex().IsMatch(window))
        {
            return int.MinValue;
        }

        var prefix = source[..index].TrimEnd();
        var suffix = source[(index + length)..].TrimStart();
        var score = 0;

        if (Regex.IsMatch(prefix, @"[A-Za-z][A-Za-z'â€™\-]*\s*$"))
        {
            score += 5;
        }

        if (Regex.IsMatch(suffix, @"^(?:___\b|\(?[A-Za-z][A-Za-z'â€™\-]*)"))
        {
            score += 5;
        }

        if (previousChar is ' ' or '(' or '[' || char.IsLetter(previousChar))
        {
            score += 2;
        }

        if (nextChar is ' ' or ')' or ']' or '.' or ',' || char.IsLetter(nextChar))
        {
            score += 2;
        }

        if (Regex.IsMatch(window, @"(?i)\bquestions?\s+\d"))
        {
            score -= 10;
        }

        return score;
    }

    private static Dictionary<int, string> BuildSentenceCompletionRawCandidateMap(
        string source,
        IReadOnlyList<int> orderedQuestionNumbers,
        IReadOnlyDictionary<int, int> anchorMap)
    {
        var result = new Dictionary<int, string>();

        for (var index = 0; index < orderedQuestionNumbers.Count; index++)
        {
            var questionNumber = orderedQuestionNumbers[index];
            if (!anchorMap.TryGetValue(questionNumber, out var anchorIndex))
            {
                continue;
            }

            int? nextAnchorIndex = null;
            for (var nextIndex = index + 1; nextIndex < orderedQuestionNumbers.Count; nextIndex++)
            {
                if (anchorMap.TryGetValue(orderedQuestionNumbers[nextIndex], out var resolvedNextAnchorIndex))
                {
                    nextAnchorIndex = resolvedNextAnchorIndex;
                    break;
                }
            }

            var candidate = ExtractSentenceCompletionRawCandidate(source, anchorIndex, nextAnchorIndex);
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            result[questionNumber] = candidate;
        }

        return result;
    }

    private static string? ExtractSentenceCompletionRawCandidate(
        string source,
        int anchorIndex,
        int? nextAnchorIndex)
    {
        if (string.IsNullOrWhiteSpace(source) || anchorIndex < 0 || anchorIndex >= source.Length)
        {
            return null;
        }

        var start = FindSentenceCompletionCandidateStart(source, anchorIndex);
        var end = FindSentenceCompletionCandidateEnd(source, anchorIndex, nextAnchorIndex);
        if (end <= start)
        {
            return null;
        }

        var candidate = source[start..end]
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        candidate = Regex.Replace(candidate, @"[ \t]+\n", "\n");
        candidate = Regex.Replace(candidate, @"\n[ \t]+", "\n");
        candidate = Regex.Replace(candidate, @"[ \t]{2,}", " ");
        candidate = Regex.Replace(candidate, @"\n{3,}", "\n\n");
        candidate = candidate.Trim();

        if (string.IsNullOrWhiteSpace(candidate) || LooksLikeAnyStrongInstructionLine(candidate))
        {
            return null;
        }

        return candidate;
    }

    private static int FindSentenceCompletionCandidateStart(string source, int anchorIndex)
    {
        for (var index = anchorIndex - 1; index >= 0; index--)
        {
            if (IsSentenceCompletionBoundaryChar(source[index]))
            {
                return index + 1;
            }
        }

        return 0;
    }

    private static int FindSentenceCompletionCandidateEnd(string source, int anchorIndex, int? nextAnchorIndex)
    {
        var hardLimit = nextAnchorIndex.HasValue && nextAnchorIndex.Value > anchorIndex
            ? nextAnchorIndex.Value
            : source.Length;

        for (var index = anchorIndex; index < hardLimit; index++)
        {
            if (IsSentenceCompletionBoundaryChar(source[index]))
            {
                return index + 1;
            }
        }

        return hardLimit;
    }

    private static bool IsSentenceCompletionBoundaryChar(char value) =>
        value is '.' or '?' or '!' or '\n' or '\r';

    private static bool ShouldPreferSentenceCompletionCandidate(string? existingContent, string? candidateContent) =>
        ScoreSentenceCompletionCandidate(candidateContent) > ScoreSentenceCompletionCandidate(existingContent);

    private static int ScoreSentenceCompletionCandidate(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return 0;
        }

        var normalized = Regex.Replace(content, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return 0;
        }

        var score = 0;
        if (BlankPlaceholderRegex().IsMatch(normalized))
        {
            score += 8;
            var placeholderIndex = normalized.IndexOf("___", StringComparison.Ordinal);
            if (placeholderIndex > 0)
            {
                score += 2;
            }

            if (placeholderIndex >= 0 && placeholderIndex + 3 < normalized.Length)
            {
                score += 3;
            }
            else
            {
                score -= 1;
            }
        }

        var wordCount = Regex.Matches(normalized, @"[A-Za-z][A-Za-z'â€™\-]*").Count;
        score += Math.Min(8, wordCount);
        if (wordCount >= 6)
        {
            score += 2;
        }

        if (normalized.Length is >= 24 and <= 220)
        {
            score += 2;
        }
        else if (normalized.Length > 260)
        {
            score -= 4;
        }

        if (LooksLikeAnyStrongInstructionLine(normalized) || QuestionRangeBoundaryRegex().IsMatch(normalized))
        {
            score -= 10;
        }

        return score;
    }
}
