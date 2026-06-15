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
    private static string? SanitizeQuestionContentForStorage(string? value, int? questionNumber)
    {
        var cleaned = SanitizeGeneratedTextForStorage(value, questionNumber, allowInstruction: false);
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return cleaned;
        }

        cleaned = StripLeadingReviewAnswerPrefix(cleaned, questionNumber);
        cleaned = StripLeadingQuestionNumber(cleaned, questionNumber);
        cleaned = DropLeadingPassageBlob(cleaned, questionNumber);
        return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned.Trim();
    }

    private static string? SanitizeInstructionForStorage(string? value)
    {
        var cleaned = SanitizeGeneratedTextForStorage(value, questionNumber: null, allowInstruction: true);
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return cleaned;
        }

        return IsReviewOrSolutionArtifact(cleaned) ? null : cleaned.Trim();
    }

    private static string? SanitizeExplanationForStorage(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var cleaned = SanitizeGeneratedTextForStorage(value, questionNumber: null, allowInstruction: true);
        return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned.Trim();
    }

    private static string? SanitizeAnswerForStorage(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value?.Trim();
        }

        var normalized = NormalizeExtractedSpacing(UnescapeExtractedText(value)).Trim();
        normalized = Regex.Replace(normalized, @"(?is)\b(?:keywords?\s+in\s+questions|similar\s+words?\s+in\s+passage|note\s*:).*$", string.Empty);
        normalized = Regex.Replace(normalized, @"(?i)^\s*answer\s*:\s*", string.Empty).Trim();
        return normalized;
    }

    private static string SanitizeOptionForStorage(string option)
    {
        var cleaned = SanitizeGeneratedTextForStorage(option, questionNumber: null, allowInstruction: false) ?? string.Empty;
        cleaned = StripLeadingReviewAnswerPrefix(cleaned, questionNumber: null);
        if (IsReviewOrSolutionArtifact(cleaned) || LooksLikeInstructionOnly(cleaned))
        {
            return string.Empty;
        }

        return cleaned.Trim();
    }

    private static string? SanitizeGeneratedTextForStorage(string? value, int? questionNumber, bool allowInstruction)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value?.Trim();
        }

        var text = UnescapeExtractedText(value)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        text = RemoveSelectionMarkers(text);
        text = RemoveStorageNoiseLines(text);
        text = CutStorageTextAtReviewMarkers(text);
        if (!allowInstruction)
        {
            text = CutStorageTextAtQuestionInstructionMarkers(text, questionNumber);
        }

        text = NormalizeExtractedSpacing(text).Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static string RemoveStorageNoiseLines(string text)
    {
        var lines = text
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');
        var kept = new List<string>(lines.Length);
        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                kept.Add(string.Empty);
                continue;
            }

            if (Regex.IsMatch(line, @"(?i)^(?:page\s*\d+|access\s+https?://|https?://\S*ieltsonlinetests\.com)\b"))
            {
                continue;
            }

            kept.Add(rawLine);
        }

        return string.Join("\n", kept);
    }

    private static string CutStorageTextAtReviewMarkers(string text)
    {
        var match = Regex.Match(
            text,
            @"(?is)(?<![A-Za-z])(?:solution\s*:|review\s+and\s+explanations?|keywords?\s+in\s+questions|similar\s+words?\s+in\s+passage|note\s*:)\b");
        return match.Success && match.Index > 0
            ? text[..match.Index]
            : text;
    }

    private static string CutStorageTextAtQuestionInstructionMarkers(string text, int? questionNumber)
    {
        var matches = Regex.Matches(
                text,
                @"(?im)^\s*(?:questions?\s*\d{1,2}\s*(?:-|to|–|—)\s*\d{1,2}|choose\s+the\s+correct|complete\s+the\s+sentences?|do\s+the\s+following\s+statements|look\s+at\s+the\s+following|match\s+each\s+statement|for\s+questions?)\b")
            .Cast<Match>()
            .Where(match => match.Index > 0)
            .ToList();
        if (matches.Count > 0)
        {
            text = text[..matches[0].Index];
        }

        if (questionNumber.HasValue)
        {
            var nextQuestion = questionNumber.Value + 1;
            var nextQuestionMatch = Regex.Match(
                text,
                $@"(?s)(?<!\d){nextQuestion}(?!\d)(?=\s|[).:\-]|[A-Za-z])");
            if (nextQuestionMatch.Success && nextQuestionMatch.Index > 0)
            {
                text = text[..nextQuestionMatch.Index];
            }
        }

        return text;
    }

    private static string StripLeadingReviewAnswerPrefix(string text, int? questionNumber)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        if (questionNumber.HasValue)
        {
            text = Regex.Replace(
                text,
                $@"(?is)^\s*(?:answer\s*:\s*)?(?:TRUE|FALSE|YES|NO|NOT\s+GIVEN|[A-H])?\s*(?:keywords?.*?)?Q\s*{questionNumber.Value}\s*[:.]?\s*",
                string.Empty,
                RegexOptions.IgnoreCase);
        }

        return Regex.Replace(text, @"(?i)^\s*answer\s*:\s*(?:TRUE|FALSE|YES|NO|NOT\s+GIVEN|[A-H])?\s*", string.Empty).Trim();
    }

    private static string StripLeadingQuestionNumber(string text, int? questionNumber)
    {
        if (!questionNumber.HasValue || string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        return Regex.Replace(
            text,
            $@"^\s*{questionNumber.Value}\s*[).:\-]?\s*",
            string.Empty,
            RegexOptions.IgnoreCase).Trim();
    }

    private static string DropLeadingPassageBlob(string text, int? questionNumber)
    {
        if (!questionNumber.HasValue || string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        var questionMarker = Regex.Match(
            text,
            $@"(?s)(?<!\d){questionNumber.Value}(?!\d)(?=\s|[).:\-]|[A-Za-z])");
        if (questionMarker.Success && questionMarker.Index > 80)
        {
            return text[questionMarker.Index..].Trim();
        }

        if (Regex.IsMatch(text, @"(?i)\breading\s+passage\b") && text.Length > 180)
        {
            return string.Empty;
        }

        return text;
    }

    private static bool LooksLikeInstructionOnly(string text) =>
        Regex.IsMatch(
            text,
            @"(?i)^\s*(?:choose|write|match|look\s+at|do\s+the\s+following|complete\s+the\s+sentences?|for\s+questions?)\b");

    private static bool IsReviewOrSolutionArtifact(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        return Regex.IsMatch(
            text,
            @"(?i)\b(?:keywords?\s+in\s+questions|similar\s+words?\s+in\s+passage|thus,\s+the\s+correct\s+answer|review\s+and\s+explanations?|solution\s*:|note\s*:|answer\s*:)\b");
    }
}
