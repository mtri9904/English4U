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
using EnglishExamApp.Application.Realtime;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService(
    IGemmaCompletionClient gemmaCompletionClient,
    IApplicationDbContext context,
    IExamService examService,
    IPdfGenerationProgressTracker pdfGenerationProgressTracker,
    IRealtimeEventPublisher realtimeEventPublisher,
    IConfiguration configuration,
    ILogger<GemmaPdfExamGenerationService> logger) : IExamPdfGenerationService
{
    private const int MaxJsonParseRetries = 2;
    private const int DefaultDelayBetweenPassageCallsMs = 6000;
    private const int RawReviewMaxApiRetries = 0;
    private const int MaxPassageInputCharacters = 12000;
    private const int MaxSegmentInputCharacters = 9000;
    private const int MaxSegmentSharedPassageContextCharacters = 5000;
    private const int SegmentDelayBetweenCallsMs = 1500;
    private const int RawReviewDelayBetweenAiCallsMs = 900;
    private const int MaxFallbackAnswerKeyCharacters = 14000;
    private const int MaxAiAnswerKeySourceCharacters = 26000;
    private const int MaxFallbackOptionSourceCharacters = 18000;
    private const int MinimumVerifiedAnswersToEnableStrictClearing = 20;
    private const int MaxRawReviewDiagramPreviewBytes = 6 * 1024 * 1024;
    private const int MinDiagramPreviewImageSamples = 80;
    private const int MaxVisualPreviewPagesPerGroup = 2;
    private const int MaxVisualPreviewImagesPerPage = 2;
    private const int MaxDedicatedMatchingVisualSearchPages = 3;
    private const double MinMatchingVisualPageCoverage = 0.025d;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly int _delayBetweenPassageCallsMs = Math.Clamp(
        configuration.GetValue<int?>("GemmaExamGeneration:DelayBetweenPassageCallsMs") ?? DefaultDelayBetweenPassageCallsMs,
        1000,
        30000);

    private static List<string> SplitPassages(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return [];
        }

        var normalizedText = rawText
            .Replace("\r\n", "\n")
            .Replace('\u00A0', ' ')
            .Replace('\u2007', ' ')
            .Replace('\u202F', ' ');

        var passageCandidates = ExtractPassageMarkers(normalizedText, ReadingPassageRegex());
        if (passageCandidates.Count < 3)
        {
            passageCandidates.AddRange(ExtractPassageMarkers(normalizedText, InlineReadingPassageRegex()));
        }

        if (passageCandidates.Count < 3)
        {
            // Fallback when PDF text extraction drops the "Reading" prefix.
            passageCandidates.AddRange(ExtractPassageMarkers(normalizedText, FallbackPassageRegex()));
        }

        if (passageCandidates.Count < 3)
        {
            passageCandidates.AddRange(ExtractPassageMarkers(normalizedText, InlineFallbackPassageRegex()));
        }

        var passageMarkers = passageCandidates
            .GroupBy(x => x.Number)
            .Select(group => group.OrderBy(x => x.StartIndex).First())
            .OrderBy(x => x.StartIndex)
            .ToList();

        if (passageMarkers.Count is 1 or 2)
        {
            passageMarkers = BuildPassageMarkersWithQuestionFallback(normalizedText, passageMarkers);
        }

        if (passageMarkers.Count == 3)
        {
            var markerSplitPassages = SplitByPassageMarkers(normalizedText, passageMarkers);
            if (markerSplitPassages.Count == 3)
            {
                var fallbackByQuestionRange = SplitByQuestionRangeBoundaries(normalizedText);
                if (fallbackByQuestionRange.Count == 3 &&
                    markerSplitPassages[0].Length < Math.Min(1200, fallbackByQuestionRange[0].Length))
                {
                    return fallbackByQuestionRange;
                }

                return markerSplitPassages;
            }
        }

        // Fallback for PDFs where passage titles are OCR-broken or missing.
        var questionRangeFallbackPassages = SplitByQuestionRangeBoundaries(normalizedText);
        if (questionRangeFallbackPassages.Count == 3)
        {
            return questionRangeFallbackPassages;
        }

        if (passageMarkers.Count == 0)
        {
            return [];
        }

        var passages = new List<string>(passageMarkers.Count);
        for (var i = 0; i < passageMarkers.Count; i++)
        {
            var start = passageMarkers[i].StartIndex;
            var end = i == passageMarkers.Count - 1
                ? normalizedText.Length
                : passageMarkers[i + 1].StartIndex;

            if (end <= start)
            {
                continue;
            }

            var rawChunk = normalizedText[start..end].Trim();
            if (i == passageMarkers.Count - 1)
            {
                rawChunk = StripTrailingAnswerAndExplanationBlock(rawChunk);
            }

            var chunk = CleanPassageChunk(rawChunk);
            if (!string.IsNullOrWhiteSpace(chunk))
            {
                passages.Add(chunk);
            }
        }

        return passages;
    }

    private static List<string> SplitByPassageMarkers(string normalizedText, List<PassageMarker> passageMarkers)
    {
        var passages = new List<string>(passageMarkers.Count);
        for (var i = 0; i < passageMarkers.Count; i++)
        {
            var start = passageMarkers[i].StartIndex;
            var end = i == passageMarkers.Count - 1
                ? normalizedText.Length
                : passageMarkers[i + 1].StartIndex;

            if (end <= start)
            {
                continue;
            }

            var rawChunk = normalizedText[start..end].Trim();
            if (i == passageMarkers.Count - 1)
            {
                rawChunk = StripTrailingAnswerAndExplanationBlock(rawChunk);
            }

            var chunk = CleanPassageChunk(rawChunk);
            if (!string.IsNullOrWhiteSpace(chunk))
            {
                passages.Add(chunk);
            }
        }

        return passages;
    }

    private static List<PassageMarker> BuildPassageMarkersWithQuestionFallback(
        string normalizedText,
        List<PassageMarker> initialMarkers)
    {
        var markers = initialMarkers
            .GroupBy(x => x.Number)
            .Select(group => group.OrderBy(x => x.StartIndex).First())
            .ToList();

        var questionRangeStarts = ExtractQuestionRangeStarts(normalizedText);

        if (!markers.Any(x => x.Number == 1))
        {
            markers.Add(new PassageMarker(1, 0));
        }

        if (!markers.Any(x => x.Number == 2) &&
            questionRangeStarts.TryGetValue(14, out var start14))
        {
            markers.Add(new PassageMarker(2, start14));
        }

        if (!markers.Any(x => x.Number == 3) &&
            questionRangeStarts.TryGetValue(27, out var start27))
        {
            markers.Add(new PassageMarker(3, start27));
        }

        return markers
            .GroupBy(x => x.Number)
            .Select(group => group.OrderBy(x => x.StartIndex).First())
            .OrderBy(x => x.StartIndex)
            .ToList();
    }

    private static Dictionary<int, int> ExtractQuestionRangeStarts(string normalizedText) =>
        QuestionRangeBoundaryRegex()
            .Matches(normalizedText)
            .Select(match => new
            {
                StartQuestion = ParseOcrQuestionNumber(match.Groups["start"].Value),
                StartIndex = match.Index
            })
            .Where(x => x.StartQuestion is 1 or 14 or 27)
            .GroupBy(x => x.StartQuestion)
            .ToDictionary(group => group.Key, group => group.Min(x => x.StartIndex));

    private static int ParseOcrQuestionNumber(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return -1;
        }

        var normalized = value
            .Trim()
            .Replace('O', '0')
            .Replace('o', '0')
            .Replace('I', '1')
            .Replace('l', '1')
            .Replace('|', '1');

        return int.TryParse(normalized, out var parsed) ? parsed : -1;
    }

    private static List<PassageMarker> ExtractPassageMarkers(string normalizedText, Regex regex) =>
        regex
            .Matches(normalizedText)
            .Select(match => new
            {
                Number = ParsePassageNumber(match.Groups["number"].Value),
                StartIndex = match.Index
            })
            .Where(x => x.Number is not null)
            .Select(x => new PassageMarker(x.Number!.Value, x.StartIndex))
            .ToList();

    private static int? ParsePassageNumber(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        var normalized = token.Trim().ToUpperInvariant();
        return normalized switch
        {
            "1" or "ONE" => 1,
            "2" or "TWO" => 2,
            "3" or "THREE" => 3,
            _ => null
        };
    }

    private static List<string> SplitByQuestionRangeBoundaries(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return [];
        }

        var rangeMarkers = ExtractQuestionRangeStarts(normalizedText);

        if (!rangeMarkers.TryGetValue(14, out var start14) ||
            !rangeMarkers.TryGetValue(27, out var start27) ||
            start14 <= 0 ||
            start27 <= start14)
        {
            return [];
        }

        var boundaries = new[] { 0, start14, start27, normalizedText.Length };
        var passages = new List<string>(3);
        for (var i = 0; i < 3; i++)
        {
            var start = boundaries[i];
            var end = boundaries[i + 1];
            if (end <= start)
            {
                return [];
            }

            var rawChunk = normalizedText[start..end].Trim();
            if (i == 2)
            {
                rawChunk = StripTrailingAnswerAndExplanationBlock(rawChunk);
            }

            var cleanedChunk = CleanPassageChunk(rawChunk);
            if (string.IsNullOrWhiteSpace(cleanedChunk))
            {
                return [];
            }

            passages.Add(cleanedChunk);
        }

        return passages;
    }

    private static string StripTrailingAnswerAndExplanationBlock(string normalizedText)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return normalizedText;
        }

        var answerSectionMatch = AnswerSectionHeadingRegex()
            .Matches(normalizedText)
            .Cast<Match>()
            .FirstOrDefault(match =>
            {
                if (match.Index <= 0)
                {
                    return false;
                }

                var lookAheadLength = Math.Min(2500, normalizedText.Length - match.Index);
                if (lookAheadLength <= 0)
                {
                    return false;
                }

                var trailingBlock = normalizedText.Substring(match.Index, lookAheadLength);
                var answerLineCount = AnswerEntryLineRegex().Matches(trailingBlock).Count;
                return answerLineCount >= 3;
            });

        if (answerSectionMatch is null || !answerSectionMatch.Success || answerSectionMatch.Index <= 0)
        {
            return normalizedText;
        }

        var trimmed = normalizedText[..answerSectionMatch.Index].TrimEnd();
        return string.IsNullOrWhiteSpace(trimmed) ? normalizedText : trimmed;
    }

    private static string CleanPassageChunk(string chunk)
    {
        if (string.IsNullOrWhiteSpace(chunk))
        {
            return chunk;
        }

        var cleaned = PassageNoiseLineRegex().Replace(chunk, string.Empty);
        cleaned = Regex.Replace(cleaned, @"\n{3,}", "\n\n");
        return cleaned.Trim();
    }

    private static string PreparePassageInputForGemma(string passageText, bool allowHardTrim = true)
    {
        if (string.IsNullOrWhiteSpace(passageText))
        {
            return passageText;
        }

        var prepared = StripTrailingAnswerAndExplanationBlock(passageText);
        prepared = CleanPassageChunk(prepared);
        prepared = NormalizeExtractedSpacing(prepared);
        prepared = RemoveSelectionMarkers(prepared);

        if (!allowHardTrim || prepared.Length <= MaxPassageInputCharacters)
        {
            return prepared;
        }

        var looseAnswerHeading = LooseAnswerSectionHeadingRegex().Match(prepared);
        if (looseAnswerHeading.Success && looseAnswerHeading.Index > 1000)
        {
            prepared = prepared[..looseAnswerHeading.Index].TrimEnd();
        }

        if (prepared.Length <= MaxPassageInputCharacters)
        {
            return prepared;
        }

        var explanationHeadingMatch = ExplanationQuestionHeadingRegex()
            .Matches(prepared)
            .Cast<Match>()
            .FirstOrDefault(match =>
            {
                if (!match.Success || match.Index < prepared.Length * 0.55d)
                {
                    return false;
                }

                var lookAheadLength = Math.Min(1800, prepared.Length - match.Index);
                if (lookAheadLength <= 0)
                {
                    return false;
                }

                var lookAheadChunk = prepared.Substring(match.Index, lookAheadLength);
                return ExplanationQuestionHeadingRegex().Matches(lookAheadChunk).Count >= 2;
            });

        if (explanationHeadingMatch is not null && explanationHeadingMatch.Success && explanationHeadingMatch.Index > 1000)
        {
            prepared = prepared[..explanationHeadingMatch.Index].TrimEnd();
        }

        if (prepared.Length <= MaxPassageInputCharacters)
        {
            return prepared;
        }

        return prepared[..MaxPassageInputCharacters].TrimEnd();
    }
}
