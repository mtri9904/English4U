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
    private static string BuildCombinedEvidenceText(params string?[] sources)
    {
        var pieces = sources
            .Where(source => !string.IsNullOrWhiteSpace(source))
            .Select(source => source!.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return string.Join("\n\n", pieces);
    }

    private static Dictionary<int, string> BuildBestAnswerKeyMap(string primaryRawText, string? backupRawText)
    {
        var primaryMap = ExtractAnswerKeyMap(primaryRawText);
        if (string.IsNullOrWhiteSpace(backupRawText))
        {
            return primaryMap;
        }

        var backupMap = ExtractAnswerKeyMap(backupRawText);
        if (backupMap.Count == 0)
        {
            return primaryMap;
        }

        if (primaryMap.Count == 0 || backupMap.Count >= primaryMap.Count + 3)
        {
            var result = new Dictionary<int, string>(backupMap);
            foreach (var pair in primaryMap)
            {
                if (!result.ContainsKey(pair.Key) && IsStrictAnswerKeyValue(pair.Value))
                {
                    result[pair.Key] = pair.Value;
                }
            }

            return result;
        }

        foreach (var pair in backupMap)
        {
            if (!primaryMap.ContainsKey(pair.Key) && IsStrictAnswerKeyValue(pair.Value))
            {
                primaryMap[pair.Key] = pair.Value;
            }
        }

        return primaryMap;
    }

    private IReadOnlyList<string> ReconcilePassagesWithBackup(
        IReadOnlyList<string> primaryPassages,
        string? backupRawText,
        string fileName)
    {
        if (string.IsNullOrWhiteSpace(backupRawText))
        {
            return primaryPassages;
        }

        var backupPassages = SplitPassages(backupRawText);
        if (primaryPassages.Count != 3 && backupPassages.Count == 3)
        {
            logger.LogWarning(
                "Using PdfPig backup passage split for {FileName} because MinerU split returned {PrimaryPassageCount} passage(s).",
                fileName,
                primaryPassages.Count);
            return backupPassages;
        }

        if (primaryPassages.Count == 3)
        {
            return primaryPassages;
        }

        if (primaryPassages.Count != 3 || backupPassages.Count != 3)
        {
            return primaryPassages;
        }

        var reconciled = primaryPassages.ToList();
        for (var index = 0; index < reconciled.Count; index++)
        {
            var primary = reconciled[index];
            var backup = backupPassages[index];
            if (string.IsNullOrWhiteSpace(backup))
            {
                continue;
            }

            var passageNumber = index + 1;
            var (expectedStart, expectedEnd) = ResolveExpectedQuestionRangeForPassage(primary, passageNumber);
            var backupExpectedRange = ResolveExpectedQuestionRangeForPassage(backup, passageNumber);
            var backupHasExpectedRange =
                backupExpectedRange.StartQuestion == expectedStart &&
                backupExpectedRange.EndQuestion == expectedEnd ||
                ContainsExpectedQuestionRange(backup, expectedStart, expectedEnd);
            var primaryQuestionNumberCoverage = CountQuestionNumbersInRange(primary, expectedStart, expectedEnd);
            var backupQuestionNumberCoverage = CountQuestionNumbersInRange(backup, expectedStart, expectedEnd);
            var backupLooksSubstantiallyRicher =
                backup.Length >= primary.Length + 800 &&
                backup.Length >= primary.Length * 1.18d;

            var backupHasBetterQuestionCoverage =
                backupHasExpectedRange &&
                backupQuestionNumberCoverage >= primaryQuestionNumberCoverage + 1 &&
                backupQuestionNumberCoverage >= Math.Min(expectedEnd - expectedStart + 1, 8);

            if (backupHasExpectedRange && (backupLooksSubstantiallyRicher || backupHasBetterQuestionCoverage))
            {
                logger.LogWarning(
                    "Using PdfPig backup text for passage {PassageNumber} in {FileName}. MinerU length {PrimaryLength}, backup length {BackupLength}, question coverage {PrimaryCoverage}->{BackupCoverage}.",
                    passageNumber,
                    fileName,
                    primary.Length,
                    backup.Length,
                    primaryQuestionNumberCoverage,
                    backupQuestionNumberCoverage);
                reconciled[index] = backup;
            }
        }

        return reconciled;
    }

    private IReadOnlyList<string> BuildPassageEvidencePools(
        IReadOnlyList<string> primaryPassages,
        string? backupRawText,
        string fileName)
    {
        if (string.IsNullOrWhiteSpace(backupRawText))
        {
            return primaryPassages;
        }

        var backupPassages = SplitPassages(backupRawText);
        if (primaryPassages.Count != 3 || backupPassages.Count != 3)
        {
            return primaryPassages;
        }

        var evidencePassages = new List<string>(primaryPassages.Count);
        for (var index = 0; index < primaryPassages.Count; index++)
        {
            var primary = primaryPassages[index];
            var backup = backupPassages[index];
            if (string.IsNullOrWhiteSpace(backup))
            {
                evidencePassages.Add(primary);
                continue;
            }

            var passageNumber = index + 1;
            var primaryRange = ResolveExpectedQuestionRangeForPassage(primary, passageNumber);
            var backupRange = ResolveExpectedQuestionRangeForPassage(backup, passageNumber);
            var backupBelongsToSamePassage =
                backupRange.StartQuestion == primaryRange.StartQuestion &&
                backupRange.EndQuestion == primaryRange.EndQuestion ||
                ContainsExpectedQuestionRange(backup, primaryRange.StartQuestion, primaryRange.EndQuestion);

            if (!backupBelongsToSamePassage)
            {
                evidencePassages.Add(primary);
                continue;
            }

            var combined = BuildCombinedEvidenceText(primary, backup);
            evidencePassages.Add(combined);
            logger.LogInformation(
                "Built combined MinerU/PdfPig evidence pool for passage {PassageNumber} in {FileName}. MinerU length {PrimaryLength}, backup length {BackupLength}.",
                passageNumber,
                fileName,
                primary.Length,
                backup.Length);
        }

        return evidencePassages;
    }

    private static void ValidateParsedPassagesAgainstEvidence(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyList<string> rawPassages,
        string combinedEvidenceText)
    {
        var issues = new List<string>();
        if (parsedPassages.Count != 3)
        {
            issues.Add($"Expected 3 parsed passages, got {parsedPassages.Count}.");
        }

        var expectedRanges = InferredQuestionRangesFromRawPassages(rawPassages);

        var maxActualQuestion = parsedPassages
            .SelectMany(p => p.Questions ?? [])
            .Select(q => ParseQuestionNumber(ReadJsonAsText(q.QuestionNumber)))
            .Where(n => n.HasValue)
            .Select(n => n!.Value)
            .DefaultIfEmpty(40)
            .Max();
        if (maxActualQuestion < 40) maxActualQuestion = 40;
        if (maxActualQuestion > 45) maxActualQuestion = 45;

        if (expectedRanges.Length == 3)
        {
            expectedRanges[2] = (expectedRanges[2].Start, Math.Min(expectedRanges[2].End, maxActualQuestion));
        }

        for (var passageIndex = 0; passageIndex < parsedPassages.Count; passageIndex++)
        {
            var passageNumber = passageIndex + 1;
            var rawPassageText = passageIndex < rawPassages.Count ? rawPassages[passageIndex] : string.Empty;
            var evidenceForPassage = BuildCombinedEvidenceText(rawPassageText, combinedEvidenceText);
            var expectedRange = passageIndex < expectedRanges.Length
                ? expectedRanges[passageIndex]
                : GetExpectedQuestionRangeForPassage(passageNumber);

            ValidatePassageQuestionNumbering(
                parsedPassages[passageIndex],
                passageNumber,
                expectedRange,
                issues);
            ValidateQuestionEvidence(parsedPassages[passageIndex], passageNumber, evidenceForPassage, issues);
        }

        if (issues.Count == 0)
        {
            return;
        }

        var preview = string.Join("; ", issues.Take(12));
        if (issues.Count > 12)
        {
            preview += $"; ... and {issues.Count - 12} more issue(s)";
        }

        throw new InvalidOperationException(
            "PDF generation stopped because extracted AI output is not fully supported by source PDF evidence. " +
            preview);
    }

    private static void ValidatePassageQuestionNumbering(
        GemmaPassagePayload payload,
        int passageNumber,
        (int StartQuestion, int EndQuestion) expectedRange,
        List<string> issues)
    {
        var (expectedStart, expectedEnd) = expectedRange;
        var questionNumbers = (payload.Questions ?? [])
            .Select(question => ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber)))
            .Where(number => number.HasValue)
            .Select(number => number!.Value)
            .ToList();

        var expectedNumbers = Enumerable.Range(expectedStart, expectedEnd - expectedStart + 1).ToHashSet();
        var actualNumbers = questionNumbers.ToHashSet();
        var missing = expectedNumbers.Except(actualNumbers).OrderBy(number => number).ToList();
        var outOfRange = actualNumbers
            .Where(number => number < expectedStart || number > expectedEnd)
            .OrderBy(number => number)
            .ToList();
        var duplicates = questionNumbers
            .GroupBy(number => number)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .OrderBy(number => number)
            .ToList();

        if (missing.Count > 0)
        {
            issues.Add($"Passage {passageNumber} missing question(s): {string.Join(", ", missing)}.");
        }

        if (outOfRange.Count > 0)
        {
            issues.Add($"Passage {passageNumber} has out-of-range question(s): {string.Join(", ", outOfRange)}.");
        }

        if (duplicates.Count > 0)
        {
            issues.Add($"Passage {passageNumber} has duplicated question(s): {string.Join(", ", duplicates)}.");
        }
    }

    private static void ValidateQuestionEvidence(
        GemmaPassagePayload payload,
        int passageNumber,
        string evidenceText,
        List<string> issues)
    {
        foreach (var question in payload.Questions ?? [])
        {
            var questionNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber));
            var questionLabel = questionNumber.HasValue
                ? $"Q{questionNumber.Value}"
                : $"passage {passageNumber} question";
            var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
            var questionText = ReadJsonAsText(question.QuestionText);
            if (!HasSourceEvidence(questionText, evidenceText, requireForShortText: false))
            {
                issues.Add($"{questionLabel} text is not supported by source PDF evidence.");
            }

            if (!IsMcqType(mappedType))
            {
                continue;
            }

            var options = ExtractOptions(question.Options)
                .Select(option => RemoveSelectionMarkers(UnescapeExtractedText(option.Trim())))
                .Where(option => !string.IsNullOrWhiteSpace(option))
                .ToList();

            if (options.Count < 2)
            {
                issues.Add($"{questionLabel} has fewer than 2 MCQ options.");
                continue;
            }

            if (options.All(IsOptionLabelOnly))
            {
                issues.Add($"{questionLabel} options contain only labels without source text.");
                continue;
            }

            foreach (var option in options.Where(option => !IsOptionLabelOnly(option)))
            {
                if (!HasSourceEvidence(option, evidenceText, requireForShortText: true))
                {
                    issues.Add($"{questionLabel} option '{BuildTextPreview(option)}' is not supported by source PDF evidence.");
                }
            }
        }
    }

    private static (int StartQuestion, int EndQuestion) GetExpectedQuestionRangeForPassage(int passageNumber) =>
        passageNumber switch
        {
            1 => (1, 13),
            2 => (14, 26),
            3 => (27, 40),
            _ => (1, 40)
        };

    private static (int StartQuestion, int EndQuestion) ResolveExpectedQuestionRangeForPassage(
        string rawPassageText,
        int passageNumber)
    {
        var fallback = GetExpectedQuestionRangeForPassage(passageNumber);
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return fallback;
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        var introRange = Regex.Match(
            normalized,
            @"(?i)\b(?:answer|on)\s+questions?\s*(?<start>[0-9OoIl\|]{1,2})\s*(?:-|–|—|‑|−|to)\s*(?<end>[0-9OoIl\|]{1,2})\b");
        if (introRange.Success)
        {
            var start = ParseOcrQuestionNumber(introRange.Groups["start"].Value);
            var end = ParseOcrQuestionNumber(introRange.Groups["end"].Value);
            if (IsPlausiblePassageQuestionRange(start, end) &&
                passageNumber switch
                {
                    1 => start >= 1 && end <= 20,
                    2 => start >= 10 && end <= 35,
                    3 => start >= 20 && end <= 45,
                    _ => true
                })
            {
                return (start, end);
            }
        }

        var groupRanges = QuestionRangeBoundaryRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Select(match =>
            {
                TryParseBoundaryQuestions(match, out var start, out var end);
                return new
                {
                    Start = start,
                    End = end
                };
            })
            .Where(range => IsPlausiblePassageQuestionRange(range.Start, range.End))
            .Where(range => passageNumber switch
            {
                1 => range.Start >= 1 && range.End <= 20,
                2 => range.Start >= 10 && range.End <= 35,
                3 => range.Start >= 20 && range.End <= 45,
                _ => true
            })
            .ToList();
        if (groupRanges.Count > 0)
        {
            return (groupRanges.Min(range => range.Start), groupRanges.Max(range => range.End));
        }

        return fallback;
    }

    private static bool IsPlausiblePassageQuestionRange(int start, int end) =>
        start is >= 1 and <= 45 &&
        end is >= 1 and <= 45 &&
        end >= start &&
        end - start <= 20;

    private static int CountQuestionNumbersInRange(string text, int expectedStart, int expectedEnd)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return 0;
        }

        var outlinePromptNumbers = new HashSet<int>();
        foreach (var outline in ExtractQuestionGroupOutlines(text))
        {
            for (var number = Math.Max(expectedStart, outline.StartQuestion);
                 number <= Math.Min(expectedEnd, outline.EndQuestion);
                 number++)
            {
                if (!string.IsNullOrWhiteSpace(ExtractRawQuestionBlock(text, outline, number)))
                {
                    outlinePromptNumbers.Add(number);
                }
            }
        }

        if (outlinePromptNumbers.Count > 0)
        {
            return outlinePromptNumbers.Count;
        }

        var numbers = new HashSet<int>();
        foreach (Match match in SingleQuestionBoundaryRegex().Matches(text))
        {
            var number = ParseOcrQuestionNumber(match.Groups["number"].Value);
            if (number >= expectedStart && number <= expectedEnd)
            {
                numbers.Add(number);
            }
        }

        foreach (Match match in Regex.Matches(text, @"(?m)^\s*(?<number>\d{1,2})(?=\s|[).:\-]|[A-Za-z])"))
        {
            var number = ParseOcrQuestionNumber(match.Groups["number"].Value);
            if (number >= expectedStart && number <= expectedEnd)
            {
                numbers.Add(number);
            }
        }

        return numbers.Count;
    }

    private static bool ContainsExpectedQuestionRange(string text, int expectedStart, int expectedEnd)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        return Regex.IsMatch(
                   text,
                   $@"(?i)\bquestions?\s*{expectedStart}\s*(?:-|to|–|—)\s*{expectedEnd}\b") ||
               Regex.IsMatch(text, $@"(?i)\bquestion\s*{expectedStart}\b");
    }

    private static bool HasSourceEvidence(string? candidateText, string sourceText, bool requireForShortText)
    {
        if (string.IsNullOrWhiteSpace(candidateText))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(sourceText))
        {
            return false;
        }

        var candidateTokens = ExtractEvidenceTokens(candidateText).Distinct(StringComparer.Ordinal).ToList();
        if (candidateTokens.Count == 0)
        {
            return true;
        }

        var sourceTokenSet = ExtractEvidenceTokens(sourceText).ToHashSet(StringComparer.Ordinal);
        if (candidateTokens.Count < 3)
        {
            return !requireForShortText || candidateTokens.Any(sourceTokenSet.Contains);
        }

        var hitCount = candidateTokens.Count(sourceTokenSet.Contains);
        var ratio = (double)hitCount / candidateTokens.Count;
        return ratio >= 0.55d || hitCount >= Math.Min(6, candidateTokens.Count);
    }

    private static IEnumerable<string> ExtractEvidenceTokens(string value)
    {
        var normalized = UnescapeExtractedText(value)
            .Replace("\r\n", " ")
            .Replace('\r', ' ')
            .Replace('\n', ' ');
        normalized = BlankPlaceholderRegex().Replace(normalized, " ");
        normalized = Regex.Replace(normalized, @"\b(?:question|questions|choose|write|answer|answers|following|correct|letter|letters)\b", " ", RegexOptions.IgnoreCase);
        foreach (Match match in Regex.Matches(normalized.ToLowerInvariant(), @"[\p{L}\p{N}][\p{L}\p{N}'-]{2,}"))
        {
            var token = match.Value.Trim('\'', '-');
            if (token.Length < 4 && !token.Any(char.IsDigit))
            {
                continue;
            }

            yield return token;
        }
    }
}
