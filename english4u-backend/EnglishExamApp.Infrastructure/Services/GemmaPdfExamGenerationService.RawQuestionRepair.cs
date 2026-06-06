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
    private sealed record IndexedRegexMatch(Match Match, int Index);

    private static int RepairQuestionsFromRawEvidence(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyList<string> rawPassages,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var repairCount = 0;
        for (var passageIndex = 0; passageIndex < parsedPassages.Count; passageIndex++)
        {
            var rawPassageText = passageIndex < rawPassages.Count ? rawPassages[passageIndex] : string.Empty;
            if (string.IsNullOrWhiteSpace(rawPassageText))
            {
                continue;
            }

            var questionStatementText = TrimToQuestionStatementZone(rawPassageText);
            if (string.IsNullOrWhiteSpace(questionStatementText))
            {
                questionStatementText = rawPassageText;
            }

            var payload = parsedPassages[passageIndex];
            payload.Questions ??= [];

            var expectedRange = ResolveExpectedQuestionRangeForPassage(questionStatementText, passageIndex + 1);
            var outlines = ExtractQuestionGroupOutlines(questionStatementText);
            var questionMap = payload.Questions
                .Select(question => new
                {
                    Number = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber)),
                    Question = question
                })
                .Where(item => item.Number.HasValue)
                .GroupBy(item => item.Number!.Value)
                .ToDictionary(group => group.Key, group => group.First().Question);

            for (var questionNumber = expectedRange.StartQuestion; questionNumber <= expectedRange.EndQuestion; questionNumber++)
            {
                var outline = outlines.FirstOrDefault(item =>
                    questionNumber >= item.StartQuestion &&
                    questionNumber <= item.EndQuestion);
                if (outline is null)
                {
                    continue;
                }

                if (!questionMap.TryGetValue(questionNumber, out var existingQuestion))
                {
                    var rebuiltQuestion = TryBuildQuestionPayloadFromRaw(
                        questionStatementText,
                        outline,
                        questionNumber,
                        answerKeyMap);
                    if (rebuiltQuestion is null)
                    {
                        continue;
                    }

                    payload.Questions.Add(rebuiltQuestion);
                    questionMap[questionNumber] = rebuiltQuestion;
                    repairCount++;
                    continue;
                }

                if (TryRepairExistingQuestionFromRaw(questionStatementText, outline, existingQuestion, questionNumber, answerKeyMap))
                {
                    repairCount++;
                }
            }

            if (repairCount > 0)
            {
                payload.Questions = payload.Questions
                    .Select((question, index) => new IndexedQuestion(question, index))
                    .OrderBy(item => ParseQuestionNumber(ReadJsonAsText(item.Question.QuestionNumber)) ?? int.MaxValue)
                    .ThenBy(item => item.Index)
                    .Select(item => item.Question)
                    .ToList();
            }
        }

        return repairCount;
    }

    private static string TrimToQuestionStatementZone(string rawPassageText)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return string.Empty;
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var cutIndexes = new List<int>();
        AddMatchIndex(cutIndexes, AnswerSectionHeadingRegex().Match(normalized));
        AddMatchIndex(cutIndexes, LooseAnswerSectionHeadingRegex().Match(normalized));
        AddMatchIndex(cutIndexes, ReviewSectionHeadingRegex().Match(normalized));
        AddMatchIndex(cutIndexes, InlineSolutionHeadingRegex().Match(normalized));

        var compactSolution = Regex.Match(
            normalized,
            @"(?i)(?<![A-Za-z])solution\s*:\s*(?:\d{1,2}\s*(?:TRUE|FALSE|YES|NO|NOT\s+GIVEN|[A-Z]))");
        AddMatchIndex(cutIndexes, compactSolution);

        var reviewMarker = Regex.Match(
            normalized,
            @"(?i)(?<![A-Za-z])(?:review\s+and\s+explanations?|keywords?\s+in\s+questions|similar\s+words?\s+in\s+passage)\b");
        AddMatchIndex(cutIndexes, reviewMarker);

        if (cutIndexes.Count == 0)
        {
            return normalized;
        }

        return normalized[..cutIndexes.Min()].Trim();
    }

    private static void AddMatchIndex(List<int> indexes, Match match)
    {
        if (match.Success)
        {
            indexes.Add(match.Index);
        }
    }

    private static bool TryRepairExistingQuestionFromRaw(
        string rawPassageText,
        ReadingQuestionGroupOutline outline,
        GemmaQuestionPayload question,
        int questionNumber,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var rebuilt = TryBuildQuestionPayloadFromRaw(rawPassageText, outline, questionNumber, answerKeyMap);
        if (rebuilt is null)
        {
            return false;
        }

        var changed = false;
        var rebuiltType = ReadJsonAsText(rebuilt.QuestionType);
        var currentType = ReadJsonAsText(question.QuestionType);
        if (!string.IsNullOrWhiteSpace(rebuiltType) &&
            string.IsNullOrWhiteSpace(TryMapQuestionType(currentType)) &&
            !string.Equals(currentType, rebuiltType, StringComparison.Ordinal))
        {
            question.QuestionType = rebuilt.QuestionType;
            changed = true;
        }

        var rebuiltQuestionText = ReadJsonAsText(rebuilt.QuestionText);
        if (!string.IsNullOrWhiteSpace(rebuiltQuestionText) &&
            HasSourceEvidence(rebuiltQuestionText, rawPassageText, requireForShortText: false) &&
            string.IsNullOrWhiteSpace(ReadJsonAsText(question.QuestionText)) &&
            !string.Equals(ReadJsonAsText(question.QuestionText), rebuiltQuestionText, StringComparison.Ordinal))
        {
            question.QuestionText = rebuilt.QuestionText;
            changed = true;
        }

        var rebuiltOptions = ExtractOptions(rebuilt.Options);
        if (rebuiltOptions.Count > 0)
        {
            var currentOptions = ExtractOptions(question.Options);
            var shouldReplaceOptions =
                currentOptions.Count == 0 ||
                currentOptions.All(IsOptionLabelOnly);
            if (shouldReplaceOptions)
            {
                question.Options = rebuilt.Options;
                changed = true;
            }
        }

        var rebuiltAnswer = ReadJsonAsText(rebuilt.Answer);
        if (!string.IsNullOrWhiteSpace(rebuiltAnswer) &&
            !string.Equals(ReadJsonAsText(question.Answer), rebuiltAnswer, StringComparison.OrdinalIgnoreCase))
        {
            question.Answer = rebuilt.Answer;
            changed = true;
        }

        return changed;
    }
    private static GemmaQuestionPayload? TryBuildQuestionPayloadFromRaw(
        string rawPassageText,
        ReadingQuestionGroupOutline outline,
        int questionNumber,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var questionBlock = ExtractRawQuestionBlock(rawPassageText, outline, questionNumber);
        if (string.IsNullOrWhiteSpace(questionBlock))
        {
            questionBlock = ExtractLooseRawQuestionBlockFromEvidence(rawPassageText, questionNumber);
        }

        if (string.IsNullOrWhiteSpace(questionBlock))
        {
            return null;
        }

        var groupBlock = ExtractRawQuestionGroupBlock(rawPassageText, outline);
        var inferredType = InferQuestionTypeFromRawBlock(outline, BuildCombinedEvidenceText(groupBlock, questionBlock));
        var normalizedOutlineType = NormalizeGroupType(outline.GroupType);
        var mappedType = IsStrongerRawType(inferredType, normalizedOutlineType)
            ? inferredType
            : normalizedOutlineType ?? inferredType;
        var questionText = ExtractRawQuestionText(questionBlock, questionNumber);
        var optionSource = IsMatchingType(mappedType) && !string.IsNullOrWhiteSpace(groupBlock)
            ? groupBlock
            : questionBlock;
        var options = ExtractRawQuestionOptions(optionSource, mappedType);
        if (string.IsNullOrWhiteSpace(questionText) && options.Count == 0)
        {
            return null;
        }

        return new GemmaQuestionPayload
        {
            QuestionNumber = JsonString(questionNumber.ToString(CultureInfo.InvariantCulture)),
            QuestionType = JsonString(ToGeminiQuestionType(mappedType)),
            QuestionText = JsonString(questionText),
            Options = JsonSerializer.SerializeToElement(options, JsonOptions),
            Answer = JsonString(answerKeyMap.TryGetValue(questionNumber, out var answer) ? answer : string.Empty),
            Explanation = JsonString(string.Empty)
        };
    }

    private static string ExtractRawQuestionBlock(
        string rawPassageText,
        ReadingQuestionGroupOutline outline,
        int questionNumber)
    {
        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var groupStart = FindQuestionGroupStart(normalized, outline);
        if (groupStart < 0)
        {
            groupStart = 0;
        }

        var groupEnd = FindQuestionGroupEnd(normalized, outline, groupStart);
        var groupBlock = normalized[groupStart..groupEnd];
        var questionStart = FindQuestionStart(groupBlock, questionNumber);
        if (questionStart < 0)
        {
            return string.Empty;
        }

        var questionEnd = groupBlock.Length;
        for (var next = questionNumber + 1; next <= outline.EndQuestion; next++)
        {
            var nextStart = FindQuestionStart(groupBlock, next);
            if (nextStart > questionStart)
            {
                questionEnd = nextStart;
                break;
            }
        }

        return groupBlock[questionStart..questionEnd].Trim();
    }

    private static string ExtractLooseRawQuestionBlock(string rawPassageText, int questionNumber)
    {
        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var answerSection = AnswerSectionHeadingRegex().Match(normalized);
        if (answerSection.Success)
        {
            normalized = normalized[..answerSection.Index];
        }

        var escapedNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var startMatch = Regex.Match(
            normalized,
            $@"(?<![A-Za-z0-9\-–—‑−]){escapedNumber}(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'(\[])",
            RegexOptions.IgnoreCase);
        if (startMatch.Success && !IsQuestionStartCandidate(normalized, startMatch.Index))
        {
            startMatch = Regex.Matches(
                    normalized[startMatch.Index..],
                    $@"(?<![A-Za-z0-9\-â€“â€”â€‘âˆ’]){escapedNumber}(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'(\[])",
                    RegexOptions.IgnoreCase)
                .Cast<Match>()
                .Where(match => match.Index > 0)
                .Select(match => new IndexedRegexMatch(match, startMatch.Index + match.Index))
                .FirstOrDefault(item => IsQuestionStartCandidate(normalized, item.Index))
                ?.Match ?? Match.Empty;
        }
        if (!startMatch.Success || !IsQuestionStartCandidate(normalized, startMatch.Index))
        {
            return string.Empty;
        }

        var nextStart = normalized.Length;
        for (var next = questionNumber + 1; next <= Math.Min(questionNumber + 5, 40); next++)
        {
            var candidate = FindQuestionStart(normalized[startMatch.Index..], next);
            if (candidate > 0)
            {
                nextStart = startMatch.Index + candidate;
                break;
            }
        }

        var nextGroup = QuestionRangeBoundaryRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Where(match => match.Index > startMatch.Index && IsQuestionGroupHeadingLine(normalized, match.Index))
            .Select(match => match.Index)
            .DefaultIfEmpty(normalized.Length)
            .Min();
        nextStart = Math.Min(nextStart, nextGroup);

        return normalized[startMatch.Index..nextStart].Trim();
    }

    private static string ExtractRawQuestionGroupBlock(
        string rawPassageText,
        ReadingQuestionGroupOutline outline)
    {
        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var groupStart = FindQuestionGroupStart(normalized, outline);
        if (groupStart < 0)
        {
            groupStart = 0;
        }

        var groupEnd = FindQuestionGroupEnd(normalized, outline, groupStart);
        return normalized[groupStart..groupEnd].Trim();
    }

    private static string ExtractLooseRawQuestionBlockFromEvidence(string rawPassageText, int questionNumber)
    {
        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var answerSection = AnswerSectionHeadingRegex().Match(normalized);
        if (answerSection.Success)
        {
            normalized = normalized[..answerSection.Index];
        }

        var escapedNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var questionStartPattern =
            $@"(?<![A-Za-z0-9\-\u2013\u2014\u2011\u2212]){escapedNumber}(?!\s*(?:-|\u2013|\u2014|\u2011|\u2212|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'(\[])";
        var startIndex = Regex.Matches(normalized, questionStartPattern, RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Select(match => match.Index)
            .FirstOrDefault(index => IsQuestionStartCandidate(normalized, index), -1);
        if (startIndex < 0)
        {
            return string.Empty;
        }

        var nextStart = normalized.Length;
        for (var next = questionNumber + 1; next <= Math.Min(questionNumber + 5, 40); next++)
        {
            var candidate = FindQuestionStart(normalized[startIndex..], next);
            if (candidate > 0)
            {
                nextStart = startIndex + candidate;
                break;
            }
        }

        var nextGroup = QuestionRangeBoundaryRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Where(match => match.Index > startIndex && IsQuestionGroupHeadingLine(normalized, match.Index))
            .Select(match => match.Index)
            .DefaultIfEmpty(normalized.Length)
            .Min();
        nextStart = Math.Min(nextStart, nextGroup);

        return normalized[startIndex..nextStart].Trim();
    }

    private static int FindQuestionGroupStart(string text, ReadingQuestionGroupOutline outline)
    {
        var rangeMatch = Regex.Match(
            text,
            $@"(?im)^\s*(?:#+\s*)?questions?\s*{outline.StartQuestion}\s*(?:-|–|—|‑|−|to)\s*{outline.EndQuestion}\b");
        if (rangeMatch.Success)
        {
            return rangeMatch.Index;
        }

        return FindQuestionStart(text, outline.StartQuestion);
    }

    private static int FindQuestionGroupEnd(string text, ReadingQuestionGroupOutline outline, int groupStart)
    {
        var nextRange = QuestionRangeBoundaryRegex()
            .Matches(text)
            .Cast<Match>()
            .Where(match => match.Index > groupStart && IsQuestionGroupHeadingLine(text, match.Index))
            .Select(match => match.Index)
            .DefaultIfEmpty(text.Length)
            .Min();
        return Math.Clamp(nextRange, groupStart, text.Length);
    }

    private static int FindQuestionStart(string text, int questionNumber)
    {
        var escapedNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var patterns = new[]
        {
            $@"(?m)^\s*{escapedNumber}(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'“‘(\[])",
            $@"(?<![A-Za-z0-9]){escapedNumber}(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=[A-Za-z""'“‘(\[])",
            $@"(?<![A-Za-z0-9]){escapedNumber}(?!\s*(?:-|–|—|‑|−|to)\s*\d)(?=\s+[A-Z""'“‘(\[])"
        };

        foreach (var pattern in patterns)
        {
            foreach (Match match in Regex.Matches(text, pattern, RegexOptions.IgnoreCase))
            {
                if (match.Success && IsQuestionStartCandidate(text, match.Index))
                {
                    return match.Index;
                }
            }
        }

        return -1;
    }

    private static bool IsQuestionStartCandidate(string text, int matchIndex)
    {
        if (matchIndex <= 0 || matchIndex >= text.Length)
        {
            return true;
        }

        var previous = text[matchIndex - 1];
        if (previous is '-' or '\u2013' or '\u2014' or '\u2011' or '\u2212')
        {
            return false;
        }

        return true;
    }

    private static string ExtractRawQuestionText(string rawBlock, int questionNumber)
    {
        var cleaned = LeadingQuestionNumberRegex()
            .Replace(rawBlock.Trim(), string.Empty, 1);
        var optionIndex = Regex.Match(cleaned, @"(?m)^\s*A\s*(?:[).:\-]|\s+)\s+\S").Index;
        if (optionIndex > 0)
        {
            cleaned = cleaned[..optionIndex];
        }
        else
        {
            var inlineOptionIndex = Regex.Match(
                cleaned,
                @"(?<![A-Za-z0-9])A\s*(?:[).:\-]|O\b)?\s+(?=\S)",
                RegexOptions.IgnoreCase).Index;
            if (inlineOptionIndex > 0)
            {
                cleaned = cleaned[..inlineOptionIndex];
            }
        }

        cleaned = Regex.Replace(cleaned, @"(?im)^\s*(?:#+\s*)?questions?\s*\d{1,2}\s*(?:-|to|–|—)\s*\d{1,2}\b.*$", string.Empty);
        cleaned = Regex.Replace(cleaned, @"(?im)^\s*(?:choose|write|match|look at|do the following|for questions?)\b.*$", string.Empty);
        cleaned = Regex.Replace(cleaned, @"(?is)\b(?:do\s+the\s+following\s+statements|for\s+questions?\s+\d{1,2}\s*(?:-|to|–|—)\s*\d{1,2}|write\s*TRUE|TRUE\s*if\s+the\s+statement|FALSE\s*if\s+the\s+statement|NOT\s+GIVEN\s*if)\b.*$", string.Empty);
        return NormalizeExtractedSpacing(cleaned).Trim();
    }

    private static List<string> ExtractRawQuestionOptions(string rawBlock, string mappedType)
    {
        if (!IsOptionBasedType(mappedType) || mappedType is "TFNG" or "YNNG")
        {
            return [];
        }

        if (IsMatchingType(mappedType))
        {
            var matchingOptions = ExtractMatchingOptionBank(rawBlock);
            if (matchingOptions.Count >= 2)
            {
                return matchingOptions;
            }
        }

        var inlineOptions = ExtractInlineLetteredOptions(rawBlock);
        if (inlineOptions.Count >= 2)
        {
            return inlineOptions;
        }

        var optionMatches = Regex.Matches(
                rawBlock,
                @"(?ms)(?<![A-Za-z0-9])(?<label>[A-Z])\s*(?:[).:\-]|O\s+|\s{1,3})(?<text>.*?)(?=(?<![A-Za-z0-9])[A-Z]\s*(?:[).:\-]|O\s+|\s{1,3})|\z)")
            .Cast<Match>()
            .Select(match => new
            {
                Label = match.Groups["label"].Value.ToUpperInvariant(),
                Text = NormalizeExtractedSpacing(RemoveSelectionMarkers(match.Groups["text"].Value)).Trim()
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.Text) && item.Text.Length > 2)
            .GroupBy(item => item.Label)
            .OrderBy(group => group.Key)
            .Select(group => $"{group.Key}. {group.First().Text}")
            .ToList();

        return optionMatches.Count >= 2 ? optionMatches : [];
    }

    private static List<string> ExtractMatchingOptionBank(string rawBlock)
    {
        var lines = rawBlock
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();
        var options = new List<string>();
        for (var index = 0; index < lines.Count; index++)
        {
            var line = RemoveSelectionMarkers(lines[index]).Trim();
            var standaloneLabel = Regex.Match(line, @"^(?<label>[A-Z])(?:[).:\-])?$", RegexOptions.IgnoreCase);
            if (standaloneLabel.Success && index + 1 < lines.Count)
            {
                var text = RemoveSelectionMarkers(lines[index + 1]).Trim();
                if (!string.IsNullOrWhiteSpace(text) &&
                    !Regex.IsMatch(text, @"^\d{1,2}\b") &&
                    !QuestionRangeBoundaryRegex().IsMatch(text))
                {
                    options.Add($"{standaloneLabel.Groups["label"].Value.ToUpperInvariant()}. {NormalizeExtractedSpacing(text)}");
                    index++;
                }

                continue;
            }

            var labeled = Regex.Match(line, @"^(?<label>[A-Z])\s*(?<text>[A-Z][^\n]{2,160})$", RegexOptions.IgnoreCase);
            if (labeled.Success &&
                !Regex.IsMatch(labeled.Groups["text"].Value, @"^\d{1,2}\b"))
            {
                options.Add($"{labeled.Groups["label"].Value.ToUpperInvariant()}. {NormalizeExtractedSpacing(labeled.Groups["text"].Value)}");
            }
        }

        if (options.Count >= 2)
        {
            return options
                .GroupBy(option => option[0])
                .OrderBy(group => group.Key)
                .Select(group => group.First())
                .ToList();
        }

        var compactOptions = Regex.Matches(
                rawBlock,
                @"(?s)(?<![A-Za-z0-9])(?<label>[A-Z])(?<text>[A-Z][A-Za-z .'’\-]{2,160}?)(?=(?<![A-Za-z0-9])[A-Z][A-Z]|\d{1,2}\b|$)")
            .Cast<Match>()
            .Select(match => $"{match.Groups["label"].Value.ToUpperInvariant()}. {NormalizeExtractedSpacing(match.Groups["text"].Value)}")
            .ToList();

        return compactOptions.Count >= 2 ? compactOptions : [];
    }

    private static List<string> ExtractInlineLetteredOptions(string rawBlock)
    {
        var matches = Regex.Matches(
                rawBlock,
                @"(?<![A-Za-z0-9])(?<label>[A-Z])\s*(?:[).:\-]|O\b)?\s+(?=\S)",
                RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Where(match => !Regex.IsMatch(match.Value, @"^\s*O\s*$", RegexOptions.IgnoreCase))
            .OrderBy(match => match.Index)
            .ToList();
        if (matches.Count < 2)
        {
            return [];
        }

        var options = new List<string>();
        for (var index = 0; index < matches.Count; index++)
        {
            var current = matches[index];
            var nextIndex = index + 1 < matches.Count ? matches[index + 1].Index : rawBlock.Length;
            if (nextIndex <= current.Index)
            {
                continue;
            }

            var textStart = current.Index + current.Length;
            var optionText = rawBlock[textStart..nextIndex];
            optionText = RemoveSelectionMarkers(optionText);
            optionText = Regex.Replace(optionText, @"\bO\s+", string.Empty);
            optionText = NormalizeExtractedSpacing(optionText).Trim();
            optionText = Regex.Replace(optionText, @"\s*(?:page\s*\d+|Access\s+https?://.*)$", string.Empty, RegexOptions.IgnoreCase).Trim();
            if (optionText.Length < 3 || Regex.IsMatch(optionText, @"^\d{1,2}\b"))
            {
                continue;
            }

            options.Add($"{current.Groups["label"].Value.ToUpperInvariant()}. {optionText}");
        }

        return options.Count >= 2
            ? options.GroupBy(option => option[0]).OrderBy(group => group.Key).Select(group => group.First()).ToList()
            : [];
    }

    private static bool IsMatchingType(string mappedType) =>
        mappedType is "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MATCHING_HEADINGS";

    private static string InferQuestionTypeFromRawBlock(ReadingQuestionGroupOutline outline, string rawBlock)
    {
        var combined = $"{outline.Instruction}\n{rawBlock}";
        if (Regex.IsMatch(combined, @"(?i)\bwhich\s+paragraph\s+contains\b|\bwhich\s+paragraphs?\s+contain\b"))
        {
            return "MATCHING_INFO";
        }

        if (Regex.IsMatch(combined, @"(?i)\bmatch\s+each\s+statement\b|\blist\s+of\s+(?:people|names|researchers|speakers)\b|\bcorrect\s+person\b|\bstatements?,\s*\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2},\s*and\s+the\s+list\b"))
        {
            return "MATCHING_FEATURES";
        }

        if (TrueFalseNotGivenRegex().IsMatch(combined))
        {
            return "TFNG";
        }

        if (YesNoNotGivenRegex().IsMatch(combined))
        {
            return "YNNG";
        }

        if (MatchingInstructionRegex().IsMatch(combined))
        {
            return "MATCHING_FEATURES";
        }

        return "MCQ_SINGLE";
    }

    private static bool IsStrongerRawType(string inferredType, string? normalizedOutlineType)
    {
        if (string.IsNullOrWhiteSpace(inferredType))
        {
            return false;
        }

        if (IsMatchingType(inferredType) && !IsMatchingType(normalizedOutlineType ?? string.Empty))
        {
            return true;
        }

        if (inferredType is "TFNG" or "YNNG" &&
            normalizedOutlineType is null or "MCQ_SINGLE" or "MCQ_MULTIPLE" or "MCQ_CHOOSE_N")
        {
            return true;
        }

        return false;
    }

    private static string ToGeminiQuestionType(string mappedType) => mappedType switch
    {
        "MCQ_SINGLE" => "MultipleChoice",
        "MCQ_MULTIPLE" => "MultipleChoiceMultiple",
        "MCQ_CHOOSE_N" => "MultipleChoiceChooseN",
        "TFNG" => "TrueFalseNotGiven",
        "YNNG" => "YesNoNotGiven",
        "SENTENCE_COMPLETION" => "FillInBlanks",
        "SUMMARY_COMPLETION" => "SummaryCompletion",
        "TABLE_COMPLETION" => "TableCompletion",
        "MATCHING_INFO" => "MatchingInfo",
        "MATCHING_HEADINGS" => "MatchingHeadings",
        "MATCHING_FEATURES" => "MatchingFeatures",
        "MATCHING_VISUALS" => "MatchingVisuals",
        "FLOWCHART_COMPLETION" => "FlowchartCompletion",
        "MAP_LABELLING" => "MapLabelling",
        _ => "MultipleChoice"
    };
}
