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

    private static Dictionary<int, ReadingQuestionGroupOutline> BuildRawQuestionGroupOutlineMap(
        IReadOnlyList<ReadingQuestionGroupOutline> rawQuestionGroupOutlines)
    {
        var result = new Dictionary<int, ReadingQuestionGroupOutline>();
        foreach (var outline in rawQuestionGroupOutlines)
        {
            for (var questionNumber = outline.StartQuestion; questionNumber <= outline.EndQuestion; questionNumber++)
            {
                result[questionNumber] = outline;
            }
        }

        return result;
    }

    private static Dictionary<int, RawQuestionGroupContext> BuildRawQuestionGroupContextMap(
        IReadOnlyList<ReadingQuestionGroupOutline> rawQuestionGroupOutlines,
        string? rawPassageText,
        IReadOnlyList<PdfRawQuestionInstructionPreviewDto>? reviewedQuestionGroups = null)
    {
        var reviewBlocks = string.IsNullOrWhiteSpace(rawPassageText)
            ? []
            : BuildQuestionGroupReviewBlocks(rawPassageText, rawQuestionGroupOutlines);
        var reviewBlockMap = reviewBlocks.ToDictionary(
            block => (block.StartQuestion, block.EndQuestion),
            block => block);
        var outlineRangeMap = rawQuestionGroupOutlines
            .GroupBy(outline => (outline.StartQuestion, outline.EndQuestion))
            .ToDictionary(group => group.Key, group => group.First());

        var result = new Dictionary<int, RawQuestionGroupContext>();
        var processedReviewedGroups = new List<PdfRawQuestionInstructionPreviewDto>();

        if (reviewedQuestionGroups is { Count: > 0 })
        {
            var groupsList = reviewedQuestionGroups.ToList();
            foreach (var outline in rawQuestionGroupOutlines)
            {
                var matchingReviewed = groupsList
                    .Where(g => g.StartQuestion >= outline.StartQuestion && g.EndQuestion <= outline.EndQuestion)
                    .OrderBy(g => g.StartQuestion)
                    .ToList();

                if (matchingReviewed.Count > 1)
                {
                    var firstGroup = matchingReviewed[0];
                    var shouldKeepSeparate =
                        matchingReviewed.Any(group =>
                            (group.TypeEvidence ?? string.Empty).Contains("Gemini JSON", StringComparison.OrdinalIgnoreCase)) ||
                        matchingReviewed.Any(group =>
                            NormalizeGroupType(group.GroupType) is "FLOWCHART_COMPLETION" or "MAP_LABELLING" or "MATCHING_VISUALS");
                    var allSameType = matchingReviewed.All(g =>
                        string.Equals(g.GroupType, firstGroup.GroupType, StringComparison.OrdinalIgnoreCase) ||
                        string.IsNullOrWhiteSpace(g.GroupType) ||
                        string.IsNullOrWhiteSpace(firstGroup.GroupType));

                    if (!shouldKeepSeparate && allSameType)
                    {
                        var mergedInstruction = matchingReviewed
                            .Select(g => g.Instruction)
                            .FirstOrDefault(inst => !string.IsNullOrWhiteSpace(inst)) ?? outline.Instruction ?? string.Empty;

                        var mergedGroupType = matchingReviewed
                            .Select(g => g.GroupType)
                            .FirstOrDefault(t => !string.IsNullOrWhiteSpace(t)) ?? outline.GroupType;

                        var mergedTags = matchingReviewed
                            .Select(g => g.Tags)
                            .FirstOrDefault(tag => !string.IsNullOrWhiteSpace(tag)) ?? outline.Tags;

                        var mergedQuestionPreview = string.Join("\n", matchingReviewed
                            .Select(g => g.QuestionPreview)
                            .Where(qp => !string.IsNullOrWhiteSpace(qp)));

                        var mergedVisualPreviewItems = matchingReviewed
                            .Where(g => g.VisualPreviewItems != null)
                            .SelectMany(g => g.VisualPreviewItems!)
                            .ToList();

                        var mergedGroup = new PdfRawQuestionInstructionPreviewDto(
                            PassageNumber: firstGroup.PassageNumber,
                            StartQuestion: outline.StartQuestion,
                            EndQuestion: outline.EndQuestion,
                            Tags: mergedTags,
                            GroupType: mergedGroupType,
                            Instruction: mergedInstruction,
                            QuestionPreview: string.IsNullOrWhiteSpace(mergedQuestionPreview) ? null : mergedQuestionPreview,
                            TypeEvidence: matchingReviewed.Select(g => g.TypeEvidence).FirstOrDefault(e => !string.IsNullOrWhiteSpace(e)),
                            VisualPreviewItems: mergedVisualPreviewItems.Count > 0 ? mergedVisualPreviewItems : null,
                            VisualPreviewNote: matchingReviewed.Select(g => g.VisualPreviewNote).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)),
                            DiagramPreviewImageDataUrl: matchingReviewed.Select(g => g.DiagramPreviewImageDataUrl).FirstOrDefault(url => !string.IsNullOrWhiteSpace(url)),
                            DiagramPreviewPageNumber: matchingReviewed.Select(g => g.DiagramPreviewPageNumber).FirstOrDefault(p => p.HasValue),
                            DiagramPreviewNote: matchingReviewed.Select(g => g.DiagramPreviewNote).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))
                        );

                        processedReviewedGroups.Add(mergedGroup);

                        foreach (var g in matchingReviewed)
                        {
                            groupsList.Remove(g);
                        }
                    }
                }
            }

            processedReviewedGroups.AddRange(groupsList);
            processedReviewedGroups = processedReviewedGroups.OrderBy(g => g.StartQuestion).ToList();
        }

        if (processedReviewedGroups.Count > 0)
        {
            foreach (var reviewedGroup in processedReviewedGroups
                .Where(group => group.StartQuestion > 0 && group.EndQuestion >= group.StartQuestion)
                .GroupBy(group => (group.StartQuestion, group.EndQuestion))
                .Select(group => group.First())
                .OrderBy(group => group.StartQuestion))
            {
                reviewBlockMap.TryGetValue((reviewedGroup.StartQuestion, reviewedGroup.EndQuestion), out var block);
                outlineRangeMap.TryGetValue((reviewedGroup.StartQuestion, reviewedGroup.EndQuestion), out var outline);

                var context = new RawQuestionGroupContext(
                    StartQuestion: reviewedGroup.StartQuestion,
                    EndQuestion: reviewedGroup.EndQuestion,
                    BoundaryToken: BuildQuestionGroupRangeBoundaryToken(reviewedGroup.StartQuestion, reviewedGroup.EndQuestion),
                    Instruction: string.IsNullOrWhiteSpace(reviewedGroup.Instruction)
                        ? outline?.Instruction
                        : reviewedGroup.Instruction,
                    GroupType: reviewedGroup.GroupType ?? outline?.GroupType,
                    BlockText: block?.BlockText,
                    QuestionPreview: !string.IsNullOrWhiteSpace(reviewedGroup.QuestionPreview)
                        ? reviewedGroup.QuestionPreview
                        : block?.QuestionPreview,
                    VisualPreviewItems: reviewedGroup.VisualPreviewItems,
                    VisualPreviewNote: reviewedGroup.VisualPreviewNote,
                    DiagramPreviewPageNumber: reviewedGroup.DiagramPreviewPageNumber,
                    DiagramPreviewNote: reviewedGroup.DiagramPreviewNote);

                for (var questionNumber = reviewedGroup.StartQuestion; questionNumber <= reviewedGroup.EndQuestion; questionNumber++)
                {
                    result[questionNumber] = context;
                }
            }

            foreach (var outline in rawQuestionGroupOutlines)
            {
                var isAlreadyCovered = Enumerable
                    .Range(outline.StartQuestion, outline.EndQuestion - outline.StartQuestion + 1)
                    .All(result.ContainsKey);
                if (isAlreadyCovered)
                {
                    continue;
                }

                reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
                var context = new RawQuestionGroupContext(
                    StartQuestion: outline.StartQuestion,
                    EndQuestion: outline.EndQuestion,
                    BoundaryToken: outline.BoundaryToken ?? BuildQuestionGroupRangeBoundaryToken(outline.StartQuestion, outline.EndQuestion),
                    Instruction: outline.Instruction,
                    GroupType: outline.GroupType,
                    BlockText: block?.BlockText,
                    QuestionPreview: block?.QuestionPreview,
                    VisualPreviewItems: null,
                    VisualPreviewNote: null,
                    DiagramPreviewPageNumber: null,
                    DiagramPreviewNote: null);

                for (var questionNumber = outline.StartQuestion; questionNumber <= outline.EndQuestion; questionNumber++)
                {
                    result[questionNumber] = context;
                }
            }

            return result;
        }

        foreach (var outline in rawQuestionGroupOutlines)
        {
            reviewBlockMap.TryGetValue((outline.StartQuestion, outline.EndQuestion), out var block);
            var context = new RawQuestionGroupContext(
                StartQuestion: outline.StartQuestion,
                EndQuestion: outline.EndQuestion,
                BoundaryToken: outline.BoundaryToken ?? BuildQuestionGroupRangeBoundaryToken(outline.StartQuestion, outline.EndQuestion),
                Instruction: outline.Instruction,
                GroupType: outline.GroupType,
                BlockText: block?.BlockText,
                QuestionPreview: block?.QuestionPreview,
                VisualPreviewItems: null,
                VisualPreviewNote: null,
                DiagramPreviewPageNumber: null,
                DiagramPreviewNote: null);

            for (var questionNumber = outline.StartQuestion; questionNumber <= outline.EndQuestion; questionNumber++)
            {
                result[questionNumber] = context;
            }
        }

        return result;
    }

    private static string BuildQuestionGroupRangeBoundaryToken(int startQuestion, int endQuestion) =>
        $"RANGE:{startQuestion}-{endQuestion}";

    private static string NormalizeAiPassageContent(string? passageContent, string? passageTitle = null)
    {
        if (string.IsNullOrWhiteSpace(passageContent))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(passageContent)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');

        normalized = Regex.Replace(normalized, @"[ \t]+", " ");
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n[ \t]+", "\n");
        normalized = RemoveLeadingRepeatedPassageTitle(normalized, passageTitle);
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        return normalized.Trim();
    }

    private static string NormalizePassageContent(string? passageContent, string? passageTitle = null)
    {
        if (string.IsNullOrWhiteSpace(passageContent))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(passageContent)
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        normalized = NormalizeExtractedSpacing(normalized);
        normalized = PassageNoiseLineRegex().Replace(normalized, string.Empty);
        normalized = PassageQuestionIntroLineRegex().Replace(normalized, string.Empty);
        normalized = StripInlinePassageFooterNoise(normalized);
        normalized = TrimPassageAtQuestionBoundary(normalized);
        normalized = RemoveLeadingRepeatedPassageTitle(normalized, passageTitle);
        normalized = NormalizePassageParagraphBreaks(normalized);
        normalized = RemoveLeadingRepeatedPassageTitle(normalized, passageTitle);

        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        return normalized.Trim();
    }

    private static string StripInlinePassageFooterNoise(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var noiseMatch = InlinePassageFooterNoiseRegex().Match(line);
            if (noiseMatch.Success && noiseMatch.Index >= 0)
            {
                line = line[..noiseMatch.Index];
            }

            lines[i] = line;
        }

        return string.Join("\n", lines);
    }

    private static string TrimPassageAtQuestionBoundary(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var inlineBoundaryMatch = InlinePassageQuestionBoundaryRegex().Match(content);
        if (inlineBoundaryMatch.Success && inlineBoundaryMatch.Index > 0)
        {
            var inlineTrimmed = content[..inlineBoundaryMatch.Index].TrimEnd();
            if (!string.IsNullOrWhiteSpace(inlineTrimmed))
            {
                return inlineTrimmed;
            }
        }

        var boundaryMatch = PassageQuestionBoundaryLineRegex().Match(content);
        if (!boundaryMatch.Success || boundaryMatch.Index <= 0)
        {
            return content;
        }

        var trimmed = content[..boundaryMatch.Index].TrimEnd();
        return string.IsNullOrWhiteSpace(trimmed) ? content : trimmed;
    }

    private static string NormalizePassageParagraphBreaks(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalized = content;
        var hasStructuredLabels = HasStructuredParagraphLabels(normalized);
        // Ná»‘i láº¡i cÃ¡c viáº¿t táº¯t bá»‹ vá»¡ dÃ²ng kiá»ƒu "D.\nC." Ä‘á»ƒ trÃ¡nh hiá»ƒu nháº§m "C." lÃ  nhÃ£n Ä‘oáº¡n.
        normalized = BrokenAbbreviationAcrossLinesRegex().Replace(normalized, ".");
        if (hasStructuredLabels)
        {
            normalized = CollapsedPassageParagraphBoundaryRegex().Replace(normalized, "\n\n");
            normalized = Regex.Replace(
                normalized,
                @"(?m)(?<!\b[A-Z]\.)(?<!\n)\n(?=\s*(?:\*\*)?[A-H](?:\s*[).:\-]|[.])?(?:\*\*)?(?:\s+\S.*)?$)",
                "\n\n");
            normalized = Regex.Replace(
                normalized,
                @"(?m)^[ \t]*\*\*(?<label>[A-H])(?:[ \t]*[).:\-]|[.])?[ \t]*\*\*[ \t]*\n[ \t]*(?<text>\S.*)$",
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
            normalized = Regex.Replace(
                normalized,
                @"(?m)^[ \t]*(?<label>[A-H])(?:(?:[ \t]*[).:\-]|[.])[ \t]*|[ \t]+)\n[ \t]*(?<text>\S.*)$",
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
        }

        normalized = Regex.Replace(normalized, @"[ \t]*\n[ \t]*", "\n");
        normalized = hasStructuredLabels
            ? Regex.Replace(normalized, @"(?<!\n)\n(?!\n)", " ")
            : NormalizeUnlabeledPassageLineBreaks(normalized);
        normalized = Regex.Replace(normalized, @"[ \t]{2,}", " ");
        normalized = Regex.Replace(normalized, @" *\n\n *", "\n\n");
        if (hasStructuredLabels)
        {
            normalized = MarkdownLabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
            normalized = LabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    var text = NormalizeLabeledPassageText(match.Groups["text"].Value);
                    return $"**{label}.**\n\n{text}";
                });
            normalized = StandaloneMarkdownLabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    return $"**{label}.**";
                });
            normalized = StandaloneLabeledPassageLineRegex().Replace(
                normalized,
                match =>
                {
                    var label = match.Groups["label"].Value.Trim();
                    return $"**{label}.**";
                });
            normalized = MissingBlankLineBeforeLabeledPassageRegex().Replace(normalized, "\n\n");
            normalized = RepairOutOfOrderStructuredParagraphLabels(normalized);
        }

        normalized = NormalizeSpeakerAttributionLines(normalized);
        normalized = OrphanLeadingMarkdownMarkerRegex().Replace(normalized, string.Empty);
        normalized = OrphanTrailingMarkdownMarkerRegex().Replace(normalized, string.Empty);
        normalized = RemoveOrphanMarkdownMarkersByLine(normalized);
        normalized = Regex.Replace(normalized, @"\n{3,}", "\n\n");

        normalized = CleanPassageParagraphLabels(normalized);

        return normalized;
    }

    private static string CleanPassageParagraphLabels(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var paragraphs = content.Split(new[] { "\n\n" }, StringSplitOptions.None);
        var cleanParagraphs = new List<string>();

        for (int i = 0; i < paragraphs.Length; i++)
        {
            var current = paragraphs[i].Trim();
            if (string.IsNullOrWhiteSpace(current))
            {
                continue;
            }

            var standaloneMatch = Regex.Match(current, @"^\s*(?:\*\*)?(?<label>[A-H])\.?(?:\*\*)?\s*$", RegexOptions.IgnoreCase);
            if (standaloneMatch.Success && i < paragraphs.Length - 1)
            {
                var label = standaloneMatch.Groups["label"].Value.ToUpperInvariant();
                var next = paragraphs[i + 1].Trim();
                if (Regex.IsMatch(next, @"^\s*(?:\*\*)?" + Regex.Escape(label) + @"\b", RegexOptions.IgnoreCase))
                {
                    continue;
                }
            }

            var currentLabelMatch = Regex.Match(current, @"^\s*(?:\*\*)?(?<label>[A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?", RegexOptions.IgnoreCase);
            char currentLabel = (char)0;
            if (currentLabelMatch.Success)
            {
                currentLabel = char.ToUpperInvariant(currentLabelMatch.Groups["label"].Value[0]);
            }
            else
            {
                currentLabel = (char)('A' + cleanParagraphs.Count);
            }

            if (currentLabel >= 'A' && currentLabel <= 'H')
            {
                char nextLabel = (char)(currentLabel + 1);
                string nextLabelStr = nextLabel.ToString();
                var nextLabelRegex = new Regex(@"(?<prefix>[\s,.;!?]+)(?:\*\*)?" + Regex.Escape(nextLabelStr) + @"\.?(?:\*\*)?\s*$", RegexOptions.IgnoreCase);
                if (nextLabelRegex.IsMatch(current))
                {
                    current = nextLabelRegex.Replace(current, match => 
                    {
                        var prefix = match.Groups["prefix"].Value;
                        if (prefix.Contains('?') || prefix.Contains('!'))
                        {
                            return prefix.Contains('?') ? "?" : "!";
                        }
                        return ".";
                    });
                }
            }

            cleanParagraphs.Add(current);
        }

        return string.Join("\n\n", cleanParagraphs);
    }

    private static string RepairOutOfOrderStructuredParagraphLabels(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');
        var rebuilt = new List<string>(lines.Length);
        char? highestAcceptedLabel = null;
        string? pendingTextPrefix = null;

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            var labelMatch = Regex.Match(line, @"^\*\*(?<label>[A-H])\.\*\*$" + "|" + @"^\*\*(?<label>[A-H])\*\*\.$", RegexOptions.IgnoreCase);
            if (labelMatch.Success)
            {
                var label = char.ToUpperInvariant(labelMatch.Groups["label"].Value[0]);
                if (!highestAcceptedLabel.HasValue || label > highestAcceptedLabel.Value)
                {
                    highestAcceptedLabel = label;
                    pendingTextPrefix = null;
                    rebuilt.Add(line);
                    continue;
                }

                pendingTextPrefix = label.ToString();
                while (rebuilt.Count > 0 && string.IsNullOrWhiteSpace(rebuilt[^1]))
                {
                    rebuilt.RemoveAt(rebuilt.Count - 1);
                }

                continue;
            }

            if (!string.IsNullOrWhiteSpace(pendingTextPrefix))
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                var repairedLine = $"{pendingTextPrefix} {line}".Trim();
                pendingTextPrefix = null;

                if (rebuilt.Count > 0 && !string.IsNullOrWhiteSpace(rebuilt[^1]))
                {
                    rebuilt[^1] = $"{rebuilt[^1].TrimEnd()} {repairedLine}";
                }
                else
                {
                    rebuilt.Add(repairedLine);
                }

                continue;
            }

            rebuilt.Add(rawLine);
        }

        return Regex.Replace(string.Join('\n', rebuilt), @"\n{3,}", "\n\n").Trim();
    }

    private static string NormalizeUnlabeledPassageLineBreaks(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalized = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n');
        var lines = normalized.Split('\n');
        var builder = new StringBuilder(normalized.Length + 16);

        for (var i = 0; i < lines.Length; i++)
        {
            var current = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(current))
            {
                AppendParagraphBreak(builder);
                continue;
            }

            if (builder.Length == 0)
            {
                builder.Append(current);
                continue;
            }

            var previousLine = FindPreviousNonEmptyLine(lines, i);
            if (ShouldPreserveUnlabeledPassageLineBreak(previousLine, current))
            {
                AppendParagraphBreak(builder);
            }
            else if (builder.Length > 0 && builder[^1] != '\n' && builder[^1] != ' ')
            {
                builder.Append(' ');
            }

            builder.Append(current);
        }

        return Regex.Replace(builder.ToString(), @"\n{3,}", "\n\n").Trim();
    }

    private static string? FindPreviousNonEmptyLine(string[] lines, int currentIndex)
    {
        for (var i = currentIndex - 1; i >= 0; i--)
        {
            var line = lines[i].Trim();
            if (!string.IsNullOrWhiteSpace(line))
            {
                return line;
            }
        }

        return null;
    }

    private static void AppendParagraphBreak(StringBuilder builder)
    {
        if (builder.Length == 0)
        {
            return;
        }

        while (builder.Length > 0 && builder[^1] == ' ')
        {
            builder.Length--;
        }

        if (builder.Length >= 2 && builder[^1] == '\n' && builder[^2] == '\n')
        {
            return;
        }

        if (builder.Length > 0 && builder[^1] == '\n')
        {
            builder.Append('\n');
            return;
        }

        builder.Append("\n\n");
    }

    private static bool ShouldPreserveUnlabeledPassageLineBreak(string? previousLine, string currentLine)
    {
        if (string.IsNullOrWhiteSpace(previousLine) || string.IsNullOrWhiteSpace(currentLine))
        {
            return true;
        }

        var previous = previousLine.Trim();
        var current = currentLine.Trim();

        if (IsLikelyStandalonePassageHeading(previous) || IsLikelyStandalonePassageHeading(current))
        {
            return true;
        }

        if (SentenceEndingPunctuationRegex().IsMatch(previous) &&
            Regex.IsMatch(current, @"^(?:[""'“‘]?\p{Lu}|\d{4}\b)", RegexOptions.CultureInvariant))
        {
            return true;
        }

        if (previous.Length <= 90 &&
            Regex.IsMatch(previous, @"[:;]$") &&
            Regex.IsMatch(current, @"^(?:[""'“‘]?\p{Lu}|\d+\b)", RegexOptions.CultureInvariant))
        {
            return true;
        }

        return false;
    }

    private static bool IsLikelyStandalonePassageHeading(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return false;
        }

        var candidate = line.Trim();
        if (candidate.Length < 3 || candidate.Length > 90)
        {
            return false;
        }

        if (SentenceEndingPunctuationRegex().IsMatch(candidate))
        {
            return false;
        }

        if (Regex.IsMatch(candidate, @"^(?:reading\s+)?passage\s*[0-9OoIl|]+$", RegexOptions.IgnoreCase))
        {
            return true;
        }

        var words = candidate.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length > 8)
        {
            return false;
        }

        var letters = Regex.Replace(candidate, @"[^\p{L}]", string.Empty);
        if (letters.Length == 0)
        {
            return false;
        }

        var uppercaseCount = letters.Count(char.IsUpper);
        return uppercaseCount >= Math.Max(2, letters.Length * 0.75d);
    }

    private static string RecoverStructuredParagraphLabels(string aiPassageContent, string rawPassageContent)
    {
        if (string.IsNullOrWhiteSpace(rawPassageContent))
        {
            return aiPassageContent;
        }

        var aiRun = GetLongestStructuredParagraphLabelRun(aiPassageContent);
        var rawRun = GetLongestStructuredParagraphLabelRun(rawPassageContent);

        if (rawRun >= 2 && aiRun < rawRun)
        {
            return rawPassageContent;
        }

        return aiPassageContent;
    }

    private static string FinalizePassageContent(
        string aiPassageContent,
        string rawPassageContent,
        IReadOnlyDictionary<int, ReadingQuestionGroupOutline> rawQuestionGroupContexts)
    {
        return string.IsNullOrWhiteSpace(aiPassageContent)
            ? rawPassageContent
            : aiPassageContent;
    }

    private static int CountPassageWords(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return 0;
        }

        return Regex.Matches(content, @"[A-Za-z][A-Za-z'’\-]*").Count;
    }

    private static bool ShouldForceParagraphLabeling(
        IReadOnlyDictionary<int, ReadingQuestionGroupOutline> rawQuestionGroupContexts)
    {
        if (rawQuestionGroupContexts.Count == 0)
        {
            return false;
        }

        var distinctContexts = rawQuestionGroupContexts.Values
            .GroupBy(context => (context.StartQuestion, context.EndQuestion, context.BoundaryToken))
            .Select(group => group.First());

        foreach (var context in distinctContexts)
        {
            if (string.Equals(context.GroupType, "MATCHING_HEADINGS", StringComparison.Ordinal) ||
                string.Equals(context.GroupType, "MATCHING_INFO", StringComparison.Ordinal))
            {
                return true;
            }

            if (!string.IsNullOrWhiteSpace(context.Instruction) &&
                Regex.IsMatch(context.Instruction, @"\bparagraphs?\b", RegexOptions.IgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string AutoLabelParagraphBlocks(string content)
    {
        if (string.IsNullOrWhiteSpace(content) || HasStructuredParagraphLabels(content))
        {
            return content;
        }

        var normalized = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return content;
        }

        var paragraphBlocks = normalized
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(block => Regex.Replace(block, @"\s+", " ").Trim())
            .Where(block => !string.IsNullOrWhiteSpace(block))
            .Where(block => block.Length >= 25 || SentenceEndingPunctuationRegex().IsMatch(block))
            .ToList();
        if (paragraphBlocks.Count < 3 || paragraphBlocks.Count > 8)
        {
            return content;
        }

        var labeledParagraphs = paragraphBlocks
            .Select((block, index) =>
            {
                var label = (char)('A' + index);
                return $"**{label}.**\n\n{block}";
            });

        return string.Join("\n\n", labeledParagraphs).Trim();
    }

    private static bool HasStructuredParagraphLabels(string content)
    {
        return GetLongestStructuredParagraphLabelRun(content) >= 2;
    }

    private static int GetLongestStructuredParagraphLabelRun(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return 0;
        }

        var labels = ExtractStructuredParagraphLabels(content);

        if (labels.Count < 2)
        {
            return 0;
        }

        var longestRun = 1;
        var currentRun = 1;
        for (var i = 1; i < labels.Count; i++)
        {
            if (labels[i] == labels[i - 1] + 1)
            {
                currentRun++;
                if (currentRun > longestRun)
                {
                    longestRun = currentRun;
                }
            }
            else
            {
                currentRun = 1;
            }
        }

        return longestRun;
    }

    private static List<char> ExtractStructuredParagraphLabels(string content) =>
        Regex.Matches(
                content,
                @"(?m)^\s*(?:\*\*)?(?<label>[A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?(?:\s+\S.*)?$")
            .Select(match => match.Groups["label"].Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => char.ToUpperInvariant(value[0]))
            .Distinct()
            .OrderBy(ch => ch)
            .ToList();

    private static string RemoveOrphanMarkdownMarkersByLine(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            lines[i] = RemoveOrphanMarkdownMarkersFromLine(line);
        }

        return string.Join('\n', lines);
    }

    private static string RemoveOrphanMarkdownMarkersFromLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line))
        {
            return line;
        }

        var working = line.Trim();
        if (working.Length == 0)
        {
            return string.Empty;
        }

        working = RemoveSingleOrphanPairFromLine(working, "**");
        working = RemoveSingleOrphanPairFromLine(working, "__");
        working = Regex.Replace(working, @"^(?:\\\*\\\*|\\_\\_)\s+", string.Empty);
        working = Regex.Replace(working, @"\s+(?:\\\*\\\*|\\_\\_)$", string.Empty);
        return working;
    }

    private static string RemoveSingleOrphanPairFromLine(string line, string marker)
    {
        if (string.IsNullOrWhiteSpace(line) || string.IsNullOrWhiteSpace(marker))
        {
            return line;
        }

        var occurrenceCount = CountOccurrences(line, marker);
        if (occurrenceCount == 1)
        {
            if (line.StartsWith(marker, StringComparison.Ordinal))
            {
                return line[marker.Length..].TrimStart();
            }

            if (line.EndsWith(marker, StringComparison.Ordinal))
            {
                return line[..^marker.Length].TrimEnd();
            }
        }

        return line;
    }

    private static int CountOccurrences(string text, string token)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrEmpty(token))
        {
            return 0;
        }

        var count = 0;
        var index = 0;
        while (true)
        {
            index = text.IndexOf(token, index, StringComparison.Ordinal);
            if (index < 0)
            {
                break;
            }

            count++;
            index += token.Length;
        }

        return count;
    }

    private static string RemoveLeadingRepeatedPassageTitle(string content, string? passageTitle)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalizedTitle = NormalizeComparableTitle(passageTitle);
        if (string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return content.Trim();
        }

        var lines = content
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n')
            .ToList();
        if (lines.Count == 0)
        {
            return content.Trim();
        }

        var changed = false;
        while (true)
        {
            var firstIndex = lines.FindIndex(line => !string.IsNullOrWhiteSpace(line));
            if (firstIndex < 0)
            {
                break;
            }

            var firstLineNormalized = NormalizeComparableTitle(lines[firstIndex]);
            if (string.IsNullOrWhiteSpace(firstLineNormalized))
            {
                break;
            }

            if (string.Equals(firstLineNormalized, normalizedTitle, StringComparison.Ordinal))
            {
                lines[firstIndex] = string.Empty;
                changed = true;
                continue;
            }

            var headingWithoutPrefix = Regex.Replace(
                firstLineNormalized,
                @"^(?:reading\s+)?passage\s*[0-9OoIl\|]+\s*[:\-]?\s*",
                string.Empty,
                RegexOptions.IgnoreCase).Trim();
            if (string.Equals(headingWithoutPrefix, normalizedTitle, StringComparison.Ordinal))
            {
                lines[firstIndex] = string.Empty;
                changed = true;
                continue;
            }

            if (Regex.IsMatch(firstLineNormalized, @"^(?:reading\s+)?passage\s*[0-9OoIl\|]+\s*$", RegexOptions.IgnoreCase))
            {
                var secondIndex = -1;
                for (var i = firstIndex + 1; i < lines.Count; i++)
                {
                    if (!string.IsNullOrWhiteSpace(lines[i]))
                    {
                        secondIndex = i;
                        break;
                    }
                }

                if (secondIndex > firstIndex)
                {
                    var secondLineNormalized = NormalizeComparableTitle(lines[secondIndex]);
                    if (string.Equals(secondLineNormalized, normalizedTitle, StringComparison.Ordinal))
                    {
                        lines[firstIndex] = string.Empty;
                        lines[secondIndex] = string.Empty;
                        changed = true;
                        continue;
                    }
                }
            }

            break;
        }

        var result = string.Join('\n', lines);
        result = RemoveLeadingTitlePrefix(result, passageTitle, normalizedTitle);
        if (!changed)
        {
            return result.Trim();
        }

        result = Regex.Replace(result, @"\n{3,}", "\n\n");
        return result.Trim();
    }

    private static string RemoveLeadingTitlePrefix(string content, string? passageTitle, string normalizedTitle)
    {
        if (string.IsNullOrWhiteSpace(content) || string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return content;
        }

        var title = passageTitle?.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return content;
        }

        var trimmed = content.TrimStart();
        if (trimmed.Length <= title.Length ||
            !trimmed.StartsWith(title, StringComparison.OrdinalIgnoreCase))
        {
            return content;
        }

        var leadingTitle = trimmed[..title.Length];
        if (!IsMostlyUppercaseTitlePrefix(leadingTitle))
        {
            return content;
        }

        var remainder = trimmed[title.Length..];
        remainder = Regex.Replace(remainder, @"^\s*[:\-–—]?\s*", string.Empty);

        return string.IsNullOrWhiteSpace(remainder)
            ? content
            : remainder.TrimStart();
    }

    private static bool IsMostlyUppercaseTitlePrefix(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var letters = value.Where(char.IsLetter).ToList();
        if (letters.Count == 0)
        {
            return false;
        }

        var upperCount = letters.Count(char.IsUpper);
        return upperCount >= Math.Max(2, letters.Count * 0.8d);
    }

    private static string NormalizeComparableTitle(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = UnescapeExtractedText(value)
            .Replace("\r\n", " ")
            .Replace('\r', ' ')
            .Replace('\n', ' ');
        normalized = Regex.Replace(normalized, @"[^\p{L}\p{N}\s]+", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ");
        return normalized.Trim().ToLowerInvariant();
    }

    private static string NormalizeLabeledPassageText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var cleaned = text.Trim();
        cleaned = Regex.Replace(cleaned, @"^\s*(?:\*{2,}|_{2,})\s+", string.Empty);
        cleaned = Regex.Replace(cleaned, @"\s+(?:\*{2,}|_{2,})\s*$", string.Empty);
        cleaned = Regex.Replace(cleaned, @"[ \t]{2,}", " ");
        return cleaned.Trim();
    }

    private static string NormalizeSpeakerAttributionLines(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return content;
        }

        var normalized = InlineSpeakerAttributionRegex().Replace(
            content,
            match =>
            {
                var quote = match.Groups["quote"].Value;
                var speaker = match.Groups["speaker"].Value.Trim();
                return $"{quote}\n\n{speaker}";
            });

        var lines = normalized
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Split('\n');

        var rebuiltLines = new List<string>(lines.Length + 8);
        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                if (rebuiltLines.Count > 0 && rebuiltLines[^1].Length > 0)
                {
                    rebuiltLines.Add(string.Empty);
                }

                continue;
            }

            var signatureMatch = SpeakerSignatureLineRegex().Match(line);
            if (signatureMatch.Success)
            {
                var speaker = signatureMatch.Groups["speaker"].Value.Trim();
                if (rebuiltLines.Count > 0 && rebuiltLines[^1].Length > 0)
                {
                    rebuiltLines.Add(string.Empty);
                }

                rebuiltLines.Add($"***{speaker}***");
                rebuiltLines.Add(string.Empty);
                continue;
            }

            rebuiltLines.Add(line);
        }

        var rebuilt = string.Join("\n", rebuiltLines);
        return Regex.Replace(rebuilt, @"\n{3,}", "\n\n").Trim();
    }
}
