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

    private static DiagramPreviewCropBounds? TryBuildDiagramPreviewCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Words.Count == 0 || page.PageHeight <= 0)
        {
            return null;
        }

        var lines = BuildPdfWordLines(page.Words);
        if (lines.Count == 0)
        {
            return null;
        }

        var headerBottom = FindDiagramInstructionBottom(group, page, lines);
        if (headerBottom is null)
        {
            return null;
        }

        var cropTop = Math.Max(0d, Math.Min(page.PageHeight - 1, headerBottom.Value + Math.Max(16d, page.PageHeight * 0.018d)));
        var answerListTop = FindDiagramAnswerListTop(group, page, lines, cropTop);
        var hasExplicitInstructionBoundary = HasExplicitDiagramInstructionBoundary(lines, page);

        double? nextGroupHeaderTop = null;
        var nextGroupNumber = group.EndQuestion + 1;
        var nextGroupRegex = new Regex($@"(?i)questions?\s*{nextGroupNumber}\b");
        var nextGroupLine = lines
            .Where(line => line.TopFromPageTop >= cropTop)
            .FirstOrDefault(line => nextGroupRegex.IsMatch(line.Text));
        if (nextGroupLine is not null)
        {
            nextGroupHeaderTop = nextGroupLine.TopFromPageTop - Math.Max(8d, page.PageHeight * 0.012d);
        }

        var cropBottom = answerListTop
            ?? nextGroupHeaderTop
            ?? Math.Min(page.PageHeight, cropTop + page.PageHeight * 0.58d);

        cropBottom = Math.Min(page.PageHeight, cropBottom);
        if (cropBottom <= cropTop + page.PageHeight * 0.1d)
        {
            cropBottom = Math.Min(page.PageHeight, cropTop + page.PageHeight * 0.55d);
        }

        if (cropBottom <= cropTop + 40d)
        {
            return null;
        }

        return new DiagramPreviewCropBounds(
            TopRatio: Math.Clamp(cropTop / page.PageHeight, 0d, 0.98d),
            BottomRatio: Math.Clamp(cropBottom / page.PageHeight, 0.02d, 1d),
            HasExplicitBottomBoundary: answerListTop is not null || nextGroupHeaderTop is not null,
            HasExplicitInstructionBoundary: hasExplicitInstructionBoundary);
    }

    private static DiagramPreviewCropBounds? TryBuildContinuationDiagramPreviewCrop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Words.Count == 0 || page.PageHeight <= 0)
        {
            return null;
        }

        var lines = BuildPdfWordLines(page.Words);
        if (lines.Count == 0)
        {
            return null;
        }

        var instructionBottom = FindContinuationInstructionBottom(page, lines);
        var cropTop = instructionBottom is not null
            ? Math.Max(0d, Math.Min(page.PageHeight - 1, instructionBottom.Value + Math.Max(14d, page.PageHeight * 0.016d)))
            : Math.Max(0d, page.PageHeight * 0.08d);
        var answerListTop = FindDiagramAnswerListTop(group, page, lines, cropTop);
        var cropBottom = answerListTop
            ?? Math.Min(page.PageHeight, cropTop + page.PageHeight * 0.72d);

        if (cropBottom <= cropTop + 60d)
        {
            return null;
        }

        return new DiagramPreviewCropBounds(
            TopRatio: Math.Clamp(cropTop / page.PageHeight, 0d, 0.98d),
            BottomRatio: Math.Clamp(cropBottom / page.PageHeight, 0.02d, 1d),
            HasExplicitBottomBoundary: answerListTop is not null,
            HasExplicitInstructionBoundary: instructionBottom is not null);
    }

    private static bool HasExplicitDiagramInstructionBoundary(
        IReadOnlyList<PdfExtractedWordLine> lines,
        PdfExtractedPage page) =>
        lines.Any(line =>
            line.TopFromPageTop <= page.PageHeight * 0.82d &&
            line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) &&
            (line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ||
             line.NormalizedText.Contains("PASSAGE", StringComparison.Ordinal)));

    private static double? FindContinuationInstructionBottom(
        PdfExtractedPage page,
        IReadOnlyList<PdfExtractedWordLine> lines)
    {
        var candidates = lines
            .Select((line, index) => new
            {
                Line = line,
                Index = index,
                Score =
                    (line.NormalizedText.Contains("COMPLETE", StringComparison.Ordinal) ? 10 : 0) +
                    (line.NormalizedText.Contains("FLOW", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("CHART", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("DIAGRAM", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("MAP", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) || line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ? 6 : 0) +
                    (line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) || line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ? 6 : 0)
            })
            .Where(item => item.Line.TopFromPageTop <= page.PageHeight * 0.45d)
            .Where(item => item.Score >= 12)
            .OrderBy(item => item.Index)
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        var anchorIndex = candidates[0].Index;
        var maxGap = Math.Max(26d, page.PageHeight * 0.03d);
        var scanLimit = Math.Min(lines.Count - 1, anchorIndex + 8);
        var lowestBottom = lines[anchorIndex].BottomFromPageTop;

        for (var index = anchorIndex + 1; index <= scanLimit; index++)
        {
            var gap = lines[index].TopFromPageTop - lines[index - 1].BottomFromPageTop;
            if (gap > maxGap)
            {
                break;
            }

            lowestBottom = Math.Max(lowestBottom, lines[index].BottomFromPageTop);
        }

        return lowestBottom;
    }

    private static List<PdfExtractedWordLine> BuildPdfWordLines(IReadOnlyList<PdfExtractedWord> words)
    {
        if (words.Count == 0)
        {
            return [];
        }

        var orderedWords = words
            .OrderBy(word => word.TopFromPageTop)
            .ThenBy(word => word.Left)
            .ToList();

        var groupedLines = new List<List<PdfExtractedWord>>();
        foreach (var word in orderedWords)
        {
            if (string.IsNullOrWhiteSpace(word.Text))
            {
                continue;
            }

            if (groupedLines.Count == 0)
            {
                groupedLines.Add([word]);
                continue;
            }

            var lastLine = groupedLines[^1];
            var lastLineTop = lastLine.Min(item => item.TopFromPageTop);
            var lastLineBottom = lastLine.Max(item => item.BottomFromPageTop);
            var lastLineHeight = Math.Max(1d, lastLineBottom - lastLineTop);
            var wordCenter = (word.TopFromPageTop + word.BottomFromPageTop) / 2d;
            var lineCenter = (lastLineTop + lastLineBottom) / 2d;
            var tolerance = Math.Max(6d, lastLineHeight * 0.65d);

            if (Math.Abs(wordCenter - lineCenter) > tolerance)
            {
                groupedLines.Add([word]);
                continue;
            }

            lastLine.Add(word);
        }

        return groupedLines
            .Select(lineWords =>
            {
                var orderedLineWords = lineWords.OrderBy(word => word.Left).ToList();
                var text = string.Join(" ", orderedLineWords.Select(word => word.Text)).Trim();
                return new PdfExtractedWordLine(
                    Text: text,
                    NormalizedText: NormalizeComparableText(text),
                    TopFromPageTop: orderedLineWords.Min(word => word.TopFromPageTop),
                    BottomFromPageTop: orderedLineWords.Max(word => word.BottomFromPageTop),
                    Left: orderedLineWords.Min(word => word.Left),
                    Right: orderedLineWords.Max(word => word.Right));
            })
            .Where(line => !string.IsNullOrWhiteSpace(line.Text))
            .OrderBy(line => line.TopFromPageTop)
            .ThenBy(line => line.Left)
            .ToList();
    }

    private static double? FindDiagramInstructionBottom(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        IReadOnlyList<PdfExtractedWordLine> lines)
    {
        var rangeRegex = new Regex(
            $@"(?i)\bquestions?\s*{group.StartQuestion}\s*(?:-|–|—|â€“|â€”|to|\s+)\s*{group.EndQuestion}(?!\d)",
            RegexOptions.Compiled);

        var instructionTokens = BuildComparableSearchTokens(group.Instruction)
            .Where(token => token is not "QUESTIONS" and not "QUESTION" and not "ACCESS" and not "PRACTICES")
            .Take(10)
            .ToHashSet(StringComparer.Ordinal);

        var headerCandidates = lines
            .Select((line, index) => new
            {
                Index = index,
                Score = ScoreDiagramInstructionLine(line, group, rangeRegex, instructionTokens)
            })
            .Where(entry => entry.Score >= 18)
            .OrderByDescending(entry => entry.Score)
            .ThenBy(entry => entry.Index)
            .ToList();

        if (headerCandidates.Count == 0)
        {
            return null;
        }

        var anchorIndex = headerCandidates[0].Index;
        var maxGap = Math.Max(26d, page.PageHeight * 0.03d);
        var scanLimit = Math.Min(lines.Count - 1, anchorIndex + 10);
        var lowestBottom = lines[anchorIndex].BottomFromPageTop;

        for (var index = anchorIndex + 1; index <= scanLimit; index++)
        {
            var gap = lines[index].TopFromPageTop - lines[index - 1].BottomFromPageTop;
            if (gap > maxGap)
            {
                break;
            }

            lowestBottom = Math.Max(lowestBottom, lines[index].BottomFromPageTop);
        }

        var strongTokens = new HashSet<string>(instructionTokens, StringComparer.Ordinal)
        {
            "WRITE",
            "WORDS",
            "WORD",
            "ANSWER",
            "ANSWERS",
            "LABEL",
            "DIAGRAM",
            "MAP",
            "PASSAGE"
        };

        var explicitAnswerInstructionBottom = lines
            .Skip(anchorIndex)
            .Take(4)
            .Where(line => line.TopFromPageTop <= page.PageHeight * 0.82d)
            .Where(line =>
                line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ||
                line.NormalizedText.Contains("PASSAGE", StringComparison.Ordinal))
            .Select(line => (double?)line.BottomFromPageTop)
            .Max();

        if (explicitAnswerInstructionBottom is not null)
        {
            return explicitAnswerInstructionBottom;
        }

        var fallbackInstructionCandidates = lines
            .Select((line, index) => new
            {
                Line = line,
                Index = index,
                Score =
                    (line.NormalizedText.Contains("WRITE", StringComparison.Ordinal) ? 10 : 0) +
                    (line.NormalizedText.Contains("WORDS", StringComparison.Ordinal) || line.NormalizedText.Contains("WORD", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("ANSWER", StringComparison.Ordinal) || line.NormalizedText.Contains("ANSWERS", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("PASSAGE", StringComparison.Ordinal) ? 8 : 0) +
                    (line.NormalizedText.Contains("LABEL", StringComparison.Ordinal) || line.NormalizedText.Contains("DIAGRAM", StringComparison.Ordinal) || line.NormalizedText.Contains("MAP", StringComparison.Ordinal) ? 6 : 0)
            })
            .Where(item => item.Line.TopFromPageTop <= page.PageHeight * 0.82d)
            .Where(item => item.Score >= 16)
            .OrderBy(item => item.Index)
            .ToList();

        if (fallbackInstructionCandidates.Count > 0)
        {
            var fallbackAnchorIndex = fallbackInstructionCandidates[0].Index;
            var fallbackBottom = lines
                .Skip(fallbackAnchorIndex)
                .Take(4)
                .Where(line => line.TopFromPageTop <= page.PageHeight * 0.82d)
                .Select(line => (double?)line.BottomFromPageTop)
                .Max();

            if (fallbackBottom is not null)
            {
                return fallbackBottom;
            }
        }

        var instructionBottom = lines
            .Skip(anchorIndex)
            .Take(4)
            .Where(line => line.TopFromPageTop <= page.PageHeight * 0.82d)
            .Where(line => strongTokens.Any(token => line.NormalizedText.Contains(token, StringComparison.Ordinal)))
            .Select(line => (double?)line.BottomFromPageTop)
            .Max();

        return instructionBottom ?? lowestBottom;
    }

    private static int ScoreDiagramInstructionLine(
        PdfExtractedWordLine line,
        PdfRawQuestionInstructionPreviewDto group,
        Regex rangeRegex,
        IReadOnlySet<string> instructionTokens)
    {
        var score = 0;
        if (rangeRegex.IsMatch(line.Text))
        {
            score += 80;
        }

        if (line.NormalizedText.Contains("QUESTIONS", StringComparison.Ordinal))
        {
            score += 12;
        }

        if (line.NormalizedText.Contains(group.StartQuestion.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
        {
            score += 8;
        }

        if (line.NormalizedText.Contains(group.EndQuestion.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal))
        {
            score += 8;
        }

        if (line.NormalizedText.Contains("LABEL", StringComparison.Ordinal) ||
            line.NormalizedText.Contains("DIAGRAM", StringComparison.Ordinal) ||
            line.NormalizedText.Contains("MAP", StringComparison.Ordinal))
        {
            score += 10;
        }

        foreach (var token in instructionTokens)
        {
            if (line.NormalizedText.Contains(token, StringComparison.Ordinal))
            {
                score += 3;
            }
        }

        return score;
    }

    private static double? FindDiagramAnswerListTop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page,
        IReadOnlyList<PdfExtractedWordLine> lines,
        double cropTop)
    {
        var expectedNumbers = Enumerable.Range(group.StartQuestion, group.EndQuestion - group.StartQuestion + 1)
            .Select(number => number.ToString(CultureInfo.InvariantCulture))
            .ToHashSet(StringComparer.Ordinal);
        if (expectedNumbers.Count == 0)
        {
            return null;
        }

        var minTop = cropTop + page.PageHeight * 0.08d;
        var minLeft = lines.Min(line => line.Left);
        var maxRight = lines.Max(line => line.Right);
        var leftThreshold = minLeft + Math.Max(72d, (maxRight - minLeft) * 0.16d);
        var candidateLines = lines
            .Where(line => line.TopFromPageTop >= minTop)
            .Where(line => line.Left <= leftThreshold)
            .Select(line => new
            {
                Line = line,
                QuestionNumber = TryExtractStandaloneAnswerNumber(line.Text, expectedNumbers)
            })
            .Where(item => item.QuestionNumber is not null)
            .OrderBy(item => item.Line.TopFromPageTop)
            .ToList();

        if (candidateLines.Count == 0)
        {
            return null;
        }

        var gapTolerance = Math.Max(24d, page.PageHeight * 0.035d);
        var clusters = new List<List<(PdfExtractedWordLine Line, string QuestionNumber)>>();
        foreach (var candidateLine in candidateLines)
        {
            var typedCandidate = (candidateLine.Line, candidateLine.QuestionNumber!);
            if (clusters.Count == 0)
            {
                clusters.Add([typedCandidate]);
                continue;
            }

            var lastCluster = clusters[^1];
            var lastLine = lastCluster[^1];
            if (typedCandidate.Line.TopFromPageTop - lastLine.Line.BottomFromPageTop > gapTolerance)
            {
                clusters.Add([typedCandidate]);
                continue;
            }

            lastCluster.Add(typedCandidate);
        }

        var answerCluster = clusters
            .Where(cluster => cluster
                .Select(item => item.QuestionNumber)
                .Distinct(StringComparer.Ordinal)
                .Count() >= 2)
            .OrderByDescending(cluster => cluster.Average(item => item.Line.TopFromPageTop))
            .FirstOrDefault();

        return answerCluster is not null
            ? Math.Max(cropTop + 20d, answerCluster[0].Line.TopFromPageTop - Math.Max(12d, page.PageHeight * 0.018d))
            : null;
    }

    private static string? TryExtractStandaloneAnswerNumber(string lineText, IReadOnlySet<string> expectedNumbers)
    {
        var normalizedLine = Regex.Replace(lineText, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalizedLine))
        {
            return null;
        }

        if (normalizedLine.Contains("QUESTIONS", StringComparison.OrdinalIgnoreCase) ||
            normalizedLine.Contains("QUESTION", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var leadingNumberMatch = Regex.Match(normalizedLine, @"^(\d{1,3})(?=\s|[.):\-]|$)");
        if (!leadingNumberMatch.Success)
        {
            return null;
        }

        var questionNumber = leadingNumberMatch.Groups[1].Value;
        if (!expectedNumbers.Contains(questionNumber))
        {
            return null;
        }

        var trailing = normalizedLine[leadingNumberMatch.Length..].Trim();
        if (trailing.Length == 0)
        {
            return questionNumber;
        }

        var compactTrailing = Regex.Replace(trailing, @"[\s._\-–—…]+", string.Empty);
        if (compactTrailing.Length == 0)
        {
            return questionNumber;
        }

        if (Regex.IsMatch(trailing, @"^[A-Za-z<\[]"))
        {
            return questionNumber;
        }

        return null;
    }

    [SupportedOSPlatform("windows")]
    [SupportedOSPlatform("windows")]
    private static double ScoreDiagramRectangle(Bitmap bitmap, Rectangle rectangle)
    {
        var areaRatio = GetRectangleAreaRatio(rectangle, bitmap);
        var density = ComputeForegroundDensity(bitmap, rectangle);
        return areaRatio * 100d + density * 40d;
    }

    [SupportedOSPlatform("windows")]
    private static double GetRectangleAreaRatio(Rectangle rectangle, Bitmap bitmap) =>
        (double)(rectangle.Width * rectangle.Height) / Math.Max(1d, bitmap.Width * bitmap.Height);

    [SupportedOSPlatform("windows")]
    private static double ComputeForegroundDensity(Bitmap bitmap, Rectangle rectangle)
    {
        if (rectangle.Width <= 0 || rectangle.Height <= 0)
        {
            return 0d;
        }

        var stepX = Math.Max(1, rectangle.Width / 120);
        var stepY = Math.Max(1, rectangle.Height / 120);
        var samples = 0;
        var foreground = 0;

        for (var y = rectangle.Top; y < rectangle.Bottom; y += stepY)
        {
            for (var x = rectangle.Left; x < rectangle.Right; x += stepX)
            {
                samples++;
                if (IsForegroundPixel(bitmap.GetPixel(x, y)))
                {
                    foreground++;
                }
            }
        }

        return samples == 0 ? 0d : (double)foreground / samples;
    }

    private static double? TryGetQuestionHeaderBottomFromPageTop(
        PdfRawQuestionInstructionPreviewDto group,
        PdfExtractedPage page)
    {
        if (page.Words.Count == 0)
        {
            return null;
        }

        var anchorTokens = BuildQuestionAreaAnchorTokens(group);
        if (anchorTokens.Count == 0)
        {
            return null;
        }

        var matchedWords = page.Words
            .Where(word =>
            {
                var normalizedWord = NormalizeComparableText(word.Text);
                return anchorTokens.Contains(normalizedWord);
            })
            .ToList();

        if (matchedWords.Count < 2)
        {
            return null;
        }

        return matchedWords.Max(word => word.BottomFromPageTop);
    }
}
