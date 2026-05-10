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

    private static string? BuildQuestionPreview(string? blockText, string? instruction, int startQuestion)
    {
        if (string.IsNullOrWhiteSpace(blockText))
        {
            return null;
        }

        var normalized = blockText
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        if (!string.IsNullOrWhiteSpace(instruction))
        {
            var instructionIndex = normalized.IndexOf(instruction.Trim(), StringComparison.OrdinalIgnoreCase);
            if (instructionIndex >= 0)
            {
                var contentStart = instructionIndex + instruction.Trim().Length;
                if (contentStart < normalized.Length)
                {
                    normalized = normalized[contentStart..].TrimStart();
                }
            }
        }

        normalized = Regex.Replace(normalized, @"(?im)^\s*Questions?\s*\d{1,2}\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d{1,2}\s*$", string.Empty);
        normalized = Regex.Replace(
            normalized,
            $@"^\s*Question\s*{Regex.Escape(startQuestion.ToString(CultureInfo.InvariantCulture))}\b\s*",
            string.Empty,
            RegexOptions.IgnoreCase);
        normalized = Regex.Replace(normalized, @"(?i)\bAccess\s+https?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bhttps?://\S+\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bfor\s+more\s+practices\b", " ");
        normalized = Regex.Replace(normalized, @"(?i)\bpage\s*\d+\b", " ");
        normalized = Regex.Replace(normalized, @"(?im)^\s*Access\s*$", string.Empty);
        normalized = TrimLeadingQuestionPreviewArtifacts(normalized, startQuestion);
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n").Trim();
        normalized = TrimQuestionPreviewArtifacts(normalized);

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized.Length <= 1200
            ? normalized
            : normalized[..1200].TrimEnd();
    }

    private static string? ResolveQuestionPreview(string? aiQuestionPreview, string? blockQuestionPreview)
    {
        var normalizedBlockPreview = TrimQuestionPreviewArtifacts(blockQuestionPreview);
        if (!string.IsNullOrWhiteSpace(normalizedBlockPreview))
        {
            return normalizedBlockPreview;
        }

        var normalizedAiPreview = TrimQuestionPreviewArtifacts(aiQuestionPreview);
        return string.IsNullOrWhiteSpace(normalizedAiPreview)
            ? null
            : normalizedAiPreview;
    }

    private static string TrimLeadingQuestionPreviewArtifacts(string? value, int startQuestion)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();

        var questionStartIndex = FindInstructionQuestionStartIndex(normalized, startQuestion);
        if (questionStartIndex <= 0)
        {
            return normalized;
        }

        var prefix = normalized[..questionStartIndex];
        if (!Regex.IsMatch(
                prefix,
                @"(?i)\bexample\b|\bhttps?://\S+\b|\bfor\s+more\s+practices\b|\bwrite\s*:\s*[A-H]\s*[-â€“]\b|\b[A-H]\s*[-â€“]\s*for\b"))
        {
            return normalized;
        }

        return normalized[questionStartIndex..].TrimStart();
    }

    private static string? ResolveQuestionGroupInstruction(
        string? instruction,
        string? blockText,
        string rawPassageText,
        int startQuestion,
        int endQuestion)
    {
        var normalizedInstruction = TrimTrailingInstructionArtifacts(instruction);
        var blockInstruction = TrimTrailingInstructionArtifacts(TryExtractInstructionFromBlockText(blockText, startQuestion));
        var passageInstruction = TrimTrailingInstructionArtifacts(TryExtractInstructionFromPassageText(rawPassageText, startQuestion, endQuestion));

        return SelectBestInstructionCandidate(normalizedInstruction, blockInstruction, passageInstruction);
    }

    private static string? SelectBestInstructionCandidate(params string?[] candidates)
    {
        var distinctCandidates = candidates
            .Select(TrimTrailingInstructionArtifacts)
            .Where(candidate => !string.IsNullOrWhiteSpace(candidate))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (distinctCandidates.Count == 0)
        {
            return null;
        }

        return distinctCandidates
            .OrderByDescending(ScoreInstructionCandidate)
            .ThenByDescending(candidate => candidate.Length)
            .First();
    }

    private static int ScoreInstructionCandidate(string candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return 0;
        }

        var normalized = Regex.Replace(candidate, @"\s+", " ").Trim();
        var score = 0;

        if (Regex.IsMatch(normalized, @"(?i)\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+phrase(?:s)?\s+from\s+the\s+list\s+of\s+phrases\b"))
        {
            score += 80;
        }

        if (Regex.IsMatch(normalized, @"(?i)\banswer\s+the\s+following\s+questions\s+using\b|\busing\s+no\s+more\s+than\b|\bcomplete\s+the\s+following\s+sentences\s+using\b|\bchoose\s+(?:NO\s+MORE\s+THAN\s+[^.?!]{1,80}|ONE\s+WORD(?:\s+ONLY)?|TWO\s+WORDS(?:\s+ONLY)?|THREE\s+WORDS(?:\s+ONLY)?)\s+from\s+the\s+(?:passage|text)\s+for\s+the\s+answer\b"))
        {
            score += 45;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bfor\s+each\s+question\s*,?\s*only\s+one\s+of\s+the\s+choices?\s+is\s+correct\b"))
        {
            score += 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\baccording\s+to\s+the\s+information\s+given\s+in\s+the\s+(?:text|passage)\s*,?\s*(?:choose|circle)\s+the\s+correct\s+answer\b"))
        {
            score += 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bchoose\s+the\s+correct\s+answer\s+or\s+answers?\s+from\s+the\s+choices\s+given\b"))
        {
            score += 30;
        }

        if (Regex.IsMatch(normalized, @"(?i)\buse\s+the\s+information\s+in\s+the\s+text\s+to\s+match\b"))
        {
            score += 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\blist\s+of\s+phrases\b|\blist\s+of\s+words\b|\bfrom\s+the\s+box\b"))
        {
            score += 40;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bwrite\s+the\s+correct\s+letter\b|\byou\s+may\s+use\s+any\s+letter\s+more\s+than\s+once\b|\bthere\s+are\s+more\b"))
        {
            score += 25;
        }

        if (Regex.IsMatch(normalized, @"(?i)\btrue\b.*\bfalse\b.*\bnot\s+given\b|\byes\b.*\bno\b.*\bnot\s+given\b"))
        {
            score += 25;
        }

        if (Regex.IsMatch(
                normalized,
                @"(?i)[.?!]\s+(?!(?:Choose\s+your\s+answers?|Choose\s+the\s+correct|Write\b|Use\b|There\s+are\s+more|You\s+may\s+use\b|In\s+boxes?\b|On\s+your\s+answer\s+sheet\b|If\s+the\s+statement\b|If\s+it\s+is\s+impossible\b|Match\b|Complete\b|Look\b|Classify\b))[A-Z][A-Za-z]"))
        {
            score -= 35;
        }

        if (Regex.IsMatch(normalized, @"(?i)\bcomplete\b|\bchoose\b|\bmatch\b|\blabel\b|\bclassify\b|\bwrite\b"))
        {
            score += 10;
        }

        if (normalized.Length > 220)
        {
            score -= 20;
        }

        if (Regex.Matches(normalized, @"(?<![A-Za-z0-9])\d{1,2}(?!\s*(?:-|â€“|â€”|â€‘|âˆ’|to)\s*\d)").Count >= 3)
        {
            score -= 20;
        }

        if (Regex.Matches(normalized, @"(?<![A-Za-z0-9])[A-H]\s+[A-Za-z(]").Count >= 3)
        {
            score -= 25;
        }

        return score;
    }
}