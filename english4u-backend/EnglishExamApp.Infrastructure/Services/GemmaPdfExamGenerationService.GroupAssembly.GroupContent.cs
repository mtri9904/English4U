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

    private static bool ShouldStartNewQuestionGroup(QuestionGroupBuilder currentGroup, string? boundaryToken)
    {
        if (string.IsNullOrWhiteSpace(boundaryToken))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(currentGroup.BoundaryToken))
        {
            return currentGroup.Questions.Count > 0;
        }

        return !string.Equals(currentGroup.BoundaryToken, boundaryToken, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractExplicitGroupBoundaryToken(string mappedQuestionType, string? questionText)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return null;
        }

        var lines = questionText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();
        if (lines.Count == 0)
        {
            return null;
        }

        var firstLine = lines[0].Trim();
        var rangeMatch = QuestionRangeBoundaryRegex().Match(firstLine);
        if (rangeMatch.Success)
        {
            var start = ParseOcrQuestionNumber(rangeMatch.Groups["start"].Value);
            var end = ParseOcrQuestionNumber(rangeMatch.Groups["end"].Value);
            if (start > 0 && end >= start)
            {
                return $"RANGE:{start}-{end}";
            }
        }

        var instructionLine = ExtractStrongInstructionLine(mappedQuestionType, lines);
        return string.IsNullOrWhiteSpace(instructionLine)
            ? null
            : $"INSTR:{NormalizeToken(instructionLine)}";
    }

    private static string ResolveGroupInstruction(string mappedQuestionType, string? sharedInstruction)
    {
        if (!string.IsNullOrWhiteSpace(sharedInstruction) &&
            mappedQuestionType is not "MCQ_SINGLE")
        {
            return sharedInstruction.Trim();
        }

        return BuildInstruction(mappedQuestionType);
    }

    private static string? BuildGroupContentData(
        string mappedQuestionType,
        string? sharedInstruction,
        List<CreateQuestionDto> questions)
    {
        if (string.Equals(mappedQuestionType, "MCQ_MULTIPLE", StringComparison.Ordinal) &&
            questions.Count > 1)
        {
            for (var index = 0; index < questions.Count; index++)
            {
                questions[index] = questions[index] with { Content = string.Empty };
            }

            return BuildListeningMultiSelectContentData(string.Empty);
        }

        if (!string.Equals(mappedQuestionType, "SENTENCE_COMPLETION", StringComparison.Ordinal))
        {
            return null;
        }

        if (questions.Count <= 1)
        {
            return null;
        }

        var templateLines = questions
            .OrderBy(question => question.QuestionNumber ?? int.MaxValue)
            .Select(BuildSentenceCompletionTemplateLine)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();

        if (templateLines.Count == 0)
        {
            return null;
        }

        for (var index = 0; index < questions.Count; index++)
        {
            questions[index] = questions[index] with { Content = null };
        }

        return string.Join("\n", templateLines);
    }

    private static string BuildListeningMultiSelectContentData(string prompt)
    {
        var payload = new
        {
            layout = "listening_multi_select",
            prompt = prompt ?? string.Empty
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    private static string BuildSentenceCompletionTemplateLine(CreateQuestionDto question)
    {
        var content = question.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content) || !question.QuestionNumber.HasValue)
        {
            return string.Empty;
        }

        var placeholderToken = $"[Q{question.QuestionNumber.Value}]";
        if (content.Contains(placeholderToken, StringComparison.Ordinal))
        {
            return content;
        }

        if (BlankPlaceholderRegex().IsMatch(content))
        {
            return BlankPlaceholderRegex().Replace(content, placeholderToken, 1);
        }

        return $"{content} {placeholderToken}".Trim();
    }

    private static string? NormalizeQuestionBody(string mappedQuestionType, string? questionText, int? questionNumber)
    {
        var normalized = NormalizeQuestionContent(mappedQuestionType, questionText, questionNumber);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        var cleaned = normalized
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        cleaned = RemoveLeadingQuestionRangeHeading(cleaned) ?? string.Empty;

        if (questionNumber.HasValue)
        {
            cleaned = Regex.Replace(
                cleaned,
                $@"^\s*{questionNumber.Value}\s*[).:\-]?\s*",
                string.Empty,
                RegexOptions.IgnoreCase);
        }

        if (mappedQuestionType is "MATCHING_HEADINGS" or "MATCHING_INFO" or "MATCHING_FEATURES" or "MATCHING_VISUALS" or "MCQ_CHOOSE_N")
        {
            cleaned = LeadingQuestionNumberRegex().Replace(cleaned, string.Empty, 1);
        }

        return cleaned.Trim();
    }

    private static string? NormalizeAnswerByGroupType(string mappedQuestionType, string? rawAnswer)
    {
        if (string.IsNullOrWhiteSpace(rawAnswer))
        {
            return rawAnswer?.Trim();
        }

        if (mappedQuestionType is not "MCQ_CHOOSE_N" and not "MCQ_MULTIPLE")
        {
            return rawAnswer.Trim();
        }

        var normalizedTokens = SplitAnswerTokens(rawAnswer)
            .Select(token => token.Trim())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => IsSingleLetterAnswerToken(token) ? token.ToUpperInvariant() : token)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return normalizedTokens.Count == 0
            ? rawAnswer.Trim()
            : string.Join("|", normalizedTokens);
    }
}
