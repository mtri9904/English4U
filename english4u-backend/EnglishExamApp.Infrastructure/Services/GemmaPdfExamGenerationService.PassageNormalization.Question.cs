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

    private static string? NormalizeQuestionContent(string mappedQuestionType, string? questionText, int? questionNumber = null)
    {
        if (string.IsNullOrWhiteSpace(questionText))
        {
            return questionText?.Trim();
        }

        var normalized = UnescapeExtractedText(questionText)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        if (!IsCompletionTemplateType(mappedQuestionType, normalized, questionNumber))
        {
            normalized = NormalizeExtractedSpacing(normalized);
            normalized = RemoveSelectionMarkers(normalized);
            return SanitizeQuestionContentForStorage(normalized, questionNumber);
        }

        normalized = NormalizeExtractedSpacing(normalized);
        normalized = RemoveSelectionMarkers(normalized, preserveGapSpacing: true);
        normalized = ReplaceTrailingGapNumberWithPlaceholder(normalized, questionNumber);
        if (BlankPlaceholderRegex().IsMatch(normalized))
        {
            return SanitizeQuestionContentForStorage(NormalizeSentenceCompletionSpacing(normalized), questionNumber);
        }

        var withGapPlaceholder = MissingBlankGapRegex().Replace(normalized, " ___ ");
        if (BlankPlaceholderRegex().IsMatch(withGapPlaceholder))
        {
            return SanitizeQuestionContentForStorage(NormalizeSentenceCompletionSpacing(withGapPlaceholder), questionNumber);
        }

        normalized = ReplaceInlineGapNumberWithPlaceholder(normalized, questionNumber);
        if (BlankPlaceholderRegex().IsMatch(normalized))
        {
            return SanitizeQuestionContentForStorage(NormalizeSentenceCompletionSpacing(normalized), questionNumber);
        }

        if (SentenceEndingPunctuationRegex().IsMatch(normalized))
        {
            return SanitizeQuestionContentForStorage(
                NormalizeSentenceCompletionSpacing(SentenceEndingPunctuationRegex().Replace(normalized, " ___$1", 1)),
                questionNumber);
        }

        return SanitizeQuestionContentForStorage(NormalizeSentenceCompletionSpacing(normalized + " ___"), questionNumber);
    }

    private static string ReplaceTrailingGapNumberWithPlaceholder(string content, int? questionNumber)
    {
        if (string.IsNullOrWhiteSpace(content) || !questionNumber.HasValue)
        {
            return content;
        }

        return Regex.Replace(
            content,
            $@"\s*\b{questionNumber.Value}\b(?<punct>\s*[.?!])?\s*$",
            " ___${punct}",
            RegexOptions.IgnoreCase);
    }

    private static string ReplaceInlineGapNumberWithPlaceholder(string content, int? questionNumber)
    {
        if (string.IsNullOrWhiteSpace(content) || !questionNumber.HasValue)
        {
            return content;
        }

        var matches = Regex.Matches(
            content,
            $@"(?<!\d){Regex.Escape(questionNumber.Value.ToString(CultureInfo.InvariantCulture))}(?!\d)",
            RegexOptions.IgnoreCase);

        foreach (Match match in matches)
        {
            if (!match.Success)
            {
                continue;
            }

            var prefix = content[..match.Index];
            var suffix = content[(match.Index + match.Length)..];
            if (string.IsNullOrWhiteSpace(prefix) || string.IsNullOrWhiteSpace(suffix))
            {
                continue;
            }

            var trimmedPrefix = prefix.TrimEnd();
            var trimmedSuffix = suffix.TrimStart();
            if (trimmedPrefix.Length == 0)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(trimmedSuffix))
            {
                continue;
            }

            var suffixProbe = trimmedSuffix.Length <= 24
                ? trimmedSuffix
                : trimmedSuffix[..24];
            if (BlankPlaceholderRegex().IsMatch(suffixProbe) || Regex.IsMatch(trimmedSuffix, @"^[_\-.]{2,}"))
            {
                continue;
            }

            var precedingTokenMatch = Regex.Match(trimmedPrefix, @"([A-Za-z][A-Za-z'â€™\-]*|\d{4}s?|\d{4})\s*$");
            if (!precedingTokenMatch.Success)
            {
                continue;
            }

            var normalized = $"{trimmedPrefix} ___ {trimmedSuffix}";
            normalized = Regex.Replace(normalized, @"\s{2,}", " ");
            return normalized.Trim();
        }

        return content;
    }

    private static string UnescapeExtractedText(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        return value
            .Replace("\\r\\n", "\n")
            .Replace("\\n", "\n")
            .Replace("\\r", "\n")
            .Replace("\\t", "\t")
            .Replace("\\\"", "\"");
    }

    private static string NormalizeSentenceCompletionSpacing(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n[ \t]+", "\n");
        normalized = Regex.Replace(normalized, @"\s*___\s*", " ___ ");
        normalized = Regex.Replace(normalized, @"(?:\s*___\s*){2,}", " ___ ");
        normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");
        return normalized.Trim();
    }

    private static string RemoveSelectionMarkers(string value, bool preserveGapSpacing = false)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = SelectionMarkerRegex().Replace(value, " ");
        if (!preserveGapSpacing)
        {
            normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        }

        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n[ \t]+", "\n");
        return normalized.Trim();
    }

    private static string NormalizeExtractedSpacing(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        // GhÃ©p tá»« bá»‹ ngáº¯t dÃ²ng báº±ng dáº¥u gáº¡ch ná»‘i á»Ÿ cuá»‘i dÃ²ng.
        normalized = HyphenatedWordAcrossLinesRegex().Replace(normalized, string.Empty);
        // Vá»›i ngáº¯t dÃ²ng má»m giá»¯a 2 chá»¯ thÆ°á»ng, ná»‘i báº±ng khoáº£ng tráº¯ng Ä‘á»ƒ trÃ¡nh dÃ­nh chá»¯.
        normalized = SoftLineBreakBetweenLowercaseWordsRegex().Replace(normalized, " ");

        normalized = FixKnownGluedWordsRegex().Replace(
            normalized,
            match => match.Groups["prefix"].Value + " " + match.Groups["suffix"].Value);

        return normalized;
    }
}
