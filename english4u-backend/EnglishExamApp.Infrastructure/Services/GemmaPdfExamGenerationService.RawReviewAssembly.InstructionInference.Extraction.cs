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

    private static string? TryExtractInstructionFromBlockText(string? blockText, int startQuestion)
    {
        if (string.IsNullOrWhiteSpace(blockText))
        {
            return null;
        }

        var normalized = blockText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\s+https?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bhttps?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bfor\s+more\s+practices\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bpage\s*\d+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\b(?=\s|$)", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        normalized = Regex.Replace(
            normalized,
            @"^(?:Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*[0-9OoIl\|]{1,2}\s*)+",
            string.Empty,
            RegexOptions.IgnoreCase)
            .Trim();
        normalized = Regex.Replace(
            normalized,
            $@"^\s*Question\s*{Regex.Escape(startQuestion.ToString(CultureInfo.InvariantCulture))}\b\s*",
            string.Empty,
            RegexOptions.IgnoreCase)
            .Trim();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var knownPatterns = new[]
        {
            @"^(?<instruction>Answer\s+the\s+following\s+questions\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\.?)",
            @"^(?<instruction>Using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\s*,?\s*complete\s+the\s+following\.?)",
            @"^(?<instruction>Choose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:timeline\s+)?diagram\s+below\.?\s+Write\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+each\s+(?:answer|gap)\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|description)\s+below\.?\s+Choose\s+your\s+answers?\s+from\s+the\s+box\s+below\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|description)\.?\s+Choose\s+your\s+answers?\s+from\s+the\s+box\s+below\.?)",
            @"^(?<instruction>Complete\s+the\s+summary\s+with\s+the\s+list\s+of\s+words\s*,?\s*[A-HI](?:\s*[-â€“]\s*[A-HI])?(?:\s+below)?\.?(?:\s+Write\s+the\s+correct\s+letter\s*,?\s*[A-HI](?:\s*[-â€“]\s*[A-HI])?\s*,?\s+in\s+(?:spaces|boxes)\s+\d{1,2}(?:\s*[-â€“]\s*\d{1,2})?\s+below\.?)?)",
            @"^(?<instruction>Complete\s+the\s+table\s+below\.?\s+Choose\s+\d+\s+answers?\s+from\s+the\s+box\s+and\s+write\s+the\s+correct\s+letter\s*,?\s*[A-L](?:\s*[-â€“]\s*[A-L])?\s*,?\s+next\s+to\s+questions?\s+\d{1,2}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d{1,2}\.?)",
            @"^(?<instruction>Complete\s+the\s+description\s+below\.?\s+Choose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^(?<instruction>Complete\s+the\s+following\s+sentences\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^(?<instruction>Complete\s+the\s+following\s+using\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)(?:\s+for\s+each\s+(?:answer|gap))?\.?)",
            @"^(?<instruction>Re-?order\s+the\s+following\s+letters?\s*\([A-H](?:\s*[-â€“]\s*[A-H])?\)\s+to\s+show\s+the\s+sequence\s+of\s+events(?:\s+according\s+to\s+the\s+passage)?\.?)",
            @"^(?<instruction>Do\s+the\s+following\s+statements?\s+agree\s+with\s+the\s+information\s+given\s+in\s+(?:the\s+(?:text|passage)|Reading\s+Passage\s+\d+)\?\s+For\s+questions?\s+\d{1,2}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d{1,2}\s*,?\s*write\s+TRUE.+?FALSE.+?NOT\s+GIVEN.+?)$",
            @"^(?<instruction>According\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\.?)",
            @"^(?<instruction>According\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\s+from\s+the\s+choices\s+given\.?)",
            @"^(?<instruction>For\s+each\s+question\s*,?\s*only\s+ONE\s+of\s+the\s+choices?\s+is\s+correct\.?\s+Write\s+the\s+corresponding\s+letter\s+in\s+the\s+appropriate\s+box(?:es)?\s+on\s+your\s+answer\s+sheet\.?)",
            @"^(?<instruction>(?:Choose|Circle)\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\.?)",
            @"^(?<instruction>(?:Choose|Circle)\s+the\s+correct\s+answer(?:\s*,?\s*[A-H](?:\s*[-â€“]\s*[A-H])?)?\.?)",
            @"^(?<instruction>Do\s+the\s+following\s+statements?.+?(?:TRUE.+?FALSE.+?NOT\s+GIVEN|YES.+?NO.+?NOT\s+GIVEN))(?=\s+\d{1,2}\s)",
            @"^(?<instruction>Look\s+at\s+the\s+following\s+statements?.+?Match\s+each\s+statement\s+to\s+the\s+correct\s+(?:person|people|researcher|researchers|country|countries|category|categories|group|groups|option|options)\s*,?\s*[A-H](?:\s*[-â€“]\s*[A-H])?\.?(?:\s+You\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\.?)?)",
            @"^(?<instruction>Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases\s+[A-H](?:\s*[-â€“]\s*[A-H])?\s+below\s+to\s+complete\s+each\s+of\s+the\s+following\s+sentences\.?(?:\s+There\s+are\s+more\s+phrases\s+than\s+questions\s+so\s+you\s+will\s+not\s+use\s+all\s+of\s+them\.?)?)",
            @"^(?<instruction>Which\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+of\s+the\s+following.+?\?\s*Choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters?\s+[A-H](?:\s*[-â€“]\s*[A-H])?\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:table|summary|notes?|flow-?chart)(?:\s+(?:on|about|of)\s+[^.?!]{1,120})?\s+(?:using|with)\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\.?)",
            @"^(?<instruction>Complete\s+(?:each\s+sentence|each\s+of\s+the\s+following\s+sentences?|the\s+following\s+sentences?)\s+with\s+the\s+correct\s+ending\s*,?\s*[A-H](?:\s*[-â€“]\s*[A-H])?\s*,?\s+below\.?(?:\s+Write\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*[-â€“]\s*[A-H])?\s*,?\s+in\s+the\s+spaces?\s+below\.?)?)",
            @"^(?<instruction>Complete\s+the\s+summary\s+(?:with|using)\s+the\s+list\s+of\s+words\s+[A-HI](?:\s*[-â€“]\s*[A-HI])?\s+below\.?(?:\s+Write\s+the\s+correct\s+letter\s+[A-HI](?:\s*[-â€“]\s*[A-HI])?\s+in\s+(?:spaces|boxes)\s+\d{1,2}(?:\s*[-â€“]\s*\d{1,2})?\s+below\.?)?)",
            @"^(?<instruction>Choose\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*[-â€“]\s*[A-H])\.?)",
            @"^(?<instruction>Choose\s+the\s+correct\s+letter\s*,?\s*[A-H](?:\s*,\s*[A-H])*(?:\s+or\s+[A-H])?\.?)",
            @"^(?<instruction>Complete\s+the\s+(?:summary|table|notes?|flow-?chart|sentences?)\s+below\.?(?:\s+Choose\s+[^.?!]+[.?!])?(?:\s+There\s+are\s+more[^.?!]+[.?!])?)",
            @"^(?<instruction>From\s+the\s+information\s+given\s+in\s+the\s+passage\s*,?\s*classify\s+the\s+following(?:\s*\([^)]+\))?\s+as\s+characteristic\s+of\s*:?)",
            @"^(?<instruction>Classify\s+the\s+following\s+as.+?)(?=\s+\d{1,2}\s)",
            @"^(?<instruction>Match\s+ONE\s+of\s+the\s+.+?\s+to\s+each\s+of\s+the\s+statements?.+?below\.?)",
            @"^(?<instruction>Use\s+the\s+information\s+in\s+the\s+text\s+to\s+match\s+.+?\s+with\s+.+?\b(?:listed\s+below|below)\.?)",
            @"^(?<instruction>Use\s+the\s+information\s+in\s+the\s+text\s+to\s+match\s+.+?\.)"
        };

        foreach (var pattern in knownPatterns)
        {
            var match = Regex.Match(normalized, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (match.Success)
            {
                var value = TrimTrailingInstructionArtifacts(match.Groups["instruction"].Value);
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }
        }

        var questionStartIndex = FindInstructionQuestionStartIndex(normalized, startQuestion);
        if (questionStartIndex <= 0)
        {
            return null;
        }

        var candidate = TrimTrailingInstructionArtifacts(normalized[..questionStartIndex]);
        return string.IsNullOrWhiteSpace(candidate) ? null : candidate;
    }

    private static int FindInstructionQuestionStartIndex(string text, int questionNumber)
    {
        if (string.IsNullOrWhiteSpace(text) || questionNumber <= 0)
        {
            return -1;
        }

        var escapedQuestionNumber = Regex.Escape(questionNumber.ToString(CultureInfo.InvariantCulture));
        var patterns = new[]
        {
            $@"^\s*(?<number>{escapedQuestionNumber})(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'â€œâ€˜(\[])",
            $@"(?<=[\n\.\?!:;])\s*(?<number>{escapedQuestionNumber})(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=\s|[).:\-]|[A-Za-z""'â€œâ€˜(\[])",
            $@"(?<![A-Za-z0-9])(?<number>{escapedQuestionNumber})(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=[A-Za-z""'â€œâ€˜(\[])",
            $@"(?<![A-Za-z0-9])(?<number>{escapedQuestionNumber})(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)(?=\s+[A-Z""'â€œâ€˜(\[])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, match.Index);
            }
        }

        return bestIndex == int.MaxValue ? -1 : bestIndex;
    }

    private static int FindQuestionGroupContentBoundaryIndex(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return 0;
        }

        var boundaryIndex = normalizedText.Length;

        var reviewMatch = ReviewSectionHeadingRegex().Match(normalizedText);
        if (reviewMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, reviewMatch.Index);
        }

        var answerMatch = AnswerSectionHeadingRegex().Match(normalizedText);
        if (answerMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, answerMatch.Index);
        }

        var looseAnswerMatch = LooseAnswerSectionHeadingRegex().Match(normalizedText);
        if (looseAnswerMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, looseAnswerMatch.Index);
        }

        var inlineSolutionMatch = InlineSolutionHeadingRegex().Match(normalizedText);
        if (inlineSolutionMatch.Success)
        {
            boundaryIndex = Math.Min(boundaryIndex, inlineSolutionMatch.Index);
        }

        return boundaryIndex;
    }

    private static string TrimTrailingInstructionArtifacts(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (Regex.IsMatch(
                value.Trim(),
                @"(?i)^\[\s*(?:instruction_not_found|unknown|null|n/?a)\s*\]$"))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var boundaryIndex = FindInstructionArtifactBoundaryIndex(normalized);
        if (boundaryIndex > 0)
        {
            normalized = normalized[..boundaryIndex].TrimEnd();
        }

        normalized = StripTrailingInstructionFooterNoise(normalized);
        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static string StripTrailingInstructionFooterNoise(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        while (true)
        {
            var previous = normalized;
            normalized = Regex.Replace(normalized, @"(?i)\s+Access\s+https?://\S+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+https?://\S+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+for\s+more\s+practices\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+page\s*\d+\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"(?i)\s+Access\s*$", string.Empty);
            normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

            if (string.Equals(previous, normalized, StringComparison.Ordinal))
            {
                break;
            }
        }

        return normalized;
    }

    private static string TrimQuestionPreviewArtifacts(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var patterns = new[]
        {
            @"(?<boundary>(?<![A-Za-z])Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*[0-9OoIl\|]{1,3}\b)",
            @"(?i)(?<boundary>\s+Question\s+\d{1,2}\b)",
            @"(?i)(?<boundary>\bsolution\s*:)",
            @"(?i)(?<boundary>\breview\s+and\s+explanations?\b)",
            @"(?i)(?<boundary>\banswer\s*:)"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(normalized, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (match.Success)
            {
                bestIndex = Math.Min(bestIndex, match.Groups["boundary"].Index);
            }
        }

        if (bestIndex != int.MaxValue && bestIndex > 0)
        {
            normalized = normalized[..bestIndex].TrimEnd();
        }

        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static int FindInstructionArtifactBoundaryIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var patterns = new[]
        {
            @"(?im)(?<boundary>^\s*List\s+of\s+(?:words|phrases|headings|people|researchers|countries|categories|groups|options)\b.*$)",
            @"(?i)(?<boundary>\s+List\s+of\s+Words(?:/Phrases)?\b)",
            @"(?im)(?<boundary>^\s*Types?\s+of\s+[A-Za-z][A-Za-z\s]{0,40}\b.*$)",
            @"(?im)(?<boundary>^\s*Example\b.*$)",
            @"(?im)(?<boundary>^\s*Access\s+https?://\S+.*$)",
            @"(?im)(?<boundary>^\s*https?://\S+.*$)",
            @"(?<boundary>(?<![A-Za-z])Questions?\s*[0-9OoIl\|]{1,2}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*[0-9OoIl\|]{1,3}\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+List\s+of\s+(?:words|phrases|headings|people|researchers|countries|categories|groups|options)\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+Types?\s+of\s+[A-Za-z][A-Za-z\s]{0,40}\b)",
            @"(?i)(?<boundary>(?<=\.|\?|!)\s+Example\b)",
            @"(?i)(?<boundary>\s+Example\b)",
            @"(?i)(?<boundary>\s+Access\s+https?://\S+)",
            @"(?i)(?<boundary>\s+https?://\S+)",
            @"(?i)(?<boundary>\s+Write\s*:\s*[A-H]\s*[-â€“])"
        };

        var bestIndex = int.MaxValue;
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(value, pattern, RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (match.Success)
            {
                var boundaryIndex = match.Groups["boundary"].Index;
                if (ShouldIgnoreInstructionArtifactBoundary(value, boundaryIndex))
                {
                    continue;
                }

                bestIndex = Math.Min(bestIndex, boundaryIndex);
            }
        }

        var inlineAnswerBankBoundaryIndex = FindInlineSharedOptionBankBoundaryIndex(value);
        if (inlineAnswerBankBoundaryIndex > 0)
        {
            bestIndex = Math.Min(bestIndex, inlineAnswerBankBoundaryIndex);
        }

        return bestIndex == int.MaxValue
            ? -1
            : bestIndex;
    }

    private static bool ShouldIgnoreInstructionArtifactBoundary(string value, int boundaryIndex)
    {
        if (string.IsNullOrWhiteSpace(value) || boundaryIndex <= 0 || boundaryIndex > value.Length)
        {
            return false;
        }

        var prefix = Regex.Replace(value[..boundaryIndex], @"\s+", " ").TrimEnd();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return false;
        }

        return Regex.IsMatch(
            prefix,
            @"(?i)\b(?:with|using)\s+the$|\bfor$|\bnext\s+to$|\bin\s+(?:spaces?|boxes?)$|\banswer\s+boxes?$|\bquestion(?:s)?$");
    }

    private static int FindInlineSharedOptionBankBoundaryIndex(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var matches = Regex.Matches(value, @"(?<![A-Za-z0-9])(?<label>[A-H])\s+(?=\S)")
            .Cast<Match>()
            .Where(match => match.Success)
            .ToList();
        if (matches.Count < 3)
        {
            return -1;
        }

        for (var index = 0; index <= matches.Count - 3; index++)
        {
            var firstMatch = matches[index];
            if (firstMatch.Index <= 0)
            {
                continue;
            }

            var prefix = value[..firstMatch.Index].TrimEnd();
            if (string.IsNullOrWhiteSpace(prefix) ||
                !Regex.IsMatch(prefix, @"(?i)(?:[.:;?]\s*$|\b(?:below|of|passage|answer|answers|characteristic\s+of)\s*$)"))
            {
                continue;
            }

            var distinctLabels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (var lookAhead = index; lookAhead < matches.Count && lookAhead < index + 6; lookAhead++)
            {
                distinctLabels.Add(matches[lookAhead].Groups["label"].Value);
            }

            if (distinctLabels.Count >= 3)
            {
                return firstMatch.Index;
            }
        }

        return -1;
    }

    private static string? TryExtractInstructionFromPassageText(
        string? rawPassageText,
        int startQuestion,
        int endQuestion)
    {
        if (string.IsNullOrWhiteSpace(rawPassageText))
        {
            return null;
        }

        var normalized = rawPassageText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\s+https?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bhttps?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bfor\s+more\s+practices\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bpage\s*\d+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\b(?=\s|$)", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var escapedStart = Regex.Escape(startQuestion.ToString(CultureInfo.InvariantCulture));
        var escapedEnd = Regex.Escape(endQuestion.ToString(CultureInfo.InvariantCulture));
        var rangeMatch = Regex.Match(
            normalized,
            $@"Questions?\s*{escapedStart}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*{escapedEnd}\b",
            RegexOptions.IgnoreCase);

        if (rangeMatch.Success)
        {
            var tail = normalized[rangeMatch.Index..];
            var tailAfterHeading = tail[Math.Min(tail.Length, rangeMatch.Length)..];
            var firstQuestionIndex = FindInstructionQuestionStartIndex(tailAfterHeading, startQuestion);

            var snippet = firstQuestionIndex >= 0
                ? tail[..Math.Min(tail.Length, rangeMatch.Length + firstQuestionIndex)].Trim()
                : tail;

            snippet = Regex.Replace(
                snippet,
                $@"^\s*Questions?\s*{escapedStart}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*{escapedEnd}\b",
                string.Empty,
                RegexOptions.IgnoreCase).Trim();

            if (!string.IsNullOrWhiteSpace(snippet))
            {
                var extracted = TryExtractInstructionFromBlockText(snippet, startQuestion);
                if (!string.IsNullOrWhiteSpace(extracted))
                {
                    return extracted;
                }

                return TrimTrailingInstructionArtifacts(snippet);
            }
        }

        var questionStartIndex = FindInstructionQuestionStartIndex(normalized, startQuestion);
        if (questionStartIndex < 0)
        {
            return null;
        }

        var prefixStart = Math.Max(0, questionStartIndex - 500);
        var prefix = normalized[prefixStart..questionStartIndex].Trim();
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return null;
        }

        return TryExtractInstructionFromBlockText(prefix, startQuestion) ?? TrimTrailingInstructionArtifacts(prefix);
    }
}
