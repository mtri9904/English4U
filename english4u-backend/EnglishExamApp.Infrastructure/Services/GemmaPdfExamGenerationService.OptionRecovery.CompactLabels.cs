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

    private static List<string> ExtractChooseNOptionsFromCompactLabelBlob(string snippet, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(snippet))
        {
            return [];
        }

        var lines = snippet
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line => Regex.Replace(line, @"\s+", " ").Trim())
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Where(line =>
                !QuestionRangeBoundaryRegex().IsMatch(line) &&
                !ReviewSectionHeadingRegex().IsMatch(line) &&
                !LooseAnswerSectionHeadingRegex().IsMatch(line) &&
                !PassageNoiseLineRegex().IsMatch(line) &&
                !AccessOrPageNoiseRegex().IsMatch(line))
            .ToList();
        if (lines.Count == 0)
        {
            return [];
        }

        for (var index = 0; index < lines.Count; index++)
        {
            List<char> labels;
            string remainder;

            if (TryExtractCompactOptionLabels(lines[index], out labels, out remainder))
            {
                // no-op
            }
            else
            {
                labels = [];
                remainder = string.Empty;
                var cursor = index;
                while (cursor < lines.Count && TryReadStandaloneOptionLabel(lines[cursor], out var label))
                {
                    labels.Add(label);
                    cursor++;
                }

                if (labels.Count < Math.Max(4, expectedOptionCount > 0 ? expectedOptionCount : 4))
                {
                    continue;
                }

                index = cursor - 1;
            }

            if (labels.Count < Math.Max(4, expectedOptionCount > 0 ? expectedOptionCount : 4))
            {
                continue;
            }

            var blobParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(remainder))
            {
                blobParts.Add(remainder);
            }

            for (var cursor = index + 1; cursor < lines.Count; cursor++)
            {
                var line = lines[cursor];
                if (LeadingQuestionNumberRegex().IsMatch(line) ||
                    LooksLikeQuestionBodyLine(line))
                {
                    break;
                }

                if (TryReadStandaloneOptionLabel(line, out _))
                {
                    continue;
                }

                blobParts.Add(line);
            }

            var optionTexts = SplitCompactChooseNOptionTexts(string.Join(" ", blobParts), labels.Count);
            if (!HasMeaningfulMcqOptionSet(optionTexts))
            {
                continue;
            }

            if (expectedOptionCount > 0)
            {
                if (optionTexts.Count < expectedOptionCount)
                {
                    continue;
                }

                if (optionTexts.Count > expectedOptionCount)
                {
                    optionTexts = optionTexts.Take(expectedOptionCount).ToList();
                }
            }

            return optionTexts;
        }

        return [];
    }

    private static bool TryExtractCompactOptionLabels(string line, out List<char> labels, out string remainder)
    {
        labels = [];
        remainder = string.Empty;

        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var match = Regex.Match(
            line,
            @"^\s*(?<labels>[A-H](?:\s+[A-H]){3,7})(?<remainder>\s+.+)?$",
            RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            return false;
        }

        labels = Regex.Matches(match.Groups["labels"].Value, @"[A-H]", RegexOptions.IgnoreCase)
            .Cast<Match>()
            .Select(item => char.ToUpperInvariant(item.Value[0]))
            .Distinct()
            .ToList();
        if (labels.Count < 4)
        {
            labels = [];
            return false;
        }

        remainder = match.Groups["remainder"].Value.Trim();
        return true;
    }

    private static bool TryReadStandaloneOptionLabel(string line, out char label)
    {
        label = '\0';
        if (!TryParseLabeledOptionLine(line, out var parsedLabel, out var optionText) ||
            !string.IsNullOrWhiteSpace(optionText))
        {
            return false;
        }

        label = parsedLabel;
        return true;
    }

    private static List<string> SplitCompactChooseNOptionTexts(string blob, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(blob) || expectedOptionCount <= 0)
        {
            return [];
        }

        var normalized = RemoveSelectionMarkers(UnescapeExtractedText(blob));
        normalized = NormalizeExtractedSpacing(normalized)
            .Replace("\r\n", " ")
            .Replace('\r', ' ')
            .Replace('\n', ' ');
        normalized = Regex.Replace(normalized, @"(?<=[.!?])(?=[A-Z])", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var sentenceParts = Regex.Split(normalized, @"(?<=[.!?])\s+(?=[A-Z])")
            .Select(part => part.Trim())
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .Where(part => !IsOptionLabelOnly(part))
            .ToList();

        if (sentenceParts.Count < expectedOptionCount)
        {
            sentenceParts = Regex.Split(normalized, @"\s*;\s*")
                .Select(part => part.Trim())
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .Where(part => !IsOptionLabelOnly(part))
                .ToList();
        }

        if (sentenceParts.Count < expectedOptionCount)
        {
            return [];
        }

        return sentenceParts
            .Take(expectedOptionCount)
            .ToList();
    }

    private static List<string> ExtractLabeledOptionsFromReviewEntryRaw(string rawEntryBlock, int expectedOptionCount)
    {
        if (string.IsNullOrWhiteSpace(rawEntryBlock))
        {
            return [];
        }

        var lineBasedOptions = ExtractLabeledOptionsFromRawSnippet(rawEntryBlock, expectedOptionCount);
        if (HasMeaningfulMcqOptionSet(lineBasedOptions))
        {
            return lineBasedOptions;
        }

        var normalized = UnescapeExtractedText(rawEntryBlock)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = RemoveSelectionMarkers(normalized);
        normalized = GluedReviewMarkerRegex().Replace(normalized, " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var markerMatch = ReviewExplanationMarkerRegex().Match(normalized);
        if (markerMatch.Success && markerMatch.Index > 0)
        {
            normalized = normalized[..markerMatch.Index].Trim();
        }

        var matches = Regex.Matches(
            normalized,
            @"(?is)(?<![A-Za-z])(?<label>[A-H])\s*[).:\-]?\s+(?<text>.*?)(?=(?<![A-Za-z])[A-H]\s*[).:\-]?\s+|$)");
        if (matches.Count == 0)
        {
            return [];
        }

        var optionsByLabel = new Dictionary<char, string>();
        foreach (Match match in matches)
        {
            if (!match.Success)
            {
                continue;
            }

            var label = char.ToUpperInvariant(match.Groups["label"].Value[0]);
            if (label is < 'A' or > 'H' || optionsByLabel.ContainsKey(label))
            {
                continue;
            }

            var optionText = Regex.Replace(match.Groups["text"].Value, @"\s+", " ").Trim();
            optionText = optionText.Trim(',', ';', ':', '-', '\u2013', '\u2014');
            if (string.IsNullOrWhiteSpace(optionText) || IsOptionLabelOnly(optionText))
            {
                continue;
            }

            optionsByLabel[label] = optionText;
        }

        var options = optionsByLabel
            .OrderBy(pair => pair.Key)
            .Select(pair => pair.Value)
            .ToList();

        if (expectedOptionCount > 0)
        {
            if (options.Count < expectedOptionCount)
            {
                return [];
            }

            if (options.Count > expectedOptionCount)
            {
                options = options.Take(expectedOptionCount).ToList();
            }
        }

        return options;
    }

    private static bool TryParseLabeledOptionLine(string line, out char label, out string optionText)
    {
        label = '\0';
        optionText = string.Empty;

        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var labeledMatch = OptionStartsWithLetterLabelRegex().Match(line);
        if (!labeledMatch.Success)
        {
            labeledMatch = OptionStartsWithLetterSpaceRegex().Match(line);
        }

        if (labeledMatch.Success)
        {
            label = char.ToUpperInvariant(labeledMatch.Groups["label"].Value[0]);
            if (label is < 'A' or > 'H')
            {
                return false;
            }

            optionText = labeledMatch.Groups["text"].Value.Trim();
            return true;
        }

        var compact = line.Trim().Trim('.', ')', ':', '-', ' ');
        if (compact.Length == 1 && compact[0] is >= 'A' and <= 'H')
        {
            label = compact[0];
            optionText = string.Empty;
            return true;
        }

        return false;
    }
}
