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

    private static List<CreateQuestionDto> NormalizeChooseNQuestionSet(List<CreateQuestionDto> questions)
    {
        if (questions.Count == 0)
        {
            return questions;
        }

        var normalizedQuestions = questions
            .Select(question => question with
            {
                CorrectAnswer = NormalizeAnswerByGroupType("MCQ_CHOOSE_N", question.CorrectAnswer)
            })
            .ToList();
        normalizedQuestions = DistributeChooseNSharedAnswerAcrossBoxes(normalizedQuestions);

        var optionSets = normalizedQuestions
            .Select(question => question.Options
                .Select(option => RemoveSelectionMarkers(option.OptionText?.Trim() ?? string.Empty))
                .Where(option => !string.IsNullOrWhiteSpace(option))
                .ToList())
            .ToList();

        var sharedOptionTexts = optionSets
            .Where(optionList => optionList.Count > 0)
            .OrderByDescending(optionList => optionList.Count)
            .ThenByDescending(optionList => optionList.Sum(text => text.Length))
            .FirstOrDefault();

        if (sharedOptionTexts is null || sharedOptionTexts.Count == 0)
        {
            return normalizedQuestions;
        }

        var distinctOptionSignatures = optionSets
            .Where(optionList => optionList.Count > 0)
            .Select(optionList => string.Join(
                "\u001F",
                optionList.Select(option => NormalizeToken(option))))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var hasSingleSharedOptionBank = distinctOptionSignatures.Count <= 1;
        if (!hasSingleSharedOptionBank)
        {
            return normalizedQuestions;
        }

        for (var index = 0; index < normalizedQuestions.Count; index++)
        {
            var question = normalizedQuestions[index];
            var currentOptionTexts = optionSets[index];
            var needsSharedOptions = currentOptionTexts.Count == 0 ||
                                     currentOptionTexts.All(IsOptionLabelOnly) ||
                                     currentOptionTexts.Count < sharedOptionTexts.Count;
            if (!needsSharedOptions)
            {
                continue;
            }

            normalizedQuestions[index] = question with
            {
                Options = BuildOptions(sharedOptionTexts, "MCQ_CHOOSE_N", question.CorrectAnswer)
            };
        }

        return normalizedQuestions;
    }

    private static List<CreateQuestionDto> NormalizeSharedMultiSelectQuestionSet(List<CreateQuestionDto> questions)
    {
        if (questions.Count == 0)
        {
            return questions;
        }

        var normalizedQuestions = questions
            .Select(question => question with
            {
                CorrectAnswer = NormalizeAnswerByGroupType("MCQ_MULTIPLE", question.CorrectAnswer)
            })
            .ToList();

        var sharedOptionTexts = normalizedQuestions
            .Select(question => question.Options
                .Select(option => RemoveSelectionMarkers(option.OptionText?.Trim() ?? string.Empty))
                .Where(option => !string.IsNullOrWhiteSpace(option))
                .ToList())
            .Where(optionList => optionList.Count > 0)
            .OrderByDescending(optionList => optionList.Count)
            .ThenByDescending(optionList => optionList.Sum(text => text.Length))
            .FirstOrDefault();

        if (sharedOptionTexts is null || sharedOptionTexts.Count == 0)
        {
            return normalizedQuestions;
        }

        for (var index = 0; index < normalizedQuestions.Count; index++)
        {
            normalizedQuestions[index] = normalizedQuestions[index] with
            {
                Options = BuildOptions(sharedOptionTexts, "MCQ_MULTIPLE", normalizedQuestions[index].CorrectAnswer)
            };
        }

        return normalizedQuestions;
    }

    private static List<CreateQuestionDto> DistributeChooseNSharedAnswerAcrossBoxes(List<CreateQuestionDto> questions)
    {
        if (questions.Count <= 1)
        {
            return questions;
        }

        var answerValues = questions
            .Select(question => question.CorrectAnswer?.Trim() ?? string.Empty)
            .Where(answer => !string.IsNullOrWhiteSpace(answer))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (answerValues.Count != 1)
        {
            return questions;
        }

        var tokens = SplitAnswerTokens(answerValues[0])
            .Select(token => token.Trim())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .ToList();
        if (tokens.Count != questions.Count)
        {
            return questions;
        }

        var orderedQuestions = questions
            .Select((question, index) => new { Question = question, Index = index })
            .OrderBy(item => item.Question.QuestionNumber ?? int.MaxValue)
            .ThenBy(item => item.Index)
            .ToList();

        var result = questions.ToList();
        for (var index = 0; index < orderedQuestions.Count; index++)
        {
            var originalIndex = orderedQuestions[index].Index;
            result[originalIndex] = result[originalIndex] with
            {
                CorrectAnswer = tokens[index]
            };
        }

        return result;
    }

    private static List<CreateQuestionDto> NormalizeMatchingSharedOptionBank(
        string mappedQuestionType,
        List<CreateQuestionDto> questions,
        string? instruction,
        string? rawBlockText,
        string? passageContent = null)
    {
        if (questions.Count == 0)
        {
            return questions;
        }

        var hasMeaningfulOptions = questions.Any(question =>
            question.Options.Count > 0 &&
            !IsAllSingleLetterOptions(question.Options.Select(o => o.OptionText ?? string.Empty).ToList()));
        if (hasMeaningfulOptions)
        {
            return questions;
        }

        var sharedOptions = ExtractMatchingSharedOptionBank(instruction)
            .Concat(ExtractMatchingSharedOptionBank(rawBlockText))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (sharedOptions.Count < 2 &&
            string.Equals(mappedQuestionType, "MATCHING_INFO", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(passageContent))
        {
            sharedOptions = ExtractParagraphLabelsForOptions(passageContent);
        }

        if (sharedOptions.Count < 2)
        {
            return questions;
        }

        return questions
            .Select(question => question with
            {
                Options = BuildOptions(sharedOptions, mappedQuestionType, question.CorrectAnswer)
            })
            .ToList();
    }

    private static List<string> ExtractParagraphLabelsForOptions(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return [];
        }

        return Regex.Matches(
                content,
                @"(?m)^\s*(?:\*\*)?(?<label>[A-Z])(?:\s*[).:\-]|[.])?(?:\*\*)?(?:\s+\S.*)?$")
            .Select(match => match.Groups["label"].Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.ToUpperInvariant())
            .Distinct()
            .OrderBy(label => label)
            .ToList();
    }

    private static List<string> ExtractMatchingSharedOptionBank(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return [];
        }

        var normalized = NormalizeExtractedSpacing(source)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var colonMatches = Regex.Matches(
                normalized,
                @"(?is)(?<![A-Za-z\-])(?<label>[A-H])\s*:\s*(?<text>.*?)(?=\s*(?<![A-Za-z\-])[A-H]\s*:\s*|\z)")
            .Cast<Match>()
            .Select(match => new
            {
                Label = match.Groups["label"].Value.ToUpperInvariant(),
                Text = CleanMatchingOptionText(match.Groups["text"].Value)
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.Text))
            .ToList();

        if (colonMatches.Count >= 2 && AreSequentialOptionLabels(colonMatches.Select(item => item.Label[0]).ToList()))
        {
            return colonMatches
                .Select(item => $"{item.Label}. {item.Text}")
                .ToList();
        }

        var matches = Regex.Matches(
                normalized,
                @"(?im)^\s*(?<label>[A-H])\s*[.)]\s*(?<text>.+?)(?=\s*$)")
            .Cast<Match>()
            .Select(match => new
            {
                Label = match.Groups["label"].Value.ToUpperInvariant(),
                Text = CleanMatchingOptionText(match.Groups["text"].Value)
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.Text))
            .ToList();

        if (matches.Count < 2)
        {
            return [];
        }

        var labels = matches.Select(item => item.Label[0]).ToList();
        if (!AreSequentialOptionLabels(labels))
        {
            return [];
        }

        return matches
            .Select(item => $"{item.Label}. {item.Text}")
            .ToList();
    }

    private static string? RemoveMatchingOptionBankFromInstruction(string? instruction)
    {
        if (string.IsNullOrWhiteSpace(instruction))
        {
            return instruction;
        }

        var cleaned = Regex.Replace(
            instruction,
            @"(?is)\s+(?<![A-Za-z\-])A\s*:\s*.+?(?=\s*$)",
            string.Empty).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? instruction.Trim() : cleaned;
    }

    private static string CleanMatchingOptionText(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = Regex.Replace(value, @"\s+", " ").Trim().Trim(',', ';');
        cleaned = Regex.Replace(
            cleaned,
            @"(?i)\s+(?:and\s+)?(?:the\s+)?(?:list\s+of\s+)?(?:people|persons|researchers|scientists|categories|options|headings|phrases)\s*$",
            string.Empty).Trim();
        cleaned = Regex.Replace(
            cleaned,
            @"(?i)\s+match\s+each\s+statement.+$",
            string.Empty).Trim();
        cleaned = Regex.Replace(
            cleaned,
            @"(?i)\s+write\s+the\s+correct\s+letter.+$",
            string.Empty).Trim();
        return cleaned.Trim(',', ';', '.', ' ');
    }

    private static bool AreSequentialOptionLabels(IReadOnlyList<char> labels)
    {
        if (labels.Count < 2)
        {
            return false;
        }

        for (var index = 0; index < labels.Count; index++)
        {
            if (labels[index] != 'A' + index)
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsAllSingleLetterOptions(List<string> options)
    {
        if (options == null || options.Count == 0)
        {
            return false;
        }

        foreach (var opt in options)
        {
            if (string.IsNullOrWhiteSpace(opt))
            {
                return false;
            }
            var trimmed = opt.Trim().Trim('.', ')', ':').ToUpperInvariant();
            if (trimmed.Length != 1 || trimmed[0] < 'A' || trimmed[0] > 'Z')
            {
                return false;
            }
        }

        return true;
    }

    private static List<CreateQuestionOptionDto> BuildOptions(
        List<string>? rawOptions,
        string mappedQuestionType,
        string? answer)
    {
        var options = rawOptions?
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Select(option => RemoveSelectionMarkers(UnescapeExtractedText(option.Trim())))
            .Select(SanitizeOptionForStorage)
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .ToList() ?? [];


        if (options.Count == 0 && string.Equals(mappedQuestionType, "TFNG", StringComparison.Ordinal))
        {
            options = ["TRUE", "FALSE", "NOT GIVEN"];
        }
        else if (options.Count == 0 && string.Equals(mappedQuestionType, "YNNG", StringComparison.Ordinal))
        {
            options = ["YES", "NO", "NOT GIVEN"];
        }

        if (!IsOptionBasedType(mappedQuestionType))
        {
            return [];
        }

        var answerTokens = SplitAnswerTokens(answer);
        var result = new List<CreateQuestionOptionDto>(options.Count);
        var stripOptionLabelPrefix = ShouldStripOptionLabelPrefix(mappedQuestionType, options);

        for (var i = 0; i < options.Count; i++)
        {
            var optionLabel = ((char)('A' + i)).ToString();
            var optionText = NormalizeOptionTextForDisplay(options[i], i, stripOptionLabelPrefix);
            if (string.Equals(mappedQuestionType, "MATCHING_HEADINGS", StringComparison.OrdinalIgnoreCase))
            {
                optionText = StripLeadingRomanNumeral(optionText);
            }

            if (IsMcqType(mappedQuestionType) && IsOptionLabelOnly(optionText))
            {
                optionText = string.Empty;
            }

            var normalizedOptionText = NormalizeToken(optionText);
            var isCorrect =
                answerTokens.Contains(optionLabel) ||
                answerTokens.Contains(normalizedOptionText) ||
                answerTokens.Any(token =>
                    token.StartsWith(optionLabel + ".", StringComparison.Ordinal) ||
                    token.StartsWith(optionLabel + " ", StringComparison.Ordinal));

            result.Add(new CreateQuestionOptionDto(
                OptionText: optionText,
                ImageUrl: null,
                IsCorrect: isCorrect,
                OrderIndex: i));
        }

        return result;
    }

    private static bool ShouldStripOptionLabelPrefix(string mappedQuestionType, IReadOnlyList<string> options)
    {
        if (mappedQuestionType is not "MCQ_SINGLE" and not "MCQ_MULTIPLE" and not "MCQ_CHOOSE_N" and not "FLOWCHART_COMPLETION" and not "SUMMARY_COMPLETION" and not "TABLE_COMPLETION")
        {
            return false;
        }

        if (options.Count < 2)
        {
            return false;
        }

        var labeledCount = 0;
        foreach (var option in options)
        {
            if (OptionStartsWithLetterLabelRegex().IsMatch(option) ||
                OptionStartsWithLetterSpaceRegex().IsMatch(option))
            {
                labeledCount++;
            }
        }

        return labeledCount >= Math.Max(2, options.Count / 2);
    }

    private static string NormalizeOptionTextForDisplay(string optionText, int optionIndex, bool stripLabelPrefix)
    {
        if (string.IsNullOrWhiteSpace(optionText))
        {
            return optionText;
        }

        var expectedLabel = ((char)('A' + optionIndex)).ToString();
        var text = RemoveSelectionMarkers(optionText).Trim();

        if (!stripLabelPrefix)
        {
            return NormalizeExtractedSpacing(text).Trim();
        }

        var labeledMatch = OptionStartsWithLetterLabelRegex().Match(text);
        if (labeledMatch.Success &&
            string.Equals(labeledMatch.Groups["label"].Value, expectedLabel, StringComparison.OrdinalIgnoreCase))
        {
            text = labeledMatch.Groups["text"].Value.Trim();
        }
        else
        {
            var spacedLabelMatch = OptionStartsWithLetterSpaceRegex().Match(text);
            if (spacedLabelMatch.Success &&
                string.Equals(spacedLabelMatch.Groups["label"].Value, expectedLabel, StringComparison.OrdinalIgnoreCase))
            {
                text = spacedLabelMatch.Groups["text"].Value.Trim();
            }
        }

        // TrÆ°á»ng há»£p OCR cho ra "A A ..." => bá» nhÃ£n trÃ¹ng láº§n 2.
        var duplicateLabelMatch = OptionStartsWithLetterSpaceRegex().Match(text);
        if (duplicateLabelMatch.Success &&
            string.Equals(duplicateLabelMatch.Groups["label"].Value, expectedLabel, StringComparison.OrdinalIgnoreCase))
        {
            text = duplicateLabelMatch.Groups["text"].Value.Trim();
        }

        return NormalizeExtractedSpacing(text).Trim();
    }

    private static string StripLeadingRomanNumeral(string optionText)
    {
        if (string.IsNullOrWhiteSpace(optionText))
        {
            return optionText;
        }
        var match = Regex.Match(
            optionText,
            @"^\s*(?:(?:i{1,3}|i[vx]|vi{0,3}|x[i]{0,3})\s*(?:[.)\:\-]\s+|\s+)|(?:I{1,3}|I[VX]|VI{0,3}|X[I]{0,3})\s*(?:[.)\:\-]\s+))(?<text>.+)$");
        if (match.Success)
        {
            return match.Groups["text"].Value.Trim();
        }
        return optionText.Trim();
    }
}
