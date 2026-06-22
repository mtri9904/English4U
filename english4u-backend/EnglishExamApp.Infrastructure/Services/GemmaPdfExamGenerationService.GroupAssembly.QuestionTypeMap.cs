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

    private static HashSet<string> SplitAnswerTokens(string? answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return [];
        }

        var tokens = Regex.Split(answer, @"\s*(?:\||,|/|;|&|\band\b)\s*", RegexOptions.IgnoreCase)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => NormalizeToken(token))
            .ToHashSet(StringComparer.Ordinal);

        return tokens;
    }

    private static int? ParseQuestionNumber(string? rawQuestionNumber)
    {
        if (string.IsNullOrWhiteSpace(rawQuestionNumber))
        {
            return null;
        }

        var match = Regex.Match(rawQuestionNumber, @"\d+");
        if (!match.Success)
        {
            return null;
        }

        return int.TryParse(match.Value, out var number) ? number : null;
    }

    private static string NormalizeToken(string value) =>
        Regex.Replace(value.Trim(), @"\s+", " ").ToUpperInvariant();

    private static string? ReadJsonAsText(JsonElement? element) =>
        element.HasValue ? ReadJsonAsText(element.Value) : null;

    private static string? ReadJsonAsText(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.ToString(),
        JsonValueKind.True => bool.TrueString,
        JsonValueKind.False => bool.FalseString,
        JsonValueKind.Undefined or JsonValueKind.Null => null,
        _ => element.ToString()
    };

    private static List<string> ExtractOptions(JsonElement? optionsElement)
    {
        if (optionsElement == null || optionsElement.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return [];
        }

        var val = optionsElement.Value;
        if (val.ValueKind != JsonValueKind.Array)
        {
            var fallbackOption = ReadJsonAsText(val);
            if (string.IsNullOrWhiteSpace(fallbackOption))
            {
                return [];
            }

            var normalizedFallbackOption = RemoveSelectionMarkers(fallbackOption.Trim());
            return string.IsNullOrWhiteSpace(normalizedFallbackOption) ? [] : [normalizedFallbackOption];
        }

        var options = new List<string>();
        foreach (var item in val.EnumerateArray())
        {
            var optionValue = item.ValueKind switch
            {
                JsonValueKind.String => item.GetString(),
                JsonValueKind.Number => item.ToString(),
                JsonValueKind.True => bool.TrueString,
                JsonValueKind.False => bool.FalseString,
                JsonValueKind.Object => ReadOptionObject(item),
                _ => null
            };

            if (!string.IsNullOrWhiteSpace(optionValue))
            {
                var normalizedOptionValue = RemoveSelectionMarkers(optionValue.Trim());
                if (!string.IsNullOrWhiteSpace(normalizedOptionValue))
                {
                    options.Add(normalizedOptionValue);
                }
            }
        }

        return options;
    }

    private static string? ReadOptionObject(JsonElement optionObject)
    {
        var label = TryReadOptionProperty(optionObject, "label");
        var text =
            TryReadOptionProperty(optionObject, "text") ??
            TryReadOptionProperty(optionObject, "content") ??
            TryReadOptionProperty(optionObject, "statement") ??
            TryReadOptionProperty(optionObject, "value");
        var optionText = TryReadOptionProperty(optionObject, "optionText");

        // Æ¯u tiÃªn text Ä‘áº§y Ä‘á»§, trÃ¡nh trÆ°á»ng há»£p optionText chá»‰ lÃ  "A/B/C".
        if (!string.IsNullOrWhiteSpace(text) && !IsSingleLetterOptionLabel(text))
        {
            return text;
        }

        if (!string.IsNullOrWhiteSpace(optionText))
        {
            if (!IsSingleLetterOptionLabel(optionText) || string.IsNullOrWhiteSpace(text))
            {
                return optionText;
            }
        }

        if (!string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        if (!string.IsNullOrWhiteSpace(label))
        {
            return label;
        }

        return optionObject.ToString();
    }

    private static string? TryReadOptionProperty(JsonElement optionObject, string propertyName)
    {
        if (!optionObject.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return ReadJsonAsText(value);
    }

    private static bool IsSingleLetterOptionLabel(string value)
    {
        var normalized = value.Trim().Trim('.', ')', ':').ToUpperInvariant();
        return normalized.Length == 1 && normalized[0] is >= 'A' and <= 'Z';
    }

    private static bool IsOptionBasedType(string mappedQuestionType) =>
        mappedQuestionType is "MCQ_SINGLE" or "MCQ_MULTIPLE" or "MCQ_CHOOSE_N" or "TFNG" or "YNNG" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MATCHING_HEADINGS" or "FLOWCHART_COMPLETION" or "SUMMARY_COMPLETION" or "TABLE_COMPLETION" or "MATCHING_TABLE" or "MAP_LABELLING";

    private static bool IsCompletionTemplateType(string mappedQuestionType) =>
        mappedQuestionType is "SENTENCE_COMPLETION" or "SUMMARY_COMPLETION" or "TABLE_COMPLETION" or "MATCHING_TABLE" or "FLOWCHART_COMPLETION" or "MAP_LABELLING";

    private static bool IsCompletionTemplateType(string mappedQuestionType, string? questionText, int? questionNumber)
    {
        if (!IsCompletionTemplateType(mappedQuestionType))
        {
            return false;
        }

        return IsRealSentenceCompletionQuestion(mappedQuestionType, questionText, questionNumber);
    }

    private static bool IsCompletionTemplateType(string mappedQuestionType, List<CreateQuestionDto> questions)
    {
        if (!IsCompletionTemplateType(mappedQuestionType))
        {
            return false;
        }

        return IsRealSentenceCompletionGroup(mappedQuestionType, questions);
    }

    private static bool IsRealSentenceCompletionQuestion(string mappedQuestionType, string? questionText, int? questionNumber)
    {
        if (mappedQuestionType is not "FLOWCHART_COMPLETION" and not "MAP_LABELLING")
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        if (questionText.Contains("___") || questionText.Contains("..."))
        {
            return true;
        }

        if (questionNumber.HasValue)
        {
            var placeholder = $"[Q{questionNumber.Value}]";
            if (questionText.Contains(placeholder))
            {
                var idx = questionText.IndexOf(placeholder, StringComparison.Ordinal);
                var before = questionText[..idx].Trim();
                var after = questionText[(idx + placeholder.Length)..].Trim();
                if (!string.IsNullOrEmpty(before) && !string.IsNullOrEmpty(after))
                {
                    return true;
                }
            }
            else
            {
                var words = questionText.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (words.Length > 5)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static bool IsRealSentenceCompletionGroup(string mappedQuestionType, List<CreateQuestionDto> questions)
    {
        if (mappedQuestionType is not "FLOWCHART_COMPLETION" and not "MAP_LABELLING")
        {
            return true;
        }

        foreach (var q in questions)
        {
            if (IsRealSentenceCompletionQuestion(mappedQuestionType, q.Content, q.QuestionNumber))
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasSharedCompletionOptionBank(string? instruction, IReadOnlyList<string> options)
    {
        if (options.Count < 2)
        {
            return false;
        }

        var evidenceText = instruction ?? string.Empty;
        if (Regex.IsMatch(
                evidenceText,
                @"(?i)\b(?:list\s+of\s+words|list\s+of\s+phrases|words?\s*,?\s*[A-Z]\s*[-–—]\s*[A-Z]|choose\s+your\s+answers?\s+from\s+the\s+box|from\s+the\s+list\s+below)\b"))
        {
            return true;
        }

        var meaningfulOptions = options
            .Select(option => RemoveSelectionMarkers(option ?? string.Empty).Trim())
            .Count(option => !string.IsNullOrWhiteSpace(option) && !IsOptionLabelOnly(option));
        return meaningfulOptions >= 6;
    }

    private static string BuildInstruction(string mappedQuestionType) => mappedQuestionType switch
    {
        "MCQ_SINGLE" => "Choose the correct answer.",
        "MCQ_MULTIPLE" => "Choose all correct answers.",
        "MCQ_CHOOSE_N" => "Choose the correct answer or answers for each question.",
        "TFNG" => "Do the following statements agree with the information in the passage? (TRUE/FALSE/NOT GIVEN)",
        "YNNG" => "Do the following statements agree with the writer's claims? (YES/NO/NOT GIVEN)",
        "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MATCHING_HEADINGS" => "Match each statement with the correct option.",
        "FLOWCHART_COMPLETION" => "Complete the flowchart with the correct answers.",
        "SENTENCE_COMPLETION" => "Complete the sentences with words from the passage.",
        "SUMMARY_COMPLETION" => "Complete the summary.",
        _ => "Answer the following questions."
    };

    private static string ResolveMappedQuestionType(string? rawGroupType, string? aiMappedQuestionType)
    {
        if (!string.IsNullOrWhiteSpace(aiMappedQuestionType))
        {
            return aiMappedQuestionType;
        }

        var normalizedRawGroupType = NormalizeGroupType(rawGroupType);
        return string.IsNullOrWhiteSpace(normalizedRawGroupType)
            ? "MCQ_SINGLE"
            : normalizedRawGroupType;
    }

    private static string MapQuestionType(string? rawQuestionType) =>
        TryMapQuestionType(rawQuestionType) ?? "MCQ_SINGLE";

    private static string? TryMapQuestionType(string? rawQuestionType)
    {
        var normalized = NormalizeQuestionTypeToken(rawQuestionType);

        return normalized switch
        {
            "MULTIPLECHOICE" => "MCQ_SINGLE",
            "MULTIPLECHOICESINGLE" => "MCQ_SINGLE",
            "MCQSINGLE" => "MCQ_SINGLE",
            "MCQMULTIPLE" => "MCQ_MULTIPLE",
            "MULTIPLECHOICEMULTIPLE" => "MCQ_MULTIPLE",
            "MCQCHOOSEN" => "MCQ_CHOOSE_N",
            "MULTIPLECHOICECHOOSEN" => "MCQ_CHOOSE_N",
            "TRUEFALSENOTGIVEN" => "TFNG",
            "YESNONOTGIVEN" => "YNNG",
            "FILLINBLANKS" => "SENTENCE_COMPLETION",
            "FILLINBLANK" => "SENTENCE_COMPLETION",
            "SENTENCECOMPLETION" => "SENTENCE_COMPLETION",
            "SUMMARYCOMPLETION" => "SUMMARY_COMPLETION",
            "TABLECOMPLETION" => "TABLE_COMPLETION",
            "MATCHINGTABLE" => "MATCHING_TABLE",
            "MATCHING" => "MATCHING_INFO",
            "MATCHINGINFO" => "MATCHING_INFO",
            "MATCHINGINFORMATION" => "MATCHING_INFO",
            "MATCHINGFEATURES" => "MATCHING_FEATURES",
            "MATCHINGVISUALS" => "MATCHING_VISUALS",
            "MATCHINGDRAWINGS" => "MATCHING_VISUALS",
            "MATCHINGIMAGES" => "MATCHING_VISUALS",
            "MATCHINGHEADINGS" => "MATCHING_HEADINGS",
            "FLOWCHARTCOMPLETION" => "FLOWCHART_COMPLETION",
            "MAPLABELLING" => "MAP_LABELLING",
            "MAPLABELING" => "MAP_LABELLING",
            "DIAGRAMLABELLING" => "MAP_LABELLING",
            "DIAGRAMLABELING" => "MAP_LABELLING",
            "SHORTANSWER" => "SHORT_ANSWER",
            "SHORTANSWERQUESTION" => "SHORT_ANSWER",
            _ => null
        };
    }
}
