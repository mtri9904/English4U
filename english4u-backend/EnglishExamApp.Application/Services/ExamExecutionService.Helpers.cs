using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace EnglishExamApp.Application.Services;

public sealed partial class ExamExecutionService
{
    private const int WritingSubmitMinWords = 10;

    private static readonly JsonSerializerOptions SpeakingEvidenceJsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static readonly string[] RomanOptionLabels =
    [
        "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
        "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx",
        "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi"
    ];

    private static readonly Regex PromptVisemeChunkRegex = new(
        "th|sh|ch|ph|wh|ee|ea|oo|ou|ow|[aeiouy]+|[bcdfghjklmnpqrstvwxyz]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly HashSet<string> PracticeSessionHighlightColors = new(StringComparer.OrdinalIgnoreCase)
    {
        "yellow",
        "green",
        "blue",
        "pink",
        "purple"
    };

    private sealed record SessionHeader(
        Guid SessionId,
        Guid UserId,
        Guid ExamId,
        string ExamTitle,
        string? ExamDescription,
        string? ExamType,
        int? DurationMinutes,
        string SkillType,
        string Status,
        DateTime StartedAt,
        DateTime? EndedAt,
        int? TimeRemaining,
        bool IsPublished);

    private sealed record ObjectiveQuestionBlueprint(
        Guid QuestionId,
        int? QuestionNumber,
        double Points,
        string? GroupType,
        string SkillType);

    private static IReadOnlyList<PracticeSessionHighlightDto> ParsePracticeSessionHighlights(string? highlightsData)
    {
        if (string.IsNullOrWhiteSpace(highlightsData))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<IReadOnlyList<PracticeSessionHighlightDto>>(
                highlightsData,
                SpeakingEvidenceJsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static List<PracticeSessionHighlightDto> NormalizePracticeSessionHighlights(
        IEnumerable<PracticeSessionHighlightDto>? highlights)
    {
        var now = DateTime.UtcNow;
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        return (highlights ?? [])
            .Select(highlight =>
            {
                var id = string.IsNullOrWhiteSpace(highlight.Id)
                    ? Guid.NewGuid().ToString("N")
                    : highlight.Id.Trim();
                var sourceKey = (highlight.SourceKey ?? string.Empty).Trim();
                var selectedText = (highlight.SelectedText ?? string.Empty).Trim();
                var color = (highlight.Color ?? string.Empty).Trim().ToLowerInvariant();
                var startOffset = Math.Max(0, highlight.StartOffset);
                var endOffset = Math.Max(0, highlight.EndOffset);

                return new PracticeSessionHighlightDto(
                    id.Length > 80 ? id[..80] : id,
                    sourceKey.Length > 240 ? sourceKey[..240] : sourceKey,
                    startOffset,
                    endOffset,
                    selectedText.Length > 1000 ? selectedText[..1000] : selectedText,
                    color,
                    highlight.CreatedAt == default ? now : highlight.CreatedAt,
                    highlight.UpdatedAt == default ? now : highlight.UpdatedAt);
            })
            .Where(highlight =>
                highlight.SourceKey.Length > 0
                && highlight.SelectedText.Length > 0
                && PracticeSessionHighlightColors.Contains(highlight.Color)
                && highlight.EndOffset > highlight.StartOffset
                && seenIds.Add(highlight.Id))
            .OrderBy(highlight => highlight.SourceKey, StringComparer.Ordinal)
            .ThenBy(highlight => highlight.StartOffset)
            .ThenBy(highlight => highlight.EndOffset)
            .Take(500)
            .ToList();
    }

    private sealed record ExamScoringProfile(
        string? ExamType,
        string? Title,
        string? Description);

    private sealed record StoredSpeakingAudioQuality(
        [property: JsonPropertyName("is_usable")] bool IsUsable,
        [property: JsonPropertyName("label")] string? Label,
        [property: JsonPropertyName("duration_seconds")] double? DurationSeconds,
        [property: JsonPropertyName("sample_rate_hz")] int? SampleRateHz,
        [property: JsonPropertyName("channels")] int? Channels,
        [property: JsonPropertyName("silence_ratio")] double? SilenceRatio,
        [property: JsonPropertyName("clipping_ratio")] double? ClippingRatio,
        [property: JsonPropertyName("loudness_dbfs")] double? LoudnessDbfs,
        [property: JsonPropertyName("snr_db")] double? SnrDb,
        [property: JsonPropertyName("normalized_audio_format")] string? NormalizedAudioFormat,
        [property: JsonPropertyName("warnings")] IReadOnlyList<string>? Warnings);

    private sealed record StoredSpeakingPauseStats(
        [property: JsonPropertyName("pause_count")] int PauseCount,
        [property: JsonPropertyName("long_pause_count")] int LongPauseCount,
        [property: JsonPropertyName("total_pause_seconds")] double TotalPauseSeconds,
        [property: JsonPropertyName("average_pause_seconds")] double? AveragePauseSeconds,
        [property: JsonPropertyName("longest_pause_seconds")] double? LongestPauseSeconds);

    private sealed record StoredSpeakingWordTimestamp(
        [property: JsonPropertyName("word")] string Word,
        [property: JsonPropertyName("start")] double? Start,
        [property: JsonPropertyName("end")] double? End,
        [property: JsonPropertyName("probability")] double? Probability);

    private static bool IsFlexibleFillBlankGroupType(string? groupType)
    {
        var normalized = (groupType ?? string.Empty).Trim().ToUpperInvariant();
        return normalized is "SENTENCE_COMPLETION" or "SUMMARY_COMPLETION" or "TABLE_COMPLETION" or "FLOWCHART_COMPLETION" or "SHORT_ANSWER" or "SHORT_ANSWER_QUESTIONS";
    }

    private static bool IsAlternativeSingleSelectionMatchingGroupType(string? groupType)
    {
        var normalized = (groupType ?? string.Empty).Trim().ToUpperInvariant();
        return normalized is "MATCHING_INFO" or "MATCHING_INFORMATION" or "MATCHING_FEATURES" or "MATCHING_CLASSIFICATION" or "MATCHING_OPINION";
    }

    private static bool IsChooseNGroupType(string? groupType)
    {
        var normalized = (groupType ?? string.Empty).Trim().ToUpperInvariant();
        return normalized == "MCQ_CHOOSE_N";
    }

    private static string NormalizeSessionStatus(string? status) =>
        status?.Trim() switch
        {
            null or "" => "NotStarted",
            "Scored" => "Completed",
            _ => status!.Trim(),
        };

    private static bool IsFinalizedStatus(string? status)
    {
        var normalized = NormalizeSessionStatus(status);
        return normalized is "Submitted" or "Completed";
    }

    private static string NormalizeSkillType(string? skillType) =>
        (skillType ?? string.Empty).Trim().ToUpperInvariant();

    private static bool IsGeneralTrainingReadingExam(string? examType, string? title, string? description)
    {
        var descriptor = $"{examType} {title} {description}".ToUpperInvariant();
        return descriptor.Contains("GENERAL TRAINING", StringComparison.Ordinal)
            || descriptor.Contains("IELTS GENERAL", StringComparison.Ordinal)
            || Regex.IsMatch(descriptor, @"\bGT\b");
    }

    private static bool IsGeneralTrainingReadingExam(ExamScoringProfile? profile) =>
        profile is not null && IsGeneralTrainingReadingExam(profile.ExamType, profile.Title, profile.Description);

    private static double CalculateRawScore(
        IEnumerable<PracticeSessionAnswerDto> answers,
        IEnumerable<ObjectiveQuestionBlueprint> blueprints,
        string skillType) =>
        answers
            .Where(answer => answer.IsCorrect == true)
            .Join(
                blueprints.Where(item => item.SkillType == skillType),
                answer => answer.QuestionId,
                question => question.QuestionId,
                (answer, question) => question.Points)
            .Sum();

    private static double CalculateMaxScore(IEnumerable<ObjectiveQuestionBlueprint> blueprints, string skillType) =>
        blueprints
            .Where(item => item.SkillType == skillType)
            .Sum(item => item.Points);

    private static int CountWords(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return 0;
        }

        return Regex.Matches(value.Trim(), @"\S+").Count;
    }

    private static int? GetSpeakingTargetDurationSeconds(int? partNumber, bool hasCueCardPoints = false) =>
        partNumber switch
        {
            1 => 30,
            2 when hasCueCardPoints => 120,
            2 => 35,
            3 => 60,
            _ => null,
        };

    private static string GetSpeakingPaceLabel(double? wordsPerMinute)
    {
        if (!wordsPerMinute.HasValue || wordsPerMinute.Value <= 0)
        {
            return "insufficient_data";
        }

        return wordsPerMinute.Value switch
        {
            < 85 => "slow",
            <= 155 => "balanced",
            <= 185 => "fast",
            _ => "very_fast",
        };
    }

    private static string GetSpeakingCoverageLabel(double? coverageRatio)
    {
        if (!coverageRatio.HasValue || coverageRatio.Value <= 0)
        {
            return "insufficient_data";
        }

        return coverageRatio.Value switch
        {
            < 0.35 => "too_short",
            < 0.55 => "too_short",
            <= 1.0 => "on_target",
            _ => "exceeds_target",
        };
    }

    private static double? EstimateFluencyBand(int wordCount, double? wordsPerMinute, double? coverageRatio)
    {
        if (wordCount == 0)
        {
            return null;
        }

        var score = 6.0;

        if (!wordsPerMinute.HasValue || wordsPerMinute.Value <= 0)
        {
            score -= 0.5;
        }
        else if (wordsPerMinute.Value < 85)
        {
            score -= 1.0;
        }
        else if (wordsPerMinute.Value <= 155)
        {
            score += 1.0;
        }
        else if (wordsPerMinute.Value <= 185)
        {
            score += 0.25;
        }
        else
        {
            score -= 0.75;
        }

        if (coverageRatio.HasValue)
        {
            if (coverageRatio.Value < 0.35)
            {
                score -= 1.25;
            }
            else if (coverageRatio.Value < 0.55)
            {
                score -= 0.75;
            }
            else if (coverageRatio.Value <= 1.0)
            {
                score += 0.25;
            }
            else if (coverageRatio.Value > 1.1)
            {
                score -= 0.25;
            }
        }

        if (wordCount < 12)
        {
            score = Math.Min(score, 4.5);
        }
        else if (wordCount < 25)
        {
            score = Math.Min(score, 5.5);
        }

        return Math.Round(Math.Clamp(score, 3.0, 8.5), 1);
    }

    private static T? DeserializeSpeakingEvidence<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, SpeakingEvidenceJsonOptions);
        }
        catch
        {
            return default;
        }
    }

    private static IReadOnlyList<string>? DeserializeFeedbackEvidence(string? json) =>
        DeserializeSpeakingEvidence<IReadOnlyList<string>>(json);

    private static IReadOnlyList<PracticeSessionSpeakingWordTimestampDto>? BuildWordTimestampDtos(string? json)
    {
        var timestamps = DeserializeSpeakingEvidence<IReadOnlyList<StoredSpeakingWordTimestamp>>(json);
        if (timestamps is null || timestamps.Count == 0)
        {
            return null;
        }

        return timestamps
            .Where(item => !string.IsNullOrWhiteSpace(item.Word))
            .Take(80)
            .Select(item => new PracticeSessionSpeakingWordTimestampDto(
                item.Word.Trim(),
                item.Start,
                item.End,
                item.Probability))
            .ToList();
    }

    private static PracticeSessionSpeakingAnalyticsDto? BuildSpeakingAnalytics(
        string? transcriptText,
        string? answerText,
        double? durationSeconds,
        int? partNumber,
        bool hasCueCardPoints = false,
        SpeechTranscript? transcript = null,
        UserAudioRecord? audioRecord = null)
    {
        var sourceText = !string.IsNullOrWhiteSpace(transcriptText)
            ? transcriptText
            : answerText;
        var wordCount = CountWords(sourceText);
        var targetDurationSeconds = GetSpeakingTargetDurationSeconds(partNumber, hasCueCardPoints);

        if (wordCount == 0 && (!durationSeconds.HasValue || durationSeconds.Value <= 0))
        {
            return null;
        }

        double? wordsPerMinute = null;
        if (wordCount > 0 && durationSeconds.HasValue && durationSeconds.Value > 0)
        {
            wordsPerMinute = Math.Round((wordCount / durationSeconds.Value) * 60d, 1);
        }

        double? coverageRatio = null;
        if (targetDurationSeconds.HasValue && durationSeconds.HasValue && targetDurationSeconds.Value > 0)
        {
            coverageRatio = Math.Round(durationSeconds.Value / targetDurationSeconds.Value, 2);
        }

        var audioQuality = DeserializeSpeakingEvidence<StoredSpeakingAudioQuality>(audioRecord?.AudioQualityData);
        var pauseStats = DeserializeSpeakingEvidence<StoredSpeakingPauseStats>(transcript?.PauseStatsData);

        return new PracticeSessionSpeakingAnalyticsDto(
            wordCount,
            wordsPerMinute,
            coverageRatio,
            targetDurationSeconds,
            EstimateFluencyBand(wordCount, wordsPerMinute, coverageRatio),
            GetSpeakingPaceLabel(wordsPerMinute),
            GetSpeakingCoverageLabel(coverageRatio),
            transcript?.ConfidenceScore,
            audioRecord?.SpeechRatio,
            pauseStats?.PauseCount,
            pauseStats?.LongPauseCount,
            pauseStats?.TotalPauseSeconds,
            audioQuality?.Label,
            audioQuality?.Warnings,
            BuildWordTimestampDtos(transcript?.WordTimestampsData));
    }

    private static string NormalizePromptWord(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return Regex.Replace(value, "[^a-z']", string.Empty, RegexOptions.IgnoreCase).ToLowerInvariant();
    }

    private static int EstimatePromptDurationMs(string? text)
    {
        var wordCount = CountWords(text);
        if (wordCount == 0)
        {
            return 1800;
        }

        var durationMs = (wordCount / 145d) * 60_000d;
        return (int)Math.Round(Math.Clamp(durationMs, 1800d, 12_000d));
    }

    private static string MapPromptVisemeCode(string chunk)
    {
        var normalized = chunk.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "X";
        }

        if (Regex.IsMatch(normalized, "^(m|b|p)"))
        {
            return "B";
        }

        if (Regex.IsMatch(normalized, "^(f|v|ph)"))
        {
            return "G";
        }

        if (Regex.IsMatch(normalized, "^(th)"))
        {
            return "D";
        }

        if (Regex.IsMatch(normalized, "^(r|l|er|ir|ur)"))
        {
            return "E";
        }

        if (Regex.IsMatch(normalized, "^(oo|ou|ow|o|u|w)"))
        {
            return "F";
        }

        if (Regex.IsMatch(normalized, "^(ee|ea|ei|i|y|e)"))
        {
            return "C";
        }

        if (Regex.IsMatch(normalized, "^(a|ai|au)"))
        {
            return "A";
        }

        return "H";
    }

    private static IReadOnlyList<PracticeSessionSpeakingPromptCueDto> BuildSpeakingPromptVisemeTimeline(string? text, int? preferredDurationMs = null)
    {
        var words = (text ?? string.Empty)
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)
            .Select(NormalizePromptWord)
            .Where(word => !string.IsNullOrWhiteSpace(word))
            .ToList();

        var totalDurationMs = (int)Math.Round(Math.Clamp((double)(preferredDurationMs ?? EstimatePromptDurationMs(text)), 1200d, 15_000d));
        if (words.Count == 0)
        {
            return [new PracticeSessionSpeakingPromptCueDto("X", 0, totalDurationMs)];
        }

        var leadInMs = (int)Math.Round(Math.Min(180d, totalDurationMs * 0.08d));
        var tailOutMs = (int)Math.Round(Math.Min(160d, totalDurationMs * 0.06d));
        var gapMs = (int)Math.Clamp((int)Math.Round(totalDurationMs / (double)Math.Max(words.Count * 6, 24)), 20, 52);
        var totalGapMs = gapMs * Math.Max(0, words.Count - 1);
        var speechBodyMs = Math.Max(600, totalDurationMs - leadInMs - tailOutMs - totalGapMs);
        var totalWeight = words.Sum(word => Math.Max(1, word.Length));

        var cues = new List<PracticeSessionSpeakingPromptCueDto>();
        var cursor = 0;

        if (leadInMs > 0)
        {
            cues.Add(new PracticeSessionSpeakingPromptCueDto("X", 0, leadInMs));
            cursor = leadInMs;
        }

        for (var wordIndex = 0; wordIndex < words.Count; wordIndex++)
        {
            var word = words[wordIndex];
            var wordWeight = Math.Max(1, word.Length);
            var wordDurationMs = Math.Max(120, (int)Math.Round((speechBodyMs * wordWeight) / (double)totalWeight));
            var chunks = PromptVisemeChunkRegex.Matches(word).Select(match => match.Value).ToList();
            if (chunks.Count == 0)
            {
                chunks.Add(word);
            }

            var chunkDurationMs = Math.Max(70, (int)Math.Round(wordDurationMs / (double)Math.Max(1, chunks.Count)));

            for (var chunkIndex = 0; chunkIndex < chunks.Count; chunkIndex++)
            {
                var startMs = cursor;
                var endMs = Math.Min(totalDurationMs, startMs + chunkDurationMs);
                var adjustedEndMs = chunkIndex == chunks.Count - 1
                    ? Math.Max(endMs, startMs + (int)Math.Round(chunkDurationMs * 0.85d))
                    : endMs;

                cues.Add(new PracticeSessionSpeakingPromptCueDto(
                    MapPromptVisemeCode(chunks[chunkIndex]),
                    startMs,
                    adjustedEndMs));
                cursor = endMs;
            }

            if (wordIndex < words.Count - 1)
            {
                cues.Add(new PracticeSessionSpeakingPromptCueDto(
                    "X",
                    cursor,
                    Math.Min(totalDurationMs, cursor + gapMs)));
                cursor += gapMs;
            }
        }

        if (cursor < totalDurationMs)
        {
            cues.Add(new PracticeSessionSpeakingPromptCueDto("X", cursor, totalDurationMs));
        }

        var mergedCues = new List<PracticeSessionSpeakingPromptCueDto>();
        foreach (var cue in cues)
        {
            var adjustedCue = cue with { EndMs = Math.Max(cue.EndMs, cue.StartMs + 40) };
            if (mergedCues.Count > 0)
            {
                var previousCue = mergedCues[^1];
                if (previousCue.Code == adjustedCue.Code && previousCue.EndMs >= adjustedCue.StartMs)
                {
                    mergedCues[^1] = previousCue with { EndMs = Math.Max(previousCue.EndMs, adjustedCue.EndMs) };
                    continue;
                }
            }

            mergedCues.Add(adjustedCue);
        }

        return mergedCues;
    }

    private static PracticeSessionExamDto AttachSpeakingPromptMedia(PracticeSessionExamDto exam)
    {
        return exam with
        {
            Sections = exam.Sections
                .Select(section => section with
                {
                    SpeakingParts = section.SpeakingParts
                        .Select(part => part with
                        {
                            Questions = part.Questions
                                .Select(question =>
                                {
                                    var estimatedDurationMs = EstimatePromptDurationMs(question.Content);
                                    return question with
                                    {
                                        PromptEstimatedDurationMs = estimatedDurationMs,
                                        PromptVisemeTimeline = BuildSpeakingPromptVisemeTimeline(question.Content, estimatedDurationMs),
                                    };
                                })
                                .ToList()
                        })
                        .ToList()
                })
                .ToList()
        };
    }

    private static bool HasAnswerContent(PracticeSessionAnswerDto answer) =>
        !string.IsNullOrWhiteSpace(answer.AnswerText)
        || !string.IsNullOrWhiteSpace(answer.AudioUrl);

    private static string ToAlphaOptionLabel(int index) =>
        index >= 0 && index < 26 ? ((char)('A' + index)).ToString() : string.Empty;

    private static string ToRomanOptionLabel(int index) =>
        index >= 0 && index < RomanOptionLabels.Length ? RomanOptionLabels[index] : string.Empty;

    private static string NormalizeFlexibleAnswerText(string value)
    {
        var normalized = value
            .Replace("\r\n", " ", StringComparison.Ordinal)
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Replace('\u00A0', ' ')
            .Replace("\u200B", string.Empty, StringComparison.Ordinal)
            .Replace("\u200C", string.Empty, StringComparison.Ordinal)
            .Replace("\u200D", string.Empty, StringComparison.Ordinal)
            .Replace("\uFEFF", string.Empty, StringComparison.Ordinal)
            .Trim();

        normalized = Regex.Replace(normalized, @"[ \t]+", " ");
        normalized = normalized.Trim(' ', '.', ',', ';', ':', '"', '\'', '`');
        return normalized;
    }

    private static IEnumerable<string> ExpandHyphenAndSpacingVariants(string answer)
    {
        var candidate = NormalizeFlexibleAnswerText(answer);
        if (string.IsNullOrWhiteSpace(candidate))
        {
            yield break;
        }

        yield return candidate;

        if (!candidate.Contains('-', StringComparison.Ordinal))
        {
            yield break;
        }

        yield return NormalizeFlexibleAnswerText(candidate.Replace("-", " ", StringComparison.Ordinal));
        yield return NormalizeFlexibleAnswerText(candidate.Replace("-", string.Empty, StringComparison.Ordinal));
    }

    private static List<string> SplitFillBlankAlternatives(string answer) =>
        Regex.Split(answer, @"(?i)\s*(?:/|;|\bor\b)\s*")
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .Select(NormalizeFlexibleAnswerText)
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static List<string> BuildOptionalModifierVariants(string rawOptionalContent)
    {
        var tokens = Regex.Split(rawOptionalContent, @"\s*,\s*|\s+and\s+|\s*&\s*", RegexOptions.IgnoreCase)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(NormalizeFlexibleAnswerText)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .ToList();

        if (tokens.Count == 0)
        {
            return [string.Empty];
        }

        var variants = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { string.Empty };
        var combinationCount = 1 << tokens.Count;
        for (var mask = 1; mask < combinationCount; mask++)
        {
            var selected = new List<string>(tokens.Count);
            for (var index = 0; index < tokens.Count; index++)
            {
                if ((mask & (1 << index)) != 0)
                {
                    selected.Add(tokens[index]);
                }
            }

            if (selected.Count > 0)
            {
                variants.Add(string.Join(" ", selected));
            }
        }

        return variants.ToList();
    }

    private static IReadOnlyCollection<string> ExpandFlexibleFillBlankAcceptedAnswerCore(string rawAnswer)
    {
        var candidate = NormalizeFlexibleAnswerText(rawAnswer);
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return [];
        }

        var leadingOptionalMatch = Regex.Match(candidate, @"^\((?<optional>[^()]+)\)\s*(?<rest>.+)$");
        if (leadingOptionalMatch.Success)
        {
            var optionalVariants = BuildOptionalModifierVariants(leadingOptionalMatch.Groups["optional"].Value);
            var alternatives = SplitFillBlankAlternatives(leadingOptionalMatch.Groups["rest"].Value);
            if (alternatives.Count > 0)
            {
                var expanded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var alternative in alternatives)
                {
                    var cleanedAlternative = NormalizeFlexibleAnswerText(alternative);
                    if (string.IsNullOrWhiteSpace(cleanedAlternative))
                    {
                        continue;
                    }

                    foreach (var optionalVariant in optionalVariants)
                    {
                        expanded.Add(string.IsNullOrWhiteSpace(optionalVariant)
                            ? cleanedAlternative
                            : NormalizeFlexibleAnswerText($"{optionalVariant} {cleanedAlternative}"));
                    }
                }

                if (expanded.Count > 0)
                {
                    return expanded.ToList();
                }
            }
        }

        var splitAlternatives = SplitFillBlankAlternatives(candidate);
        if (splitAlternatives.Count > 1)
        {
            return splitAlternatives
                .SelectMany(ExpandFlexibleFillBlankAcceptedAnswerCore)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        return [candidate];
    }

    private static IReadOnlyCollection<string> ExpandFlexibleFillBlankAcceptedAnswers(string rawAnswer)
    {
        var variants = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var variant in ExpandFlexibleFillBlankAcceptedAnswerCore(rawAnswer))
        {
            foreach (var normalizedVariant in ExpandHyphenAndSpacingVariants(variant))
            {
                var cleaned = NormalizeFlexibleAnswerText(normalizedVariant);
                if (!string.IsNullOrWhiteSpace(cleaned))
                {
                    variants.Add(cleaned);
                }
            }
        }

        return variants;
    }

    private static HashSet<string> BuildFlexibleComparisonForms(string value)
    {
        var normalized = NormalizeFlexibleAnswerText(value).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var spacingNormalized = Regex.Replace(normalized, @"[-‐‑‒–—]+", " ");
        spacingNormalized = Regex.Replace(spacingNormalized, @"[.,;:()""'`]+", " ");
        spacingNormalized = Regex.Replace(spacingNormalized, @"\s+", " ").Trim();

        var forms = new HashSet<string>(StringComparer.Ordinal);
        if (!string.IsNullOrWhiteSpace(spacingNormalized))
        {
            forms.Add(spacingNormalized);
            forms.Add(Regex.Replace(spacingNormalized, @"\s+", string.Empty));
        }

        var alphanumericOnly = Regex.Replace(spacingNormalized, @"[^a-z0-9]+", string.Empty);
        if (!string.IsNullOrWhiteSpace(alphanumericOnly))
        {
            forms.Add(alphanumericOnly);
        }

        return forms;
    }

    private static HashSet<string> BuildDiscreteAnswerTokenSet(string answer) =>
        answer
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeFlexibleAnswerText)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => token.ToUpperInvariant())
            .ToHashSet(StringComparer.Ordinal);

    private static bool HasMultipleDiscreteTokens(string value) =>
        value.Contains('|', StringComparison.Ordinal);

    private static List<string> BuildNormalizedAnswerTokenList(string? answer) =>
        (answer ?? string.Empty)
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeFlexibleAnswerText)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => token.ToUpperInvariant())
            .ToList();

    private static int GetChooseNQuestionIndex(Question question)
    {
        var group = question.Group;
        if (group is null || !IsChooseNGroupType(group.GroupType) || group.Questions.Count <= 1)
        {
            return -1;
        }

        return group.Questions
            .OrderBy(item => item.QuestionNumber ?? int.MaxValue)
            .ThenBy(item => item.Id)
            .Select((item, index) => new { item.Id, index })
            .FirstOrDefault(item => item.Id == question.Id)
            ?.index ?? -1;
    }

    private static List<string> BuildChooseNQuestionCorrectTokens(Question question, IReadOnlyCollection<string>? groupCorrectTokens = null)
    {
        if (!IsChooseNGroupType(question.Group?.GroupType) && groupCorrectTokens is not { Count: > 0 })
        {
            return [];
        }

        var suppliedTokens = groupCorrectTokens is { Count: > 0 }
            ? groupCorrectTokens
                .Select(NormalizeFlexibleAnswerText)
                .Where(token => !string.IsNullOrWhiteSpace(token))
                .Select(token => token.ToUpperInvariant())
                .ToList()
            : [];

        if (suppliedTokens.Count == 1)
        {
            return suppliedTokens;
        }

        var questionTokens = BuildNormalizedAnswerTokenList(question.CorrectAnswer);
        var questionIndex = GetChooseNQuestionIndex(question);

        if (questionIndex >= 0 && questionTokens.Count > questionIndex && questionTokens.Count > 1)
        {
            return [questionTokens[questionIndex]];
        }

        if (questionTokens.Count == 1)
        {
            return questionTokens;
        }

        if (questionIndex >= 0 && suppliedTokens.Count > questionIndex)
        {
            return [suppliedTokens[questionIndex]];
        }

        if (suppliedTokens.Count > 0)
        {
            return suppliedTokens;
        }

        return questionTokens;
    }

    private static bool IsChooseNQuestionAnswerCorrect(
        string normalizedSubmitted,
        Question question,
        IReadOnlyCollection<string>? groupCorrectTokens = null)
    {
        var correctTokens = BuildChooseNQuestionCorrectTokens(question, groupCorrectTokens).ToHashSet(StringComparer.Ordinal);
        if (correctTokens.Count == 0)
        {
            return false;
        }

        var submittedTokens = BuildDiscreteAnswerTokenSet(normalizedSubmitted);
        return submittedTokens.Count > 0 && submittedTokens.SetEquals(correctTokens);
    }

    private static List<string> BuildAcceptedAnswers(string correctAnswer, string? groupType)
    {
        if (!IsFlexibleFillBlankGroupType(groupType))
        {
            return correctAnswer
                .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        var acceptedAnswers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var token in correctAnswer.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            foreach (var variant in ExpandFlexibleFillBlankAcceptedAnswers(token))
            {
                acceptedAnswers.Add(variant);
            }
        }

        return acceptedAnswers.ToList();
    }

    private static List<string> BuildAcceptedAnswersFromCorrectOptions(Question question)
    {
        var orderedOptions = question.QuestionOptions
            .OrderBy(option => option.OrderIndex ?? int.MaxValue)
            .ThenBy(option => option.Id)
            .ToList();

        var correctOptions = orderedOptions
            .Select((option, index) => new { option, index })
            .Where(item => item.option.IsCorrect)
            .ToList();

        if (correctOptions.Count == 0)
        {
            return [];
        }

        var acceptedAnswers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var groupType = question.Group?.GroupType;

        if (IsAlternativeSingleSelectionMatchingGroupType(groupType))
        {
            void AddAlternatives(IEnumerable<string> values)
            {
                foreach (var value in values)
                {
                    var token = NormalizeFlexibleAnswerText(value);
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        acceptedAnswers.Add(token);
                    }
                }
            }

            AddAlternatives(correctOptions.Select(item => item.option.OptionText ?? string.Empty));
            AddAlternatives(correctOptions.Select(item => ToAlphaOptionLabel(item.index)));
            AddAlternatives(correctOptions.Select(item => ToRomanOptionLabel(item.index)));

            return acceptedAnswers.ToList();
        }

        void AddJoined(IEnumerable<string> values)
        {
            var tokens = values
                .Select(NormalizeFlexibleAnswerText)
                .Where(token => !string.IsNullOrWhiteSpace(token))
                .ToList();

            if (tokens.Count == 0)
            {
                return;
            }

            acceptedAnswers.Add(string.Join("|", tokens));
            if (tokens.Count == 1)
            {
                acceptedAnswers.Add(tokens[0]);
            }
        }

        AddJoined(correctOptions.Select(item => item.option.OptionText ?? string.Empty));
        AddJoined(correctOptions.Select(item => ToAlphaOptionLabel(item.index)));
        AddJoined(correctOptions.Select(item => ToRomanOptionLabel(item.index)));

        return acceptedAnswers.ToList();
    }

    private static string? BuildCorrectAnswerDisplay(Question question, IReadOnlyCollection<string>? chooseNGroupCorrectTokens = null)
    {
        var resolvedChooseNQuestionCorrectTokens = BuildChooseNQuestionCorrectTokens(question, chooseNGroupCorrectTokens);
        if (resolvedChooseNQuestionCorrectTokens.Count > 0)
        {
            return string.Join("|", resolvedChooseNQuestionCorrectTokens);
        }

        if (!string.IsNullOrWhiteSpace(question.CorrectAnswer))
        {
            return question.CorrectAnswer;
        }

        var orderedOptions = question.QuestionOptions
            .OrderBy(option => option.OrderIndex ?? int.MaxValue)
            .ThenBy(option => option.Id)
            .Select((option, index) => new { option, index })
            .Where(item => item.option.IsCorrect)
            .ToList();

        if (orderedOptions.Count == 0)
        {
            return null;
        }

        var groupType = question.Group?.GroupType;
        if (groupType is "TFNG" or "YNNG")
        {
            return string.Join("|", orderedOptions.Select(item => item.option.OptionText));
        }

        return string.Join("|", orderedOptions.Select(item => ToAlphaOptionLabel(item.index)));
    }

    private static List<string> BuildAcceptedAnswers(Question question)
    {
        var groupType = question.Group?.GroupType;

        if (!string.IsNullOrWhiteSpace(question.CorrectAnswer))
        {
            var acceptedAnswers = new HashSet<string>(
                BuildAcceptedAnswers(question.CorrectAnswer, groupType),
                StringComparer.OrdinalIgnoreCase);

            if (IsFlexibleFillBlankGroupType(groupType) && question.QuestionOptions.Count > 0)
            {
                var orderedOptions = question.QuestionOptions
                    .OrderBy(option => option.OrderIndex ?? int.MaxValue)
                    .ThenBy(option => option.Id)
                    .ToList();
                var answerTokens = question.CorrectAnswer
                    .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(NormalizeFlexibleAnswerText)
                    .Where(token => !string.IsNullOrWhiteSpace(token))
                    .ToList();

                foreach (var token in answerTokens)
                {
                    for (var index = 0; index < orderedOptions.Count; index += 1)
                    {
                        var matchesOptionLabel =
                            string.Equals(token, ToAlphaOptionLabel(index), StringComparison.OrdinalIgnoreCase)
                            || string.Equals(token, ToRomanOptionLabel(index), StringComparison.OrdinalIgnoreCase);

                        if (!matchesOptionLabel)
                        {
                            continue;
                        }

                        foreach (var optionTextVariant in ExpandFlexibleFillBlankAcceptedAnswers(orderedOptions[index].OptionText ?? string.Empty))
                        {
                            acceptedAnswers.Add(optionTextVariant);
                        }
                    }
                }
            }

            return acceptedAnswers.ToList();
        }

        return BuildAcceptedAnswersFromCorrectOptions(question);
    }

    private static bool IsAnswerCorrect(
        string? submittedAnswer,
        Question question,
        IReadOnlyCollection<string>? chooseNGroupCorrectTokens = null)
    {
        var normalizedSubmitted = submittedAnswer?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedSubmitted))
        {
            return false;
        }

        if (IsChooseNQuestionAnswerCorrect(normalizedSubmitted, question, chooseNGroupCorrectTokens))
        {
            return true;
        }

        var groupType = question.Group?.GroupType;
        var acceptedAnswers = BuildAcceptedAnswers(question);
        if (acceptedAnswers.Count == 0)
        {
            return false;
        }

        if (IsAlternativeSingleSelectionMatchingGroupType(groupType))
        {
            var submittedToken = NormalizeFlexibleAnswerText(normalizedSubmitted).ToUpperInvariant();
            return acceptedAnswers
                .SelectMany(answer => BuildDiscreteAnswerTokenSet(answer))
                .Contains(submittedToken, StringComparer.Ordinal);
        }

        if (IsFlexibleFillBlankGroupType(groupType))
        {
            var submittedForms = BuildFlexibleComparisonForms(normalizedSubmitted);
            return acceptedAnswers.Any(answer =>
                submittedForms.Overlaps(BuildFlexibleComparisonForms(answer)));
        }

        var fallbackSubmittedForms = BuildFlexibleComparisonForms(normalizedSubmitted);
        if (fallbackSubmittedForms.Count > 0
            && acceptedAnswers.Any(answer => fallbackSubmittedForms.Overlaps(BuildFlexibleComparisonForms(answer))))
        {
            return true;
        }

        if (HasMultipleDiscreteTokens(normalizedSubmitted) || acceptedAnswers.Any(HasMultipleDiscreteTokens))
        {
            var submittedTokens = BuildDiscreteAnswerTokenSet(normalizedSubmitted);
            return acceptedAnswers.Any(answer =>
                submittedTokens.SetEquals(BuildDiscreteAnswerTokenSet(answer)));
        }

        return acceptedAnswers.Any(answer =>
            string.Equals(normalizedSubmitted, answer, StringComparison.OrdinalIgnoreCase));
    }

}
