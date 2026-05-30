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

    private static void NormalizeQuestionTypes(IReadOnlyList<GemmaPassagePayload> parsedPassages)
    {
        foreach (var passage in parsedPassages)
        {
            if (passage.Questions is null)
            {
                continue;
            }

            foreach (var question in passage.Questions)
            {
                var mappedType = TryMapQuestionType(ReadJsonAsText(question.QuestionType));
                if (!string.IsNullOrWhiteSpace(mappedType))
                {
                    question.QuestionType = JsonSerializer.SerializeToElement(ToGeminiQuestionType(mappedType));
                }

                var currentOptions = ExtractOptions(question.Options);
                var isMcq = !string.IsNullOrWhiteSpace(mappedType) && IsMcqType(mappedType);
                if (isMcq && (currentOptions.Count == 0 || currentOptions.All(IsOptionLabelOnly)))
                {
                    var questionText = ReadJsonAsText(question.QuestionText) ?? string.Empty;
                    var matchA = Regex.Match(questionText, @"(?<![A-Za-z0-9])A\s*(?:[).:\-]|O\s+|\s{1,3})");
                    var matchB = Regex.Match(questionText, @"(?<![A-Za-z0-9])B\s*(?:[).:\-]|O\s+|\s{1,3})");
                    if (matchA.Success && matchB.Success && matchB.Index > matchA.Index)
                    {
                        var optionBlock = questionText[matchA.Index..];
                        var optionMatches = Regex.Matches(
                                optionBlock,
                                @"(?ms)(?<![A-Za-z0-9])(?<label>[A-H])\s*(?:[).:\-]|O\s+|\s{1,3})(?<text>.*?)(?=(?<![A-Za-z0-9])[A-H]\s*(?:[).:\-]|O\s+|\s{1,3})|\z)")
                            .Cast<Match>()
                            .Select(match => new
                            {
                                Label = match.Groups["label"].Value.ToUpperInvariant(),
                                Text = NormalizeExtractedSpacing(RemoveSelectionMarkers(match.Groups["text"].Value)).Trim()
                            })
                            .Where(item => !string.IsNullOrWhiteSpace(item.Text))
                            .GroupBy(item => item.Label)
                            .OrderBy(group => group.Key)
                            .Select(group => $"{group.Key}. {group.First().Text}")
                            .ToList();

                        if (optionMatches.Count >= 2)
                        {
                            question.Options = JsonSerializer.SerializeToElement(optionMatches);
                            var cleanedQuestionText = questionText[..matchA.Index].Trim();
                            question.QuestionText = JsonSerializer.SerializeToElement(cleanedQuestionText);
                        }
                    }
                }

                question.Options = NormalizeOptionArray(question.Options);
            }
        }
    }
    private static void EnforceQuestionTypeAnchors(List<GemmaQuestionPayload> questions)
    {
        if (questions.Count == 0)
        {
            return;
        }

        var hasExplicitTfngInstruction = false;
        var hasExplicitYnngInstruction = false;

        foreach (var question in questions)
        {
            var questionText = ReadJsonAsText(question.QuestionText) ?? string.Empty;
            if (ContainsTfngInstruction(questionText))
            {
                hasExplicitTfngInstruction = true;
            }

            if (ContainsYnngInstruction(questionText))
            {
                hasExplicitYnngInstruction = true;
            }

            if (MatchingInfoInstructionRegex().IsMatch(questionText))
            {
                question.QuestionType = JsonSerializer.SerializeToElement("MatchingInfo");
                continue;
            }

            if (ContainsMcqMultipleInstruction(questionText))
            {
                question.QuestionType = JsonSerializer.SerializeToElement("McqMultiple");
                continue;
            }

            if (ContainsMcqSingleInstruction(questionText))
            {
                question.QuestionType = JsonSerializer.SerializeToElement("McqSingle");
            }
        }

        if (hasExplicitTfngInstruction && !hasExplicitYnngInstruction)
        {
            foreach (var question in questions)
            {
                if (MapQuestionType(ReadJsonAsText(question.QuestionType)) == "YNNG")
                {
                    question.QuestionType = JsonSerializer.SerializeToElement("TrueFalseNotGiven");
                }
            }
        }
        else if (hasExplicitYnngInstruction && !hasExplicitTfngInstruction)
        {
            foreach (var question in questions)
            {
                if (MapQuestionType(ReadJsonAsText(question.QuestionType)) == "TFNG")
                {
                    question.QuestionType = JsonSerializer.SerializeToElement("YesNoNotGiven");
                }
            }
        }

        EnforceBinaryBlockConsistency(questions);
    }

    private static void EnforceBinaryBlockConsistency(List<GemmaQuestionPayload> questions)
    {
        var orderedQuestions = questions
            .Select((question, index) => new
            {
                Question = question,
                Index = index,
                ParsedNumber = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber))
            })
            .OrderBy(item => item.ParsedNumber ?? int.MaxValue)
            .ThenBy(item => item.Index)
            .ToList();

        for (var i = 0; i < orderedQuestions.Count; i++)
        {
            var startType = MapQuestionType(ReadJsonAsText(orderedQuestions[i].Question.QuestionType));
            if (!IsBinaryQuestionType(startType))
            {
                continue;
            }

            var block = new List<(GemmaQuestionPayload Question, string Type, int? ParsedNumber)>
            {
                (orderedQuestions[i].Question, startType, orderedQuestions[i].ParsedNumber)
            };

            var j = i + 1;
            while (j < orderedQuestions.Count)
            {
                var nextType = MapQuestionType(ReadJsonAsText(orderedQuestions[j].Question.QuestionType));
                if (!IsBinaryQuestionType(nextType))
                {
                    break;
                }

                var previousNumber = block[^1].ParsedNumber;
                var nextNumber = orderedQuestions[j].ParsedNumber;
                if (previousNumber.HasValue &&
                    nextNumber.HasValue &&
                    nextNumber.Value > previousNumber.Value + 1)
                {
                    break;
                }

                block.Add((orderedQuestions[j].Question, nextType, nextNumber));
                j++;
            }

            if (block.Count >= 2)
            {
                var tfngCount = block.Count(entry => entry.Type == "TFNG");
                var ynngCount = block.Count(entry => entry.Type == "YNNG");

                if (tfngCount > 0 && ynngCount > 0)
                {
                    var preferredType = tfngCount >= ynngCount
                        ? "TrueFalseNotGiven"
                        : "YesNoNotGiven";

                    foreach (var entry in block)
                    {
                        entry.Question.QuestionType = JsonSerializer.SerializeToElement(preferredType);
                    }
                }
            }

            i = Math.Max(i, j - 1);
        }
    }

    private static bool IsBinaryQuestionType(string mappedType) =>
        mappedType is "TFNG" or "YNNG";

    private static string DetectQuestionType(
        string questionText,
        List<string> options,
        string? currentType,
        string? answerText)
    {
        var normalizedCurrentType = NormalizeQuestionTypeToken(currentType);

        if (MatchingInfoInstructionRegex().IsMatch(questionText))
        {
            return "MatchingInfo";
        }

        if (ContainsMcqMultipleInstruction(questionText))
        {
            return "McqMultiple";
        }

        if (ContainsMcqSingleInstruction(questionText))
        {
            return "McqSingle";
        }

        if (ContainsTfngInstruction(questionText))
        {
            return "TrueFalseNotGiven";
        }

        if (ContainsYnngInstruction(questionText))
        {
            return "YesNoNotGiven";
        }

        if (FillInBlankInstructionRegex().IsMatch(questionText) ||
            LooksLikeCompletionInstruction(questionText))
        {
            return "FillInBlanks";
        }

        if (LooksLikeMcqChoiceQuestion(questionText, options, answerText))
        {
            return HasMultipleLetterAnswerTokens(answerText) ? "McqMultiple" : "McqSingle";
        }

        if (TryInferQuestionTypeFromAnswer(answerText, out var inferredTypeFromAnswer))
        {
            return inferredTypeFromAnswer;
        }

        if (HasMultipleLetterAnswerTokens(answerText))
        {
            return "McqMultiple";
        }

        if (normalizedCurrentType is "MCQCHOOSEN" or "MULTIPLECHOICECHOOSEN")
        {
            return "McqChooseN";
        }

        if (normalizedCurrentType is "MCQMULTIPLE" or "MULTIPLECHOICEMULTIPLE")
        {
            return "McqMultiple";
        }

        if (normalizedCurrentType is "MATCHINGINFO" or "MATCHINGINFORMATION")
        {
            if (HasExplicitMatchingTaskInstruction(questionText) || !LooksLikeMcqChoiceSet(options))
            {
                return "MatchingInfo";
            }

            return HasMultipleLetterAnswerTokens(answerText) ? "McqMultiple" : "McqSingle";
        }

        if (normalizedCurrentType == "MATCHINGHEADINGS")
        {
            return "MatchingHeadings";
        }

        // Dáº¡ng Matching Headings thÆ°á»ng cÃ³ instruction kiá»ƒu:
        // "The text has 7 paragraphs (A-G)" hoáº·c cÃ¢u há»i "Paragraph A/B/C..."
        if (MatchingHeadingsInstructionRegex().IsMatch(questionText))
        {
            return "MatchingHeadings";
        }

        // Dáº¡ng choose N statements:
        // "FIVE of the following statements are true ... in any order"
        if (ChooseNStatementsInstructionRegex().IsMatch(questionText))
        {
            return "McqChooseN";
        }

        // TrÆ°á»ng há»£p model bÃ³p mÃ©o choose-N thÃ nh tá»«ng question statement:
        // náº¿u question text trÃ¹ng vá»›i má»™t option vÃ  Ä‘Ã¡p Ã¡n lÃ  1 letter A-H.
        if (IsLikelyChooseNStatementRow(questionText, options, answerText))
        {
            return "McqChooseN";
        }

        if (normalizedCurrentType == "MATCHINGFEATURES")
        {
            if (HasExplicitMatchingTaskInstruction(questionText))
            {
                return "MatchingFeatures";
            }

            if (LooksLikeMcqChoiceSet(options))
            {
                return HasMultipleLetterAnswerTokens(answerText) ? "McqMultiple" : "McqSingle";
            }

            return "MatchingFeatures";
        }

        if (HasExplicitMatchingTaskInstruction(questionText) ||
            (MatchingInstructionRegex().IsMatch(questionText) && !LooksLikeMcqChoiceSet(options)) ||
            IsLetterLabelOptionSet(options))
        {
            return "MatchingInfo";
        }

        if (options.Count == 0)
        {
            return string.IsNullOrWhiteSpace(currentType) ? "FillInBlanks" : currentType;
        }

        return string.IsNullOrWhiteSpace(currentType) ? "MultipleChoice" : currentType;
    }

    private static bool ContainsMcqSingleInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        return ChooseCorrectAnswerOrAnswersRegex().IsMatch(questionText) &&
               !ContainsMcqMultipleInstruction(questionText);
    }

    private static bool LooksLikeCompletionInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        return Regex.IsMatch(
            questionText,
            @"(?i)\b(complete\s+the|complete\s+each|complete\s+the\s+following|fill\s+in\s+the|no\s+more\s+than|one\s+word(?:\s+only)?|two\s+words(?:\s+only)?|three\s+words(?:\s+only)?|choose\s+(?:no\s+more\s+than|one\s+word|two\s+words|three\s+words)\s+from\s+the\s+(?:passage|text))\b");
    }

    private static bool LooksLikeMcqChoiceQuestion(
        string questionText,
        List<string> options,
        string? answerText)
    {
        if (!LooksLikeMcqChoiceSet(options) && !HasMeaningfulChoiceOptions(options))
        {
            return false;
        }

        if (HasExplicitMcqInstruction(questionText))
        {
            return true;
        }

        return HasSingleLetterAnswer(answerText) &&
               !HasExplicitMatchingTaskInstruction(questionText);
    }

    private static bool LooksLikeMcqChoiceSet(List<string> options)
    {
        if (options.Count is < 2 or > 5)
        {
            return false;
        }

        var labeledCount = 0;
        var distinctLabels = new HashSet<char>();
        foreach (var option in options)
        {
            var match = OptionStartsWithLetterLabelRegex().Match(option);
            if (!match.Success)
            {
                continue;
            }

            var label = char.ToUpperInvariant(match.Groups["label"].Value[0]);
            if (label is < 'A' or > 'E')
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(match.Groups["text"].Value))
            {
                labeledCount++;
                distinctLabels.Add(label);
            }
        }

        return labeledCount >= 2 && distinctLabels.Count >= 2;
    }

    private static bool HasExplicitMatchingTaskInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        return MatchingInfoInstructionRegex().IsMatch(questionText) ||
               MatchingHeadingsInstructionRegex().IsMatch(questionText) ||
               Regex.IsMatch(
                   questionText,
                   @"(?i)\b(match|classify)\s+(?:each|the|one|information|statement|feature|person|researcher|paragraph|heading)\b|\bwhich\s+paragraph\b|\buse\s+the\s+information\s+in\s+the\s+text\s+to\s+match\b|\byou\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\b|\blist\s+of\s+(?:headings|people|researchers|phrases|options|features)\b");
    }

    private static bool ContainsMcqMultipleInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        return ChooseCorrectAnswersOnlyRegex().IsMatch(questionText);
    }

    private static bool ContainsTfngInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var tokens = ExtractUpperTokens(questionText);
        return tokens.Contains("TRUE") &&
               tokens.Contains("FALSE") &&
               tokens.Contains("NOT") &&
               tokens.Contains("GIVEN");
    }

    private static bool ContainsYnngInstruction(string questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var tokens = ExtractUpperTokens(questionText);
        return tokens.Contains("YES") &&
               tokens.Contains("NO") &&
               tokens.Contains("NOT") &&
               tokens.Contains("GIVEN");
    }

    private static HashSet<string> ExtractUpperTokens(string text) =>
        Regex.Matches(text.ToUpperInvariant(), @"[A-Z]+")
            .Select(match => match.Value)
            .ToHashSet(StringComparer.Ordinal);

    private static bool IsLikelyChooseNStatementRow(
        string questionText,
        List<string> options,
        string? answerText)
    {
        if (options.Count < 5 || !HasSingleLetterAnswer(answerText))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(questionText))
        {
            return false;
        }

        var normalizedQuestionText = NormalizeToken(questionText);
        return options.Any(option => NormalizeToken(option) == normalizedQuestionText);
    }

    private static string NormalizeQuestionTypeToken(string? rawQuestionType) =>
        Regex.Replace(rawQuestionType ?? string.Empty, @"[^a-zA-Z0-9]", string.Empty)
            .Trim()
            .ToUpperInvariant();

    private static bool HasSingleLetterAnswer(string? answerText)
    {
        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }

        return SingleLetterAnswerRegex().IsMatch(answerText.Trim());
    }

    private static bool HasMultipleLetterAnswerTokens(string? answerText)
    {
        if (string.IsNullOrWhiteSpace(answerText))
        {
            return false;
        }

        var tokens = SplitAnswerTokens(answerText)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .ToList();
        if (tokens.Count < 2)
        {
            return false;
        }

        return tokens.All(IsSingleLetterAnswerToken);
    }

    private static bool IsLetterLabelOptionSet(List<string> options)
    {
        if (options.Count < 5)
        {
            return false;
        }

        var labeledCount = options.Count(option => OptionStartsWithLetterLabelRegex().IsMatch(option));
        return labeledCount >= Math.Min(options.Count, 5);
    }

    private static bool IsLetterChoiceOptionSet(List<string> options)
    {
        if (options.Count < 5)
        {
            return false;
        }

        var distinctLetters = new HashSet<char>();
        foreach (var option in options)
        {
            var normalized = option.Trim().Trim('.', ')', ':').ToUpperInvariant();
            if (normalized.Length != 1 || normalized[0] is < 'A' or > 'H')
            {
                return false;
            }

            distinctLetters.Add(normalized[0]);
        }

        return distinctLetters.Count >= 5;
    }

    private static JsonElement? NormalizeOptionArray(JsonElement? optionsElement)
    {
        if (optionsElement == null)
        {
            return null;
        }

        var options = ExtractOptions(optionsElement.Value);
        if (options.Count == 0)
        {
            return optionsElement;
        }

        var labeledOptions = options
            .Select(option =>
            {
                var match = OptionStartsWithLetterLabelRegex().Match(option);
                return new
                {
                    Raw = option,
                    HasLabel = match.Success,
                    Label = match.Success ? match.Groups["label"].Value[0] : '\0',
                    Text = match.Success ? match.Groups["text"].Value.Trim() : option.Trim()
                };
            })
            .ToList();

        if (labeledOptions.Count(x => x.HasLabel) < 2)
        {
            return optionsElement;
        }

        var normalizedOptions = labeledOptions
            .OrderBy(x => x.HasLabel ? x.Label : '{')
            .ThenBy(x => x.Raw, StringComparer.Ordinal)
            .Select(x => x.Text)
            .ToList();

        return JsonSerializer.SerializeToElement(normalizedOptions);
    }
}
