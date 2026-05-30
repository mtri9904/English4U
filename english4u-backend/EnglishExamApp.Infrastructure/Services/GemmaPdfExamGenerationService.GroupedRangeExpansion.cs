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
    private int ExpandGroupedRangeQuestions(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyList<string> rawPassages,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var expandedCount = 0;
        expandedCount += ExpandMultiBlankCompletionRows(parsedPassages, answerKeyMap);

        for (var passageIndex = 0; passageIndex < parsedPassages.Count; passageIndex++)
        {
            var payload = parsedPassages[passageIndex];
            var questions = payload.Questions;
            if (questions is null || questions.Count == 0)
            {
                continue;
            }

            var rawPassageText = passageIndex < rawPassages.Count ? rawPassages[passageIndex] : string.Empty;
            var groupedRanges = ExtractExpandableGroupedQuestionRanges(rawPassageText);
            if (groupedRanges.Count == 0)
            {
                continue;
            }

            foreach (var range in groupedRanges)
            {
                expandedCount += ExpandGroupedRangeQuestions(payload, range, answerKeyMap);
            }
        }

        return expandedCount;
    }

    private static int ExpandMultiBlankCompletionRows(
        IReadOnlyList<GemmaPassagePayload> parsedPassages,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var expandedCount = 0;
        foreach (var payload in parsedPassages)
        {
            var questions = payload.Questions;
            if (questions is null || questions.Count == 0)
            {
                continue;
            }

            var expandedQuestions = new List<GemmaQuestionPayload>(questions.Count);
            var hasExpansion = false;
            foreach (var question in questions)
            {
                var mappedType = MapQuestionType(ReadJsonAsText(question.QuestionType));
                if (!string.Equals(mappedType, "TABLE_COMPLETION", StringComparison.Ordinal))
                {
                    expandedQuestions.Add(question);
                    continue;
                }

                var questionText = ReadJsonAsText(question.QuestionText);
                var placeholderNumbers = ExtractQuestionPlaceholderNumbers(questionText);
                if (placeholderNumbers.Count <= 1)
                {
                    expandedQuestions.Add(question);
                    continue;
                }

                var rowAnswers = BuildMultiBlankRowAnswers(question, placeholderNumbers, answerKeyMap);
                for (var index = 0; index < placeholderNumbers.Count; index++)
                {
                    var questionNumber = placeholderNumbers[index];
                    var answer = index < rowAnswers.Count ? rowAnswers[index] : string.Empty;
                    expandedQuestions.Add(CloneQuestionForNumber(question, questionNumber, answer));
                    expandedCount++;
                }

                hasExpansion = true;
            }

            if (!hasExpansion)
            {
                continue;
            }

            payload.Questions = expandedQuestions
                .GroupBy(
                    question => ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber)) ?? int.MaxValue)
                .Select(group => group.First())
                .Select((question, index) => new IndexedQuestion(question, index))
                .OrderBy(item => ParseQuestionNumber(ReadJsonAsText(item.Question.QuestionNumber)) ?? int.MaxValue)
                .ThenBy(item => item.Index)
                .Select(item => item.Question)
                .ToList();
        }

        return expandedCount;
    }

    private static List<int> ExtractQuestionPlaceholderNumbers(string? questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return [];
        }

        return Regex.Matches(questionText, @"\[Q\s*(?<number>\d{1,2})\]", RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Select(match => int.TryParse(match.Groups["number"].Value, out var number) ? number : -1)
            .Where(number => number is >= 1 and <= 45)
            .Distinct()
            .ToList();
    }

    private static List<string> BuildMultiBlankRowAnswers(
        GemmaQuestionPayload template,
        IReadOnlyList<int> placeholderNumbers,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var answerKeyTokens = placeholderNumbers
            .Select(number => answerKeyMap.TryGetValue(number, out var answer) ? NormalizeSingleAnswerToken(answer) : string.Empty)
            .ToList();
        if (answerKeyTokens.All(answer => !string.IsNullOrWhiteSpace(answer)))
        {
            return answerKeyTokens;
        }

        var rowAnswerTokens = SplitAnswerTokensOrdered(ReadJsonAsText(template.Answer))
            .Where(IsSingleLetterAnswerToken)
            .ToList();
        if (rowAnswerTokens.Count == placeholderNumbers.Count)
        {
            return rowAnswerTokens;
        }

        return answerKeyTokens;
    }

    private static GemmaQuestionPayload CloneQuestionForNumber(
        GemmaQuestionPayload template,
        int questionNumber,
        string answer) =>
        new()
        {
            QuestionNumber = JsonString(questionNumber.ToString(CultureInfo.InvariantCulture)),
            QuestionType = CloneJsonElement(template.QuestionType),
            Instruction = CloneJsonElement(template.Instruction),
            QuestionGroup = CloneJsonElement(template.QuestionGroup),
            QuestionText = CloneJsonElement(template.QuestionText),
            Options = CloneJsonElement(template.Options),
            Answer = JsonString(answer),
            Explanation = CloneJsonElement(template.Explanation)
        };

    private static int ExpandGroupedRangeQuestions(
        GemmaPassagePayload payload,
        GroupedQuestionRange range,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var questions = payload.Questions;
        if (questions is null || questions.Count == 0)
        {
            return 0;
        }

        var expectedNumbers = Enumerable.Range(range.StartQuestion, range.EndQuestion - range.StartQuestion + 1).ToList();
        var questionsByNumber = questions
            .Select(question => new
            {
                Question = question,
                Number = ParseQuestionNumber(ReadJsonAsText(question.QuestionNumber))
            })
            .Where(item => item.Number.HasValue)
            .GroupBy(item => item.Number!.Value)
            .ToDictionary(group => group.Key, group => group.First().Question);

        var missingNumbers = expectedNumbers
            .Where(number => !questionsByNumber.ContainsKey(number))
            .ToList();
        if (missingNumbers.Count == 0)
        {
            return 0;
        }

        var templateNumber = expectedNumbers.FirstOrDefault(questionsByNumber.ContainsKey);
        if (templateNumber == 0 || !questionsByNumber.TryGetValue(templateNumber, out var template))
        {
            return 0;
        }

        var answerTokens = BuildGroupedRangeAnswerTokens(range, template, answerKeyMap);
        var expandedQuestions = 0;
        for (var index = 0; index < expectedNumbers.Count; index++)
        {
            var questionNumber = expectedNumbers[index];
            var answer = index < answerTokens.Count ? answerTokens[index] : string.Empty;

            if (questionsByNumber.TryGetValue(questionNumber, out var existingQuestion))
            {
                if (!string.IsNullOrWhiteSpace(answer))
                {
                    existingQuestion.Answer = JsonString(answer);
                }

                continue;
            }

            var clonedQuestion = new GemmaQuestionPayload
            {
                QuestionNumber = JsonString(questionNumber.ToString(CultureInfo.InvariantCulture)),
                QuestionType = CloneJsonElement(template.QuestionType),
                Instruction = CloneJsonElement(template.Instruction),
                QuestionGroup = CloneJsonElement(template.QuestionGroup),
                QuestionText = CloneJsonElement(template.QuestionText),
                Options = CloneJsonElement(template.Options),
                Answer = JsonString(answer),
                Explanation = CloneJsonElement(template.Explanation)
            };

            questions.Add(clonedQuestion);
            questionsByNumber[questionNumber] = clonedQuestion;
            expandedQuestions++;
        }

        if (expandedQuestions > 0)
        {
            payload.Questions = questions
                .Select((question, index) => new IndexedQuestion(question, index))
                .OrderBy(item => ParseQuestionNumber(ReadJsonAsText(item.Question.QuestionNumber)) ?? int.MaxValue)
                .ThenBy(item => item.Index)
                .Select(item => item.Question)
                .ToList();
        }

        return expandedQuestions;
    }

    private static List<string> BuildGroupedRangeAnswerTokens(
        GroupedQuestionRange range,
        GemmaQuestionPayload template,
        IReadOnlyDictionary<int, string> answerKeyMap)
    {
        var expectedNumbers = Enumerable.Range(range.StartQuestion, range.EndQuestion - range.StartQuestion + 1).ToList();
        var perQuestionAnswers = expectedNumbers
            .Select(number => answerKeyMap.TryGetValue(number, out var answer) ? NormalizeSingleAnswerToken(answer) : string.Empty)
            .ToList();
        if (perQuestionAnswers.All(answer => !string.IsNullOrWhiteSpace(answer)))
        {
            return perQuestionAnswers;
        }

        var combinedAnswer = answerKeyMap.TryGetValue(range.StartQuestion, out var answerFromStart)
            ? answerFromStart
            : ReadJsonAsText(template.Answer);
        var tokens = SplitAnswerTokensOrdered(combinedAnswer)
            .Where(IsSingleLetterAnswerToken)
            .ToList();
        if (tokens.Count >= expectedNumbers.Count)
        {
            return tokens.Take(expectedNumbers.Count).ToList();
        }

        return perQuestionAnswers;
    }

    private static string NormalizeSingleAnswerToken(string? answer)
    {
        var tokens = SplitAnswerTokensOrdered(answer)
            .Where(IsSingleLetterAnswerToken)
            .ToList();
        return tokens.Count == 1 ? tokens[0] : string.Empty;
    }

    private static List<GroupedQuestionRange> ExtractExpandableGroupedQuestionRanges(string rawPassageText)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return [];
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var headingMatches = QuestionRangeBoundaryRegex()
            .Matches(normalized)
            .Cast<Match>()
            .Select(match => new
            {
                Match = match,
                StartQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value),
                EndQuestion = ParseOcrQuestionNumber(match.Groups["end"].Value)
            })
            .Where(item => item.StartQuestion > 0 &&
                           item.EndQuestion >= item.StartQuestion &&
                           IsQuestionGroupHeadingLine(normalized, item.Match.Index))
            .OrderBy(item => item.Match.Index)
            .ToList();

        var ranges = new List<GroupedQuestionRange>();
        for (var index = 0; index < headingMatches.Count; index++)
        {
            var current = headingMatches[index];
            var blockStart = current.Match.Index;
            var blockEnd = index == headingMatches.Count - 1
                ? normalized.Length
                : headingMatches[index + 1].Match.Index;
            if (blockEnd <= blockStart)
            {
                continue;
            }

            var block = normalized[blockStart..blockEnd].Trim();
            var rangeLength = current.EndQuestion - current.StartQuestion + 1;
            if (rangeLength is < 2 or > 6)
            {
                continue;
            }

            if (!LooksLikeSingleGroupedChooseNBlock(block, rangeLength))
            {
                continue;
            }

            ranges.Add(new GroupedQuestionRange(current.StartQuestion, current.EndQuestion, block));
        }

        return ranges;
    }

    private static bool IsQuestionGroupHeadingLine(string text, int matchIndex)
    {
        var lineStart = text.LastIndexOf('\n', Math.Max(0, matchIndex));
        lineStart = lineStart < 0 ? 0 : lineStart + 1;
        var lineEnd = text.IndexOf('\n', matchIndex);
        lineEnd = lineEnd < 0 ? text.Length : lineEnd;
        var line = text[lineStart..lineEnd].Trim();

        if (Regex.IsMatch(line, @"(?i)\byou\s+should\s+spend\b|\bbased\s+on\s+reading\s+passage\b"))
        {
            return false;
        }

        return Regex.IsMatch(line, @"(?i)^\s*(?:#+\s*)?questions?\s*\d{1,2}\s*(?:-|to|\u2013|\u2014)\s*\d{1,2}\b");
    }

    private static bool LooksLikeSingleGroupedChooseNBlock(string block, int rangeLength)
    {
        if (string.IsNullOrWhiteSpace(block))
        {
            return false;
        }

        var chooseWord = rangeLength switch
        {
            2 => "(?:two|2)",
            3 => "(?:three|3)",
            4 => "(?:four|4)",
            5 => "(?:five|5)",
            6 => "(?:six|6)",
            _ => @"\d+"
        };

        return Regex.IsMatch(
            block,
            $@"(?is)\b(?:which|choose|write)\s+{chooseWord}\b.*\b(?:letters?|facts?|statements?|options?|following)\b");
    }

    private static JsonElement JsonString(string? value) =>
        JsonSerializer.SerializeToElement(value ?? string.Empty, JsonOptions);

    private static JsonElement? CloneJsonElement(JsonElement? element) =>
        element == null || element.Value.ValueKind is JsonValueKind.Undefined
            ? null
            : element.Value.Clone();
}
