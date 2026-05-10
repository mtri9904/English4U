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

    private static List<CreateQuestionOptionDto> BuildOptions(
        List<string>? rawOptions,
        string mappedQuestionType,
        string? answer)
    {
        var options = rawOptions?
            .Where(option => !string.IsNullOrWhiteSpace(option))
            .Select(option => RemoveSelectionMarkers(UnescapeExtractedText(option.Trim())))
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
            var optionText = NormalizeOptionTextForDisplay(options[i], i, stripOptionLabelPrefix);
            if (IsMcqType(mappedQuestionType) && IsOptionLabelOnly(optionText))
            {
                optionText = string.Empty;
            }

            var optionLabel = ((char)('A' + i)).ToString();
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
        if (mappedQuestionType is not "MCQ_SINGLE" and not "MCQ_MULTIPLE" and not "MCQ_CHOOSE_N" and not "FLOWCHART_COMPLETION")
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
}
