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

    private static string? ExtractSharedInstructionLine(
        string mappedQuestionType,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        if (questions.Count < 2)
        {
            return null;
        }

        var firstLines = questions
            .Select(question => GetFirstMeaningfulLine(question.Content))
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => line!.Trim())
            .ToList();

        if (firstLines.Count < 2)
        {
            return null;
        }

        var mostCommon = firstLines
            .GroupBy(line => line, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ThenByDescending(group => group.Key.Length)
            .FirstOrDefault();

        if (mostCommon is null)
        {
            return ExtractLeadingInstructionLineFromFirstQuestion(mappedQuestionType, questions);
        }

        var minimumRequired = Math.Max(2, (int)Math.Ceiling(questions.Count * 0.6d));
        if (mostCommon.Count() < minimumRequired)
        {
            return ExtractLeadingInstructionLineFromFirstQuestion(mappedQuestionType, questions);
        }

        var candidate = mostCommon.First().Trim();
        if (!LooksLikeInstructionLine(mappedQuestionType, candidate))
        {
            return ExtractLeadingInstructionLineFromFirstQuestion(mappedQuestionType, questions);
        }

        return candidate;
    }

    private static string? ExtractLeadingInstructionLineFromFirstQuestion(
        string mappedQuestionType,
        IReadOnlyList<CreateQuestionDto> questions)
    {
        if (questions.Count < 2)
        {
            return null;
        }

        var lines = GetMeaningfulLines(questions[0].Content);
        var instructionLines = ExtractLeadingInstructionLines(mappedQuestionType, lines);
        if (instructionLines.Count == 0)
        {
            return null;
        }

        return string.Join(" ", instructionLines)
            .Replace("  ", " ")
            .Trim();
    }

    private static string? GetFirstMeaningfulLine(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var lines = text
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return lines.FirstOrDefault();
    }

    private static List<string> GetMeaningfulLines(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        return text
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => line.Trim())
            .ToList();
    }

    private static string? ExtractStrongInstructionLine(string mappedQuestionType, IReadOnlyList<string> lines)
    {
        var instructionLines = ExtractLeadingInstructionLines(mappedQuestionType, lines);
        return instructionLines.Count == 0
            ? null
            : instructionLines[0];
    }

    private static List<string> ExtractLeadingInstructionLines(string mappedQuestionType, IReadOnlyList<string> lines)
    {
        if (lines.Count == 0)
        {
            return [];
        }

        var result = new List<string>();
        var instructionStarted = false;

        foreach (var line in lines)
        {
            if (QuestionRangeBoundaryRegex().IsMatch(line))
            {
                continue;
            }

            if (LeadingQuestionNumberRegex().IsMatch(line) ||
                LooksLikeQuestionBodyLine(line) ||
                TryParseLabeledOptionLine(line, out _, out _))
            {
                break;
            }

            if (!instructionStarted)
            {
                if (!LooksLikeStrongInstructionLine(mappedQuestionType, line))
                {
                    break;
                }

                result.Add(line.Trim());
                instructionStarted = true;
                continue;
            }

            if (AccessOrPageNoiseRegex().IsMatch(line) ||
                ReviewSectionHeadingRegex().IsMatch(line) ||
                LooseAnswerSectionHeadingRegex().IsMatch(line))
            {
                break;
            }

            result.Add(line.Trim());
        }

        return result;
    }

    private static bool LooksLikeInstructionLine(string mappedQuestionType, string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        if (mappedQuestionType is "MATCHING_HEADINGS" &&
            (line.Contains("paragraph", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("heading", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (mappedQuestionType is "MCQ_CHOOSE_N" &&
            (line.Contains("following", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("in any order", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("corresponding letters", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return SharedInstructionLineRegex().IsMatch(line);
    }

    private static bool LooksLikeStrongInstructionLine(string mappedQuestionType, string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        if (ChooseCorrectAnswerOrAnswersRegex().IsMatch(line) ||
            ChooseNStatementsInstructionRegex().IsMatch(line) ||
            FillInBlankInstructionRegex().IsMatch(line) ||
            MatchingInfoInstructionRegex().IsMatch(line) ||
            MatchingHeadingsInstructionRegex().IsMatch(line) ||
            ContainsTfngInstruction(line) ||
            ContainsYnngInstruction(line))
        {
            return true;
        }

        if (mappedQuestionType == "MCQ_CHOOSE_N" &&
            (line.Contains("choose", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("letters", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("following statements", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        if (mappedQuestionType == "SENTENCE_COMPLETION" &&
            (line.Contains("complete the following", StringComparison.OrdinalIgnoreCase) ||
             line.Contains("no more than", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    private static bool LooksLikeAnyStrongInstructionLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        return ChooseCorrectAnswerOrAnswersRegex().IsMatch(line) ||
               ChooseNStatementsInstructionRegex().IsMatch(line) ||
               FillInBlankInstructionRegex().IsMatch(line) ||
               MatchingInfoInstructionRegex().IsMatch(line) ||
               MatchingHeadingsInstructionRegex().IsMatch(line) ||
               ContainsTfngInstruction(line) ||
               ContainsYnngInstruction(line) ||
               (line.Contains("choose", StringComparison.OrdinalIgnoreCase) &&
                line.Contains("letters", StringComparison.OrdinalIgnoreCase));
    }

    private static bool LooksLikeQuestionBodyLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var normalized = Regex.Replace(line, @"\s+", " ").Trim();
        if (normalized.Contains("___", StringComparison.Ordinal))
        {
            return true;
        }

        if (!Regex.IsMatch(normalized, @"\b\d{1,2}\b\s*[.?!]?\s*$"))
        {
            return false;
        }

        var prefix = Regex.Replace(normalized, @"\b\d{1,2}\b\s*[.?!]?\s*$", string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return false;
        }

        var wordCount = Regex.Matches(prefix, @"[A-Za-z][A-Za-z'â€™\-]*").Count;
        return wordCount >= 4;
    }

    private static string? RemoveLeadingInstructionLine(string mappedQuestionType, string? questionContent, string sharedInstruction)
    {
        if (string.IsNullOrWhiteSpace(questionContent) || string.IsNullOrWhiteSpace(sharedInstruction))
        {
            return questionContent?.Trim();
        }

        var withoutRangeHeading = RemoveLeadingQuestionRangeHeading(questionContent)?.Trim();
        var directlyRemoved = TryRemoveInstructionPrefix(withoutRangeHeading, sharedInstruction);
        if (!string.Equals(directlyRemoved, withoutRangeHeading, StringComparison.Ordinal))
        {
            return directlyRemoved;
        }

        var lines = GetMeaningfulLines(questionContent);
        if (lines.Count == 0)
        {
            return questionContent?.Trim();
        }

        if (QuestionRangeBoundaryRegex().IsMatch(lines[0]))
        {
            lines.RemoveAt(0);
        }

        if (lines.Count == 0)
        {
            return questionContent?.Trim();
        }

        var instructionLines = ExtractLeadingInstructionLines(mappedQuestionType, lines);
        if (instructionLines.Count == 0)
        {
            return RemoveLeadingQuestionRangeHeading(questionContent)?.Trim();
        }

        var normalizedSharedInstruction = Regex.Replace(sharedInstruction, @"\s+", " ").Trim();
        var normalizedDetectedInstruction = Regex.Replace(string.Join(" ", instructionLines), @"\s+", " ").Trim();
        if (!string.Equals(normalizedSharedInstruction, normalizedDetectedInstruction, StringComparison.OrdinalIgnoreCase) &&
            !normalizedDetectedInstruction.StartsWith(normalizedSharedInstruction, StringComparison.OrdinalIgnoreCase))
        {
            return RemoveLeadingQuestionRangeHeading(questionContent)?.Trim();
        }

        lines = lines.Skip(instructionLines.Count).ToList();
        return string.Join('\n', lines).Trim();
    }

    private static string TryRemoveInstructionPrefix(string? questionContent, string sharedInstruction)
    {
        if (string.IsNullOrWhiteSpace(questionContent) || string.IsNullOrWhiteSpace(sharedInstruction))
        {
            return questionContent?.Trim() ?? string.Empty;
        }

        var normalizedContent = Regex.Replace(questionContent, @"\s+", " ").Trim();
        var normalizedInstruction = Regex.Replace(sharedInstruction, @"\s+", " ").Trim();
        if (!normalizedContent.StartsWith(normalizedInstruction, StringComparison.OrdinalIgnoreCase))
        {
            return questionContent.Trim();
        }

        return normalizedContent[normalizedInstruction.Length..].Trim();
    }

    private static string? RemoveLeadingQuestionRangeHeading(string? questionContent)
    {
        if (string.IsNullOrWhiteSpace(questionContent))
        {
            return questionContent?.Trim();
        }

        var normalized = questionContent
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var lines = normalized
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        if (lines.Count == 0)
        {
            return normalized;
        }

        if (!QuestionRangeBoundaryRegex().IsMatch(lines[0]))
        {
            return normalized;
        }

        lines.RemoveAt(0);
        return lines.Count == 0
            ? string.Empty
            : string.Join('\n', lines).Trim();
    }
}
