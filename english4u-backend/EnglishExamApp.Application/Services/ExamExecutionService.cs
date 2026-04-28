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

public sealed class ExamExecutionService(
    IApplicationDbContext context,
    IAiIntegrationService aiIntegrationService,
    ISpeakingMediaStorageService speakingMediaStorageService,
    ILogger<ExamExecutionService> logger) : IExamExecutionService
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

    private static bool IsFlexibleFillBlankGroupType(string? groupType) =>
        groupType is "SENTENCE_COMPLETION" or "SUMMARY_COMPLETION" or "TABLE_COMPLETION" or "FLOWCHART_COMPLETION" or "SHORT_ANSWER" or "SHORT_ANSWER_QUESTIONS";

    private static bool IsAlternativeSingleSelectionMatchingGroupType(string? groupType)
    {
        var normalized = (groupType ?? string.Empty).Trim().ToUpperInvariant();
        return normalized is "MATCHING_INFO" or "MATCHING_INFORMATION" or "MATCHING_FEATURES" or "MATCHING_CLASSIFICATION" or "MATCHING_OPINION";
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

    private static string? BuildCorrectAnswerDisplay(Question question)
    {
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
            return BuildAcceptedAnswers(question.CorrectAnswer, groupType);
        }

        return BuildAcceptedAnswersFromCorrectOptions(question);
    }

    private static bool IsAnswerCorrect(string? submittedAnswer, Question question)
    {
        var normalizedSubmitted = submittedAnswer?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedSubmitted))
        {
            return false;
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

        if (HasMultipleDiscreteTokens(normalizedSubmitted) || acceptedAnswers.Any(HasMultipleDiscreteTokens))
        {
            var submittedTokens = BuildDiscreteAnswerTokenSet(normalizedSubmitted);
            return acceptedAnswers.Any(answer =>
                submittedTokens.SetEquals(BuildDiscreteAnswerTokenSet(answer)));
        }

        return acceptedAnswers.Any(answer =>
            string.Equals(normalizedSubmitted, answer, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<Guid> StartSessionAsync(Guid userId, Guid examId, CancellationToken cancellationToken = default)
    {
        var session = await StartPracticeSessionAsync(userId, examId, cancellationToken: cancellationToken);
        return session.SessionId;
    }

    public async Task AutoSaveAnswerAsync(AutoSaveAnswerDto dto, CancellationToken cancellationToken = default)
    {
        var existingAnswer = await context.UserAnswers
            .FirstOrDefaultAsync(
                answer => answer.SessionId == dto.SessionId && answer.QuestionId == dto.QuestionId,
                cancellationToken);

        var normalizedAnswer = string.IsNullOrWhiteSpace(dto.AnswerText) ? null : dto.AnswerText.Trim();
        if (existingAnswer is not null)
        {
            existingAnswer.AnswerText = normalizedAnswer;
            existingAnswer.ScoreEarned = 0;
            existingAnswer.SubmittedAt = DateTime.UtcNow;
        }
        else
        {
            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = dto.SessionId,
                QuestionId = dto.QuestionId,
                AnswerText = normalizedAnswer,
                SubmittedAt = DateTime.UtcNow
            });
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<SubmitExamResultDto> SubmitExamAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .Include(item => item.Exam)
            .Include(item => item.ScoringResults)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.Group)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.QuestionOptions)
            .FirstOrDefaultAsync(item => item.Id == sessionId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (IsFinalizedStatus(session.Status))
        {
            throw new InvalidOperationException("Session already submitted.");
        }

        var result = await GradeSessionAsync(session, cancellationToken);

        return new SubmitExamResultDto(
            sessionId,
            result.ReadingScore ?? 0,
            result.ListeningScore ?? 0,
            result.TotalAutoScore,
            false,
            false,
            result.Status,
            result.TotalBandScore);
    }

    public async Task<PracticeSessionStartDto> StartPracticeSessionAsync(
        Guid userId,
        Guid examId,
        bool forceNewAttempt = false,
        CancellationToken cancellationToken = default)
    {
        var exam = await context.Exams
            .AsNoTracking()
            .Where(item => item.Id == examId && item.IsPublished)
            .Select(item => new
            {
                item.Id,
                item.DurationMinutes,
                SkillType = item.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault()
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("Practice exam not found.");

        var existingSession = await context.ExamSessions
            .Where(item => item.UserId == userId && item.ExamId == examId)
            .OrderByDescending(item => item.StartedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (existingSession is not null && NormalizeSessionStatus(existingSession.Status) == "InProgress" && !forceNewAttempt)
        {
            return new PracticeSessionStartDto(
                existingSession.Id,
                existingSession.ExamId,
                NormalizeSkillType(exam.SkillType),
                "InProgress",
                existingSession.TimeRemaining,
                true);
        }

        if (forceNewAttempt)
        {
            var inProgressSessions = await context.ExamSessions
                .Where(item => item.UserId == userId && item.ExamId == examId && item.Status == "InProgress")
                .ToListAsync(cancellationToken);

            foreach (var inProgressSession in inProgressSessions)
            {
                inProgressSession.Status = "Abandoned";
                inProgressSession.EndedAt ??= DateTime.UtcNow;
            }
        }

        var session = new ExamSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ExamId = exam.Id,
            Status = "InProgress",
            StartedAt = DateTime.UtcNow,
            TimeRemaining = exam.DurationMinutes.HasValue
                ? exam.DurationMinutes.Value * 60
                : null
        };

        context.ExamSessions.Add(session);
        await context.SaveChangesAsync(cancellationToken);

        return new PracticeSessionStartDto(
            session.Id,
            session.ExamId,
            NormalizeSkillType(exam.SkillType),
            "InProgress",
            session.TimeRemaining,
            false);
    }

    public async Task<PracticeSessionDto?> GetPracticeSessionAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var header = await GetSessionHeaderAsync(sessionId, cancellationToken);
        if (header is null || header.UserId != userId)
        {
            return null;
        }

        var normalizedStatus = NormalizeSessionStatus(header.Status);
        var exam = await BuildPracticeSessionExamAsync(
            header.ExamId,
            requirePublished: false,
            includeCorrectAnswers: normalizedStatus == "Completed",
            cancellationToken);
        if (exam is null)
        {
            return null;
        }
        exam = AttachSpeakingPromptMedia(exam);

        var answers = await GetSessionAnswersAsync(
            sessionId,
            includeCorrectness: normalizedStatus == "Completed",
            cancellationToken);
        if (normalizedStatus == "Completed")
        {
            answers = await IncludeUnansweredObjectiveReviewAnswersAsync(header.ExamId, answers, cancellationToken);
        }
        var blueprints = FlattenObjectiveQuestions(exam);
        var writingTaskCount = CountWritingTasks(exam);
        var speakingQuestionCount = CountSpeakingQuestions(exam);
        var totalItems = blueprints.Count > 0
            ? blueprints.Count
            : writingTaskCount > 0
                ? writingTaskCount
                : speakingQuestionCount;
        PracticeSessionResultDto? result = blueprints.Count > 0
            ? await BuildPracticeSessionResultAsync(sessionId, header.ExamId, header.Status, blueprints, answers, cancellationToken)
            : writingTaskCount > 0
                ? await BuildWritingSessionResultAsync(sessionId, header.ExamId, header.Status, writingTaskCount, cancellationToken)
                : speakingQuestionCount > 0
                    ? await BuildSpeakingSessionResultAsync(sessionId, header.ExamId, header.Status, speakingQuestionCount, cancellationToken)
                    : null;
        var answerMap = answers
            .Where(answer => answer.QuestionId != Guid.Empty)
            .ToDictionary(answer => answer.QuestionId, answer => answer.AnswerText);

        return new PracticeSessionDto(
            header.SessionId,
            header.ExamId,
            header.ExamTitle,
            header.ExamDescription,
            header.ExamType,
            NormalizeSkillType(header.SkillType),
            NormalizeSessionStatus(header.Status),
            header.StartedAt,
            header.EndedAt,
            header.DurationMinutes,
            header.TimeRemaining,
            totalItems,
            CountAnsweredQuestions(answers),
            blueprints.Count > 0 ? ComputeResumeQuestionNumber(blueprints, answerMap) : null,
            exam,
            answers,
            result);
    }

    public async Task<IReadOnlyList<PracticeSessionListItemDto>> GetPracticeSessionsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var sessions = await context.ExamSessions
            .AsNoTracking()
            .Where(item => item.UserId == userId)
            .OrderByDescending(item => item.StartedAt)
            .Select(item => new
            {
                item.Id,
                item.ExamId,
                ExamTitle = item.Exam.Title,
                item.Exam.ExamType,
                SkillType = item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault(),
                item.Status,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                TotalQuestions =
                    item.Exam.ExamSections
                        .SelectMany(section => section.ReadingPassages)
                        .SelectMany(passage => passage.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.ListeningParts)
                        .SelectMany(part => part.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.WritingTasks)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.SpeakingParts)
                        .SelectMany(part => part.SpeakingQuestions)
                        .Count(),
                AnsweredQuestions = item.UserAnswers
                    .Count(answer =>
                        (answer.QuestionId != null || answer.WritingTaskId != null || answer.SpeakingQuestionId != null)
                        && ((answer.AnswerText != null && answer.AnswerText != "")
                            || answer.UserAudioRecords.Any())),
                ResumeQuestionNumber = item.UserAnswers
                    .Where(answer => answer.QuestionId != null && answer.AnswerText != null && answer.AnswerText != "")
                    .Select(answer => answer.Question!.QuestionNumber)
                    .OrderByDescending(questionNumber => questionNumber)
                    .FirstOrDefault(),
                ReadingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ReadingScore)
                    .FirstOrDefault(),
                ListeningScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ListeningScore)
                    .FirstOrDefault(),
                TotalAutoScore = item.UserAnswers
                    .Where(answer => answer.QuestionId != null)
                    .Sum(answer => (double?)answer.ScoreEarned) ?? 0,
                WritingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.WritingScore)
                    .FirstOrDefault(),
                SpeakingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.SpeakingScore)
                    .FirstOrDefault(),
                TotalBandScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        return sessions
            .Select(item => new PracticeSessionListItemDto(
                item.Id,
                item.ExamId,
                item.ExamTitle,
                item.ExamType,
                NormalizeSkillType(item.SkillType),
                NormalizeSessionStatus(item.Status),
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                item.TotalQuestions,
                item.AnsweredQuestions,
                item.ResumeQuestionNumber,
                item.ReadingScore,
                item.ListeningScore,
                item.TotalAutoScore,
                item.WritingScore,
                item.SpeakingScore,
                item.TotalBandScore))
            .ToList();
    }

    public async Task UpdatePracticeSessionAnswersAsync(
        Guid userId,
        Guid sessionId,
        UpdatePracticeSessionAnswersDto dto,
        CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (NormalizeSessionStatus(session.Status) != "InProgress")
        {
            throw new InvalidOperationException("Session is no longer accepting answers.");
        }

        if (dto.TimeRemaining.HasValue)
        {
            session.TimeRemaining = Math.Max(0, dto.TimeRemaining.Value);
        }

        var inputs = (dto.Answers ?? [])
            .Where(item => item.QuestionId.HasValue && item.QuestionId.Value != Guid.Empty)
            .GroupBy(item => item.QuestionId!.Value)
            .Select(group => group.Last())
            .ToList();
        var writingInputs = (dto.Answers ?? [])
            .Where(item => item.WritingTaskId.HasValue && item.WritingTaskId.Value != Guid.Empty)
            .GroupBy(item => item.WritingTaskId!.Value)
            .Select(group => group.Last())
            .ToList();
        var speakingInputs = (dto.Answers ?? [])
            .Where(item => item.SpeakingQuestionId.HasValue && item.SpeakingQuestionId.Value != Guid.Empty)
            .GroupBy(item => item.SpeakingQuestionId!.Value)
            .Select(group => group.Last())
            .ToList();

        if (inputs.Count == 0 && writingInputs.Count == 0 && speakingInputs.Count == 0)
        {
            await context.SaveChangesAsync(cancellationToken);
            return;
        }

        var questionIds = inputs.Select(item => item.QuestionId!.Value).ToList();
        var validQuestionIds = await context.Questions
            .AsNoTracking()
            .Where(question =>
                questionIds.Contains(question.Id)
                && ((question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == session.ExamId)
                    || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == session.ExamId)))
            .Select(question => question.Id)
            .ToHashSetAsync(cancellationToken);

        var writingTaskIds = writingInputs.Select(item => item.WritingTaskId!.Value).ToList();
        var validWritingTaskIds = await context.WritingTasks
            .AsNoTracking()
            .Where(task => writingTaskIds.Contains(task.Id) && task.Section.ExamId == session.ExamId)
            .Select(task => task.Id)
            .ToHashSetAsync(cancellationToken);

        var speakingQuestionIds = speakingInputs.Select(item => item.SpeakingQuestionId!.Value).ToList();
        var validSpeakingQuestionIds = await context.SpeakingQuestions
            .AsNoTracking()
            .Where(question => speakingQuestionIds.Contains(question.Id) && question.Part.Section.ExamId == session.ExamId)
            .Select(question => question.Id)
            .ToHashSetAsync(cancellationToken);

        if (validQuestionIds.Count == 0 && validWritingTaskIds.Count == 0 && validSpeakingQuestionIds.Count == 0)
        {
            await context.SaveChangesAsync(cancellationToken);
            return;
        }

        var existingAnswers = await context.UserAnswers
            .Where(answer => answer.SessionId == sessionId && answer.QuestionId != null && validQuestionIds.Contains(answer.QuestionId.Value))
            .ToDictionaryAsync(answer => answer.QuestionId!.Value, cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var input in inputs.Where(item => item.QuestionId.HasValue && validQuestionIds.Contains(item.QuestionId.Value)))
        {
            var normalizedAnswer = string.IsNullOrWhiteSpace(input.AnswerText) ? null : input.AnswerText.Trim();
            var questionId = input.QuestionId!.Value;
            if (existingAnswers.TryGetValue(questionId, out var existingAnswer))
            {
                existingAnswer.AnswerText = normalizedAnswer;
                existingAnswer.ScoreEarned = 0;
                existingAnswer.SubmittedAt = now;
                continue;
            }

            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                QuestionId = questionId,
                AnswerText = normalizedAnswer,
                ScoreEarned = 0,
                SubmittedAt = now
            });
        }

        var existingWritingAnswers = await context.UserAnswers
            .Where(answer => answer.SessionId == sessionId && answer.WritingTaskId != null && validWritingTaskIds.Contains(answer.WritingTaskId.Value))
            .ToDictionaryAsync(answer => answer.WritingTaskId!.Value, cancellationToken);

        foreach (var input in writingInputs.Where(item => item.WritingTaskId.HasValue && validWritingTaskIds.Contains(item.WritingTaskId.Value)))
        {
            var normalizedAnswer = string.IsNullOrWhiteSpace(input.AnswerText) ? null : input.AnswerText.Trim();
            var writingTaskId = input.WritingTaskId!.Value;
            if (existingWritingAnswers.TryGetValue(writingTaskId, out var existingAnswer))
            {
                existingAnswer.AnswerText = normalizedAnswer;
                existingAnswer.ScoreEarned = 0;
                existingAnswer.SubmittedAt = now;
                continue;
            }

            context.UserAnswers.Add(new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                WritingTaskId = writingTaskId,
                AnswerText = normalizedAnswer,
                ScoreEarned = 0,
                SubmittedAt = now
            });
        }

        var existingSpeakingAnswers = await context.UserAnswers
            .Where(answer => answer.SessionId == sessionId && answer.SpeakingQuestionId != null && validSpeakingQuestionIds.Contains(answer.SpeakingQuestionId.Value))
            .Include(answer => answer.UserAudioRecords)
            .ToDictionaryAsync(answer => answer.SpeakingQuestionId!.Value, cancellationToken);

        foreach (var input in speakingInputs.Where(item => item.SpeakingQuestionId.HasValue && validSpeakingQuestionIds.Contains(item.SpeakingQuestionId.Value)))
        {
            var normalizedAnswer = string.IsNullOrWhiteSpace(input.AnswerText) ? null : input.AnswerText.Trim();
            var speakingQuestionId = input.SpeakingQuestionId!.Value;
            var normalizedAudioUrl = string.IsNullOrWhiteSpace(input.AudioUrl) ? null : input.AudioUrl.Trim();
            var fileSizeKb = input.FileSizeKB;

            if (!existingSpeakingAnswers.TryGetValue(speakingQuestionId, out var existingAnswer))
            {
                existingAnswer = new UserAnswer
                {
                    Id = Guid.NewGuid(),
                    SessionId = sessionId,
                    SpeakingQuestionId = speakingQuestionId,
                    AnswerText = normalizedAnswer,
                    ScoreEarned = 0,
                    SubmittedAt = now
                };
                context.UserAnswers.Add(existingAnswer);
                existingSpeakingAnswers[speakingQuestionId] = existingAnswer;
            }
            else
            {
                existingAnswer.AnswerText = normalizedAnswer;
                existingAnswer.ScoreEarned = 0;
                existingAnswer.SubmittedAt = now;
            }

            if (string.IsNullOrWhiteSpace(normalizedAudioUrl))
            {
                continue;
            }

            var audioRecord = existingAnswer.UserAudioRecords
                .OrderByDescending(record => record.DurationSeconds ?? 0)
                .ThenByDescending(record => record.Id)
                .FirstOrDefault();

            if (audioRecord is null)
            {
                audioRecord = new UserAudioRecord
                {
                    Id = Guid.NewGuid(),
                    AnswerId = existingAnswer.Id,
                };
                existingAnswer.UserAudioRecords.Add(audioRecord);
                context.UserAudioRecords.Add(audioRecord);
            }

            audioRecord.AudioUrl = normalizedAudioUrl;
            audioRecord.DurationSeconds = input.DurationSeconds;
            audioRecord.FileSizeKB = fileSizeKb;
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<PracticeSessionSpeakingUploadResultDto> UploadSpeakingRecordingAsync(
        Guid userId,
        Guid sessionId,
        UploadPracticeSpeakingRecordingDto dto,
        Stream audioStream,
        string originalFileName,
        CancellationToken cancellationToken = default)
    {
        if (dto.SpeakingQuestionId == Guid.Empty)
        {
            throw new InvalidOperationException("SpeakingQuestionId is required.");
        }

        var session = await context.ExamSessions
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.UserAudioRecords)
                    .ThenInclude(record => record.SpeechTranscripts)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (NormalizeSessionStatus(session.Status) != "InProgress")
        {
            throw new InvalidOperationException("Session is no longer accepting speaking recordings.");
        }

        var speakingQuestion = await context.SpeakingQuestions
            .AsNoTracking()
            .Include(question => question.Part)
            .FirstOrDefaultAsync(
                question => question.Id == dto.SpeakingQuestionId && question.Part.Section.ExamId == session.ExamId,
                cancellationToken)
            ?? throw new InvalidOperationException("Speaking question not found in this session.");

        var storedMedia = await speakingMediaStorageService.SaveAsync(
            sessionId,
            dto.SpeakingQuestionId,
            originalFileName,
            audioStream,
            cancellationToken);

        var normalizedAnswer = string.IsNullOrWhiteSpace(dto.AnswerText) ? null : dto.AnswerText.Trim();
        var answer = session.UserAnswers
            .FirstOrDefault(item => item.SpeakingQuestionId == dto.SpeakingQuestionId);

        if (answer is null)
        {
            answer = new UserAnswer
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                SpeakingQuestionId = dto.SpeakingQuestionId,
                AnswerText = normalizedAnswer,
                ScoreEarned = 0,
                SubmittedAt = DateTime.UtcNow,
            };
            context.UserAnswers.Add(answer);
            session.UserAnswers.Add(answer);
        }
        else
        {
            answer.AnswerText = normalizedAnswer;
            answer.ScoreEarned = 0;
            answer.SubmittedAt = DateTime.UtcNow;
        }

        var audioRecord = answer.UserAudioRecords
            .OrderByDescending(item => item.Id)
            .FirstOrDefault();

        if (audioRecord is null)
        {
            audioRecord = new UserAudioRecord
            {
                Id = Guid.NewGuid(),
                AnswerId = answer.Id,
            };
            answer.UserAudioRecords.Add(audioRecord);
            context.UserAudioRecords.Add(audioRecord);
        }

        audioRecord.AudioUrl = storedMedia.AudioUrl;
        audioRecord.DurationSeconds = dto.DurationSeconds;
        audioRecord.FileSizeKB = storedMedia.FileSizeKB;

        if (audioRecord.SpeechTranscripts.Count > 0)
        {
            context.SpeechTranscripts.RemoveRange(audioRecord.SpeechTranscripts);
            audioRecord.SpeechTranscripts.Clear();
        }

        string? transcriptText = null;
        var transcriptSegmentCount = 0;

        try
        {
            var transcript = await aiIntegrationService.GenerateListeningTranscriptAsync(
                new GenerateListeningTranscriptRequestDto(storedMedia.AudioUrl, "en"),
                cancellationToken);
            transcriptText = string.IsNullOrWhiteSpace(transcript.TranscriptText) ? null : transcript.TranscriptText.Trim();
            transcriptSegmentCount = transcript.SegmentCount;

            if (!string.IsNullOrWhiteSpace(transcriptText))
            {
                var speechTranscript = new SpeechTranscript
                {
                    Id = Guid.NewGuid(),
                    AudioRecordId = audioRecord.Id,
                    TranscriptText = transcriptText,
                };
                audioRecord.SpeechTranscripts.Add(speechTranscript);
                context.SpeechTranscripts.Add(speechTranscript);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Failed to generate speaking transcript for session {SessionId}, question {SpeakingQuestionId}.",
                sessionId,
                dto.SpeakingQuestionId);
        }

        var speakingAnalytics = BuildSpeakingAnalytics(
            transcriptText,
            normalizedAnswer,
            dto.DurationSeconds,
            speakingQuestion.Part.PartNumber,
            !string.IsNullOrWhiteSpace(speakingQuestion.CueCardPoints));

        await context.SaveChangesAsync(cancellationToken);

        return new PracticeSessionSpeakingUploadResultDto(
            speakingQuestion.Id,
            storedMedia.AudioUrl,
            storedMedia.FileSizeKB,
            dto.DurationSeconds,
            transcriptText,
            transcriptSegmentCount,
            normalizedAnswer,
            speakingAnalytics);
    }

    public async Task<PracticeSessionResultDto> SubmitReadingListeningAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .Include(item => item.Exam)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.Group)
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.Question)
                    .ThenInclude(question => question!.QuestionOptions)
            .Include(item => item.ScoringResults)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        if (IsFinalizedStatus(session.Status))
        {
            var blueprints = await GetObjectiveQuestionBlueprintsAsync(session.ExamId, cancellationToken);
            var answers = await GetSessionAnswersAsync(sessionId, includeCorrectness: true, cancellationToken);
            return await BuildPracticeSessionResultAsync(sessionId, session.ExamId, session.Status, blueprints, answers, cancellationToken)
                ?? new PracticeSessionResultDto(sessionId, 0, 0, 0, 0, blueprints.Count, CountAnsweredQuestions(answers), 0, 0, NormalizeSessionStatus(session.Status));
        }

        var result = await GradeSessionAsync(session, cancellationToken);
        return result;
    }

    public async Task<PracticeSessionResultDto> SubmitWritingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .Include(item => item.UserAnswers)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        var writingTasks = await context.WritingTasks
            .AsNoTracking()
            .Where(task => task.Section.ExamId == session.ExamId)
            .OrderBy(task => task.TaskNumber)
            .Select(task => new { task.Id, task.TaskNumber })
            .ToListAsync(cancellationToken);

        if (writingTasks.Count == 0)
        {
            throw new InvalidOperationException("Session này không có Writing Task.");
        }

        if (NormalizeSessionStatus(session.Status) == "Completed")
        {
            return await BuildWritingSessionResultAsync(sessionId, session.ExamId, session.Status, writingTasks.Count, cancellationToken);
        }

        var answersByTaskId = session.UserAnswers
            .Where(answer => answer.WritingTaskId != null)
            .ToDictionary(answer => answer.WritingTaskId!.Value);

        var invalidTaskNumbers = writingTasks
            .Where(task =>
                !answersByTaskId.TryGetValue(task.Id, out var answer)
                || CountWords(answer.AnswerText) < WritingSubmitMinWords)
            .Select(task => task.TaskNumber?.ToString() ?? task.Id.ToString())
            .ToList();

        if (invalidTaskNumbers.Count > 0)
        {
            throw new InvalidOperationException($"Mỗi Writing Task cần tối thiểu {WritingSubmitMinWords} từ trước khi nộp. Task chưa đạt: {string.Join(", ", invalidTaskNumbers)}.");
        }

        if (NormalizeSessionStatus(session.Status) != "Submitted")
        {
            session.Status = "Submitted";
            session.EndedAt = DateTime.UtcNow;
            session.TimeRemaining = Math.Max(0, session.TimeRemaining ?? 0);
            await context.SaveChangesAsync(cancellationToken);
        }

        try
        {
            await aiIntegrationService.ScoreWritingAsync(sessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Writing AI scoring failed for session {SessionId}. Submission was saved.", sessionId);
            throw new InvalidOperationException($"Bài Writing đã được lưu nhưng chấm AI thất bại: {ex.Message}");
        }

        var result = await BuildWritingSessionResultAsync(sessionId, session.ExamId, session.Status, writingTasks.Count, cancellationToken);
        return await AttachRewardIfCompletedAsync(session, result, cancellationToken);
    }

    public async Task<PracticeSessionResultDto> SubmitSpeakingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .Include(item => item.UserAnswers)
                .ThenInclude(answer => answer.UserAudioRecords)
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        var speakingQuestionCount = await context.SpeakingQuestions
            .AsNoTracking()
            .Where(question => question.Part.Section.ExamId == session.ExamId)
            .CountAsync(cancellationToken);

        if (speakingQuestionCount == 0)
        {
            throw new InvalidOperationException("Session này không có Speaking prompt.");
        }

        if (NormalizeSessionStatus(session.Status) == "Completed")
        {
            return await BuildSpeakingSessionResultAsync(sessionId, session.ExamId, session.Status, speakingQuestionCount, cancellationToken);
        }

        if (NormalizeSessionStatus(session.Status) != "Submitted")
        {
            session.Status = "Submitted";
            session.EndedAt = DateTime.UtcNow;
            session.TimeRemaining = Math.Max(0, session.TimeRemaining ?? 0);
            await context.SaveChangesAsync(cancellationToken);
        }

        try
        {
            await aiIntegrationService.ScoreSpeakingAsync(sessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Speaking AI scoring failed for session {SessionId}. Submission was saved.", sessionId);
            throw new InvalidOperationException($"Bài Speaking đã được lưu nhưng chấm AI thất bại: {ex.Message}");
        }

        if (NormalizeSessionStatus(session.Status) == "Submitted")
        {
            session.Status = "Completed";
            await context.SaveChangesAsync(cancellationToken);
        }

        var result = await BuildSpeakingSessionResultAsync(sessionId, session.ExamId, session.Status, speakingQuestionCount, cancellationToken);
        return await AttachRewardIfCompletedAsync(session, result, cancellationToken);
    }

    public async Task<PracticeSessionResultDto> RescoreSpeakingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var session = await context.ExamSessions
            .FirstOrDefaultAsync(item => item.Id == sessionId && item.UserId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Session not found.");

        var speakingQuestionCount = await context.SpeakingQuestions
            .AsNoTracking()
            .Where(question => question.Part.Section.ExamId == session.ExamId)
            .CountAsync(cancellationToken);

        if (speakingQuestionCount == 0)
        {
            throw new InvalidOperationException("Session này không có Speaking prompt.");
        }

        if (NormalizeSessionStatus(session.Status) == "InProgress")
        {
            throw new InvalidOperationException("Cần nộp Speaking trước khi chấm lại.");
        }

        try
        {
            await aiIntegrationService.ScoreSpeakingAsync(sessionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Speaking AI rescoring failed for session {SessionId}.", sessionId);
            throw new InvalidOperationException($"Chấm lại Speaking thất bại: {ex.Message}");
        }

        if (NormalizeSessionStatus(session.Status) == "Submitted")
        {
            session.Status = "Completed";
            await context.SaveChangesAsync(cancellationToken);
        }

        return await BuildSpeakingSessionResultAsync(sessionId, session.ExamId, session.Status, speakingQuestionCount, cancellationToken);
    }

    private async Task<PracticeSessionResultDto> BuildWritingSessionResultAsync(
        Guid sessionId,
        Guid examId,
        string? status,
        int writingTaskCount,
        CancellationToken cancellationToken)
    {
        var submittedAnswerCount = await context.UserAnswers
            .AsNoTracking()
            .CountAsync(
                answer => answer.SessionId == sessionId
                    && answer.WritingTaskId != null
                    && !string.IsNullOrWhiteSpace(answer.AnswerText),
                cancellationToken);

        var scoringResult = await context.ScoringResults
            .AsNoTracking()
            .Where(result => result.SessionId == sessionId)
            .OrderByDescending(result => result.ScoredAt)
            .FirstOrDefaultAsync(cancellationToken);

        var sessionStatus = await context.ExamSessions
            .AsNoTracking()
            .Where(session => session.Id == sessionId)
            .Select(session => session.Status)
            .FirstOrDefaultAsync(cancellationToken);

        return new PracticeSessionResultDto(
            sessionId,
            null,
            null,
            0,
            0,
            writingTaskCount,
            submittedAnswerCount,
            0,
            0,
            NormalizeSessionStatus(sessionStatus ?? status),
            WritingScore: scoringResult?.WritingScore,
            OverallFeedback: scoringResult?.OverallFeedback,
            TotalBandScore: scoringResult?.TotalBandScore);
    }

    private async Task<PracticeSessionResultDto> BuildSpeakingSessionResultAsync(
        Guid sessionId,
        Guid examId,
        string? status,
        int speakingQuestionCount,
        CancellationToken cancellationToken)
    {
        var speakingAnswers = await GetSessionAnswersAsync(sessionId, includeCorrectness: false, cancellationToken);
        var filteredSpeakingAnswers = speakingAnswers
            .Where(answer => answer.SpeakingQuestionId.HasValue)
            .ToList();

        var scoringResult = await context.ScoringResults
            .AsNoTracking()
            .Where(result => result.SessionId == sessionId)
            .OrderByDescending(result => result.ScoredAt)
            .FirstOrDefaultAsync(cancellationToken);

        var sessionStatus = await context.ExamSessions
            .AsNoTracking()
            .Where(currentSession => currentSession.Id == sessionId)
            .Select(currentSession => currentSession.Status)
            .FirstOrDefaultAsync(cancellationToken);

        return new PracticeSessionResultDto(
            sessionId,
            null,
            null,
            0,
            0,
            speakingQuestionCount,
            CountAnsweredQuestions(filteredSpeakingAnswers),
            0,
            0,
            NormalizeSessionStatus(sessionStatus ?? status),
            OverallFeedback: scoringResult?.OverallFeedback,
            SpeakingScore: scoringResult?.SpeakingScore,
            TotalBandScore: scoringResult?.TotalBandScore);
    }

    public async Task<IReadOnlyList<AdminAttemptListItemDto>> GetAdminAttemptsAsync(
        AdminAttemptQueryDto query,
        CancellationToken cancellationToken = default)
    {
        var attemptsQuery = context.ExamSessions
            .AsNoTracking()
            .Select(item => new
            {
                item.Id,
                item.ExamId,
                item.UserId,
                ExamTitle = item.Exam.Title,
                item.Exam.ExamType,
                SkillType = item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault(),
                UserDisplayName = item.User.DisplayName ?? item.User.Email,
                UserEmail = item.User.Email,
                item.Status,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                TotalQuestions =
                    item.Exam.ExamSections
                        .SelectMany(section => section.ReadingPassages)
                        .SelectMany(passage => passage.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.ListeningParts)
                        .SelectMany(part => part.QuestionGroups)
                        .SelectMany(group => group.Questions)
                        .Count()
                    + item.Exam.ExamSections
                        .SelectMany(section => section.WritingTasks)
                        .Count(),
                AnsweredQuestions = item.UserAnswers
                    .Count(answer => (answer.QuestionId != null || answer.WritingTaskId != null) && answer.AnswerText != null && answer.AnswerText != ""),
                ResumeQuestionNumber = item.UserAnswers
                    .Where(answer => answer.QuestionId != null && answer.AnswerText != null && answer.AnswerText != "")
                    .Select(answer => answer.Question!.QuestionNumber)
                    .OrderByDescending(questionNumber => questionNumber)
                    .FirstOrDefault(),
                ReadingScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ReadingScore)
                    .FirstOrDefault(),
                ListeningScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.ListeningScore)
                    .FirstOrDefault(),
                TotalAutoScore = item.UserAnswers
                    .Where(answer => answer.QuestionId != null)
                    .Sum(answer => (double?)answer.ScoreEarned) ?? 0,
                TotalBandScore = item.ScoringResults
                    .OrderByDescending(result => result.ScoredAt)
                    .Select(result => result.TotalBandScore)
                    .FirstOrDefault()
            })
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLowerInvariant();
            attemptsQuery = attemptsQuery.Where(item =>
                item.ExamTitle.ToLower().Contains(search)
                || item.UserDisplayName.ToLower().Contains(search)
                || item.UserEmail.ToLower().Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var normalizedStatus = query.Status.Trim();
            attemptsQuery = normalizedStatus switch
            {
                "Completed" => attemptsQuery.Where(item => item.Status == "Completed" || item.Status == "Scored"),
                "NotStarted" => attemptsQuery.Where(_ => false),
                _ => attemptsQuery.Where(item => item.Status == normalizedStatus),
            };
        }

        var attempts = await attemptsQuery
            .OrderByDescending(item => item.StartedAt)
            .ToListAsync(cancellationToken);

        return attempts
            .Select(item => new AdminAttemptListItemDto(
                item.Id,
                item.ExamId,
                item.UserId,
                item.ExamTitle,
                item.ExamType,
                NormalizeSkillType(item.SkillType),
                item.UserDisplayName,
                item.UserEmail,
                NormalizeSessionStatus(item.Status),
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                item.TotalQuestions,
                item.AnsweredQuestions,
                item.ResumeQuestionNumber,
                item.ReadingScore,
                item.ListeningScore,
                item.TotalAutoScore,
                item.TotalBandScore))
            .ToList();
    }

    public async Task<AdminAttemptDetailDto?> GetAdminAttemptDetailAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        var header = await GetSessionHeaderAsync(sessionId, cancellationToken);
        if (header is null)
        {
            return null;
        }

        var answers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.QuestionId != null)
            .Include(item => item.Question)
                .ThenInclude(question => question!.Group)
            .Include(item => item.Question)
                .ThenInclude(question => question!.QuestionOptions)
            .OrderBy(item => item.Question!.QuestionNumber)
            .ToListAsync(cancellationToken);

        var blueprints = await GetObjectiveQuestionBlueprintsAsync(header.ExamId, cancellationToken);
        var answerDtos = answers
            .Where(item => item.Question is not null)
            .Select(item => new AdminAttemptAnswerDto(
                item.QuestionId!.Value,
                item.Question!.QuestionNumber,
                item.Question.Group?.GroupType,
                item.Question.Content,
                item.AnswerText,
                item.ScoreEarned,
                NormalizeSessionStatus(header.Status) == "Completed"
                    ? IsAnswerCorrect(item.AnswerText, item.Question)
                    : null))
            .ToList();

        var practiceAnswers = answerDtos
            .Select(item => new PracticeSessionAnswerDto(
                item.QuestionId,
                null,
                item.QuestionNumber,
                null,
                item.GroupType,
                item.SubmittedAnswer,
                null,
                item.ScoreEarned,
                item.IsCorrect))
            .ToList();

        var result = await BuildPracticeSessionResultAsync(
            sessionId,
            header.ExamId,
            header.Status,
            blueprints,
            practiceAnswers,
            cancellationToken);

        var answerMap = practiceAnswers.ToDictionary(item => item.QuestionId, item => item.AnswerText);

        return new AdminAttemptDetailDto(
            header.SessionId,
            header.ExamId,
            header.UserId,
            header.ExamTitle,
            header.ExamType,
            NormalizeSkillType(header.SkillType),
            await GetUserDisplayNameAsync(header.UserId, cancellationToken),
            await GetUserEmailAsync(header.UserId, cancellationToken),
            NormalizeSessionStatus(header.Status),
            header.StartedAt,
            header.EndedAt,
            header.TimeRemaining,
            blueprints.Count,
            CountAnsweredQuestions(practiceAnswers),
            ComputeResumeQuestionNumber(blueprints, answerMap),
            result,
            answerDtos);
    }

    private async Task<PracticeSessionResultDto> GradeSessionAsync(ExamSession session, CancellationToken cancellationToken)
    {
        var normalizedStatus = NormalizeSessionStatus(session.Status);
        if (normalizedStatus == "Completed")
        {
            throw new InvalidOperationException("Session already submitted.");
        }

        session.Status = "Submitted";
        session.EndedAt = DateTime.UtcNow;

        var objectiveQuestions = await context.Questions
            .AsNoTracking()
            .Where(question =>
                (question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == session.ExamId)
                || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == session.ExamId))
            .OrderBy(question => question.QuestionNumber)
            .Select(question => new ObjectiveQuestionBlueprint(
                question.Id,
                question.QuestionNumber,
                question.Points,
                question.Group.GroupType,
                question.Group.PassageId != null ? "READING" : "LISTENING"))
            .ToListAsync(cancellationToken);

        var answersByQuestionId = session.UserAnswers
            .Where(answer => answer.QuestionId != null && answer.Question is not null)
            .ToDictionary(answer => answer.QuestionId!.Value);

        double readingRawScore = 0;
        double listeningRawScore = 0;
        var correctQuestions = 0;

        foreach (var answer in answersByQuestionId.Values)
        {
            if (answer.Question is null)
            {
                continue;
            }

            var isCorrect = IsAnswerCorrect(answer.AnswerText, answer.Question);
            answer.ScoreEarned = isCorrect ? answer.Question.Points : 0;

            if (isCorrect)
            {
                correctQuestions += 1;
            }

            if (answer.Question.Group?.PassageId != null)
            {
                readingRawScore += answer.ScoreEarned;
            }
            else if (answer.Question.Group?.ListeningPartId != null)
            {
                listeningRawScore += answer.ScoreEarned;
            }
        }

        var scoringResult = session.ScoringResults
            .OrderByDescending(item => item.ScoredAt)
            .FirstOrDefault();

        if (scoringResult is null)
        {
            scoringResult = new ScoringResult
            {
                Id = Guid.NewGuid(),
                SessionId = session.Id,
            };
            context.ScoringResults.Add(scoringResult);
        }

        var readingMaxScore = CalculateMaxScore(objectiveQuestions, "READING");
        var listeningMaxScore = CalculateMaxScore(objectiveQuestions, "LISTENING");
        var isGeneralTrainingReading = IsGeneralTrainingReadingExam(
            session.Exam.ExamType,
            session.Exam.Title,
            session.Exam.Description);

        scoringResult.ReadingScore = IeltsScoringCalculator.CalculateReadingBand(
            readingRawScore,
            readingMaxScore,
            isGeneralTrainingReading);
        scoringResult.ListeningScore = IeltsScoringCalculator.CalculateListeningBand(
            listeningRawScore,
            listeningMaxScore);
        scoringResult.TotalBandScore = IeltsScoringCalculator.CalculateOverallBand(
            scoringResult.ReadingScore,
            scoringResult.ListeningScore,
            scoringResult.WritingScore,
            scoringResult.SpeakingScore);
        scoringResult.ScoredAt = DateTime.UtcNow;

        session.Status = "Completed";
        await context.SaveChangesAsync(cancellationToken);

        var answerDtos = answersByQuestionId.Values
            .Where(answer => answer.QuestionId != null)
            .Select(answer => new PracticeSessionAnswerDto(
                answer.QuestionId!.Value,
                null,
                answer.Question?.QuestionNumber,
                null,
                answer.Question?.Group?.GroupType,
                answer.AnswerText,
                answer.Question is not null ? BuildCorrectAnswerDisplay(answer.Question) : null,
                answer.ScoreEarned,
                answer.Question is not null ? IsAnswerCorrect(answer.AnswerText, answer.Question) : null))
            .OrderBy(answer => answer.QuestionNumber)
            .ToList();

        var result = await BuildPracticeSessionResultAsync(
            session.Id,
            session.ExamId,
            session.Status,
            objectiveQuestions,
            answerDtos,
            cancellationToken);

        if (result is null)
        {
            result = new PracticeSessionResultDto(
                session.Id,
                scoringResult.ReadingScore,
                scoringResult.ListeningScore,
                readingRawScore + listeningRawScore,
                objectiveQuestions.Sum(item => item.Points),
                objectiveQuestions.Count,
                CountAnsweredQuestions(answerDtos),
                correctQuestions,
                objectiveQuestions.Count == 0 ? 0 : Math.Round(correctQuestions * 100d / objectiveQuestions.Count, 1),
                NormalizeSessionStatus(session.Status),
                TotalBandScore: scoringResult.TotalBandScore);
        }

        return await AttachRewardIfCompletedAsync(session, result, cancellationToken);
    }

    private async Task<SessionHeader?> GetSessionHeaderAsync(Guid sessionId, CancellationToken cancellationToken)
    {
        return await context.ExamSessions
            .AsNoTracking()
            .Where(item => item.Id == sessionId)
            .Select(item => new SessionHeader(
                item.Id,
                item.UserId,
                item.ExamId,
                item.Exam.Title,
                item.Exam.Description,
                item.Exam.ExamType,
                item.Exam.DurationMinutes,
                item.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault() ?? string.Empty,
                item.Status ?? string.Empty,
                item.StartedAt,
                item.EndedAt,
                item.TimeRemaining,
                item.Exam.IsPublished))
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<string> GetUserDisplayNameAsync(Guid userId, CancellationToken cancellationToken)
    {
        var profile = await context.Users
            .AsNoTracking()
            .Where(item => item.Id == userId)
            .Select(item => new { item.DisplayName, item.Email })
            .FirstAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(profile.DisplayName) ? profile.Email : profile.DisplayName!;
    }

    private async Task<string> GetUserEmailAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await context.Users
            .AsNoTracking()
            .Where(item => item.Id == userId)
            .Select(item => item.Email)
            .FirstAsync(cancellationToken);
    }

    private async Task<PracticeSessionExamDto?> BuildPracticeSessionExamAsync(
        Guid examId,
        bool requirePublished,
        bool includeCorrectAnswers,
        CancellationToken cancellationToken)
    {
        return await context.Exams
            .AsNoTracking()
            .AsSplitQuery()
            .Where(item => item.Id == examId && (!requirePublished || item.IsPublished))
            .Select(item => new PracticeSessionExamDto(
                item.Id,
                item.Title,
                item.Description,
                item.DurationMinutes,
                item.ExamType,
                item.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => new PracticeSessionSectionDto(
                        section.Id,
                        section.SkillType,
                        section.Title,
                        section.OrderIndex,
                        section.ReadingPassages
                            .OrderBy(passage => passage.PassageNumber)
                            .Select(passage => new PracticeSessionReadingPassageDto(
                                passage.Id,
                                passage.PassageNumber,
                                passage.Title,
                                passage.ParagraphsData,
                                passage.AssetsData,
                                passage.QuestionGroups
                                    .OrderBy(group => group.StartQuestion ?? (group.Questions.Any() ? group.Questions.Min(question => question.QuestionNumber) : 0))
                                    .Select(group => new PracticeSessionQuestionGroupDto(
                                        group.Id,
                                        group.GroupType,
                                        group.Instruction,
                                        group.ContentData,
                                        group.AssetsData,
                                        group.StartQuestion,
                                        group.EndQuestion,
                                        group.Questions
                                            .OrderBy(question => question.QuestionNumber)
                                            .Select(question => new PracticeSessionQuestionDto(
                                                question.Id,
                                                question.QuestionNumber,
                                                question.Content,
                                                question.Points,
                                                includeCorrectAnswers ? BuildCorrectAnswerDisplay(question) : null,
                                                question.QuestionOptions
                                                    .OrderBy(option => option.OrderIndex)
                                                    .Select(option => new PracticeSessionOptionDto(
                                                        option.Id,
                                                        option.OptionText,
                                                        option.ImageUrl,
                                                        option.OrderIndex))
                                                    .ToList()))
                                            .ToList()))
                                    .ToList()))
                            .ToList(),
                        section.ListeningParts
                            .OrderBy(part => part.PartNumber)
                            .Select(part => new PracticeSessionListeningPartDto(
                                part.Id,
                                part.PartNumber,
                                part.AudioUrl,
                                part.ContextDescription,
                                part.TranscriptData,
                                part.QuestionGroups
                                    .OrderBy(group => group.StartQuestion ?? (group.Questions.Any() ? group.Questions.Min(question => question.QuestionNumber) : 0))
                                    .Select(group => new PracticeSessionQuestionGroupDto(
                                        group.Id,
                                        group.GroupType,
                                        group.Instruction,
                                        group.ContentData,
                                        group.AssetsData,
                                        group.StartQuestion,
                                        group.EndQuestion,
                                        group.Questions
                                            .OrderBy(question => question.QuestionNumber)
                                            .Select(question => new PracticeSessionQuestionDto(
                                                question.Id,
                                                question.QuestionNumber,
                                                question.Content,
                                                question.Points,
                                                includeCorrectAnswers ? BuildCorrectAnswerDisplay(question) : null,
                                                question.QuestionOptions
                                                    .OrderBy(option => option.OrderIndex)
                                                    .Select(option => new PracticeSessionOptionDto(
                                                        option.Id,
                                                        option.OptionText,
                                                        option.ImageUrl,
                                                        option.OrderIndex))
                                                    .ToList()))
                                            .ToList()))
                                    .ToList()))
                            .ToList(),
                        section.WritingTasks
                            .OrderBy(task => task.TaskNumber)
                            .Select(task => new PracticeSessionWritingTaskDto(
                                task.Id,
                                task.TaskNumber,
                                task.PromptText,
                                task.AssetsData,
                                task.MinWords))
                            .ToList(),
                        section.SpeakingParts
                            .OrderBy(part => part.PartNumber)
                            .Select(part => new PracticeSessionSpeakingPartDto(
                                part.Id,
                                part.PartNumber,
                                part.Description,
                                part.SpeakingQuestions
                                    .OrderBy(question => question.OrderIndex)
                                    .Select(question => new PracticeSessionSpeakingQuestionDto(
                                        question.Id,
                                        question.Content,
                                        question.CueCardPoints,
                                        question.AudioPromptUrl,
                                        question.OrderIndex,
                                        null,
                                        null))
                                    .ToList()))
                            .ToList()))
                    .ToList()))
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static List<ObjectiveQuestionBlueprint> FlattenObjectiveQuestions(PracticeSessionExamDto exam)
    {
        return exam.Sections
            .SelectMany(section =>
            {
                var readingQuestions = section.ReadingPassages
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions.Select(question => new ObjectiveQuestionBlueprint(
                        question.Id,
                        question.QuestionNumber,
                        question.Points,
                        group.GroupType,
                        "READING")));

                var listeningQuestions = section.ListeningParts
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions.Select(question => new ObjectiveQuestionBlueprint(
                        question.Id,
                        question.QuestionNumber,
                        question.Points,
                        group.GroupType,
                        "LISTENING")));

                return readingQuestions.Concat(listeningQuestions);
            })
            .OrderBy(question => question.QuestionNumber)
            .ThenBy(question => question.QuestionId)
            .ToList();
    }

    private static int CountWritingTasks(PracticeSessionExamDto exam) =>
        exam.Sections.SelectMany(section => section.WritingTasks).Count();

    private static int CountSpeakingQuestions(PracticeSessionExamDto exam) =>
        exam.Sections.SelectMany(section => section.SpeakingParts).SelectMany(part => part.Questions).Count();

    private async Task<List<ObjectiveQuestionBlueprint>> GetObjectiveQuestionBlueprintsAsync(Guid examId, CancellationToken cancellationToken)
    {
        return await context.Questions
            .AsNoTracking()
            .Where(question =>
                (question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == examId)
                || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == examId))
            .OrderBy(question => question.QuestionNumber)
            .Select(question => new ObjectiveQuestionBlueprint(
                question.Id,
                question.QuestionNumber,
                question.Points,
                question.Group.GroupType,
                question.Group.PassageId != null ? "READING" : "LISTENING"))
            .ToListAsync(cancellationToken);
    }

    private async Task<List<PracticeSessionAnswerDto>> GetSessionAnswersAsync(
        Guid sessionId,
        bool includeCorrectness,
        CancellationToken cancellationToken)
    {
        var answers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.QuestionId != null)
            .Include(item => item.Question)
                .ThenInclude(question => question!.Group)
            .Include(item => item.Question)
                .ThenInclude(question => question!.QuestionOptions)
            .OrderBy(item => item.Question!.QuestionNumber)
            .ToListAsync(cancellationToken);

        var objectiveAnswers = answers
            .Where(item => item.Question is not null)
            .Select(item => new PracticeSessionAnswerDto(
                item.QuestionId!.Value,
                null,
                item.Question!.QuestionNumber,
                null,
                item.Question.Group?.GroupType,
                item.AnswerText,
                includeCorrectness ? BuildCorrectAnswerDisplay(item.Question) : null,
                item.ScoreEarned,
                includeCorrectness
                    ? IsAnswerCorrect(item.AnswerText, item.Question)
                    : null))
            .ToList();

        var writingAnswers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.WritingTaskId != null)
            .Include(item => item.WritingTask)
            .Include(item => item.AiFeedbacks)
                .ThenInclude(feedback => feedback.Rubric)
            .OrderBy(item => item.WritingTask!.TaskNumber)
            .ToListAsync(cancellationToken);

        var writingAnswerDtos = writingAnswers
            .Select(item => new PracticeSessionAnswerDto(
                Guid.Empty,
                item.WritingTaskId,
                null,
                item.WritingTask!.TaskNumber,
                "WRITING_TASK",
                item.AnswerText,
                null,
                item.ScoreEarned,
                null,
                item.AiFeedbacks
                    .OrderBy(feedback => feedback.Rubric.CriteriaName)
                    .Select(feedback => new PracticeSessionFeedbackDto(
                        feedback.Rubric.CriteriaName ?? string.Empty,
                        feedback.BandScore,
                        feedback.AiComment,
                        feedback.Improvements,
                        feedback.ConfidenceScore,
                        DeserializeFeedbackEvidence(feedback.EvidenceData)))
                    .ToList()))
            .ToList();

        var speakingAnswers = await context.UserAnswers
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId && item.SpeakingQuestionId != null)
            .Include(item => item.SpeakingQuestion)
                .ThenInclude(question => question!.Part)
            .Include(item => item.UserAudioRecords)
                .ThenInclude(record => record.SpeechTranscripts)
            .Include(item => item.AiFeedbacks)
                .ThenInclude(feedback => feedback.Rubric)
            .OrderBy(item => item.SpeakingQuestion!.Part.PartNumber)
            .ThenBy(item => item.SpeakingQuestion!.OrderIndex)
            .ToListAsync(cancellationToken);

        var speakingAnswerDtos = speakingAnswers
            .Select(item =>
            {
                var audioRecord = item.UserAudioRecords
                    .OrderByDescending(record => record.DurationSeconds ?? 0)
                    .ThenByDescending(record => record.Id)
                    .FirstOrDefault();
                var speechTranscript = audioRecord?.SpeechTranscripts
                    .OrderByDescending(transcript => transcript.Id)
                    .FirstOrDefault(transcript => !string.IsNullOrWhiteSpace(transcript.TranscriptText))
                    ?? audioRecord?.SpeechTranscripts
                        .OrderByDescending(transcript => transcript.Id)
                        .FirstOrDefault();
                var transcriptText = speechTranscript?.TranscriptText;
                var speakingAnalytics = BuildSpeakingAnalytics(
                    transcriptText,
                    item.AnswerText,
                    audioRecord?.DurationSeconds,
                    item.SpeakingQuestion?.Part.PartNumber,
                    !string.IsNullOrWhiteSpace(item.SpeakingQuestion?.CueCardPoints),
                    speechTranscript,
                    audioRecord);

                return new PracticeSessionAnswerDto(
                    Guid.Empty,
                    null,
                    null,
                    null,
                    "SPEAKING_PROMPT",
                    item.AnswerText,
                    null,
                    item.ScoreEarned,
                    null,
                    item.AiFeedbacks
                        .OrderBy(feedback => feedback.Rubric.CriteriaName)
                        .Select(feedback => new PracticeSessionFeedbackDto(
                            feedback.Rubric.CriteriaName ?? string.Empty,
                            feedback.BandScore,
                            feedback.AiComment,
                            feedback.Improvements,
                            feedback.ConfidenceScore,
                            DeserializeFeedbackEvidence(feedback.EvidenceData)))
                        .ToList(),
                    item.SpeakingQuestionId,
                    item.SpeakingQuestion?.OrderIndex,
                    item.SpeakingQuestion?.Part.PartNumber,
                    audioRecord?.AudioUrl,
                    audioRecord?.DurationSeconds,
                    transcriptText,
                    speakingAnalytics);
            })
            .ToList();

        return objectiveAnswers.Concat(writingAnswerDtos).Concat(speakingAnswerDtos).ToList();
    }

    private async Task<List<PracticeSessionAnswerDto>> IncludeUnansweredObjectiveReviewAnswersAsync(
        Guid examId,
        List<PracticeSessionAnswerDto> answers,
        CancellationToken cancellationToken)
    {
        var existingQuestionIds = answers
            .Where(answer => answer.QuestionId != Guid.Empty)
            .Select(answer => answer.QuestionId)
            .ToHashSet();

        var unansweredQuestions = await context.Questions
            .AsNoTracking()
            .Where(question =>
                ((question.Group.PassageId != null && question.Group.Passage!.Section.ExamId == examId)
                    || (question.Group.ListeningPartId != null && question.Group.ListeningPart!.Section.ExamId == examId))
                && !existingQuestionIds.Contains(question.Id))
            .Include(question => question.Group)
            .Include(question => question.QuestionOptions)
            .OrderBy(question => question.QuestionNumber)
            .ToListAsync(cancellationToken);

        if (unansweredQuestions.Count == 0)
        {
            return answers;
        }

        var unansweredAnswerDtos = unansweredQuestions
            .Select(question => new PracticeSessionAnswerDto(
                question.Id,
                null,
                question.QuestionNumber,
                null,
                question.Group?.GroupType,
                null,
                BuildCorrectAnswerDisplay(question),
                0,
                false))
            .ToList();

        return answers
            .Concat(unansweredAnswerDtos)
            .OrderBy(answer => answer.QuestionNumber ?? int.MaxValue)
            .ToList();
    }

    private async Task<ExamScoringProfile?> GetExamScoringProfileAsync(Guid examId, CancellationToken cancellationToken) =>
        await context.Exams
            .AsNoTracking()
            .Where(exam => exam.Id == examId)
            .Select(exam => new ExamScoringProfile(exam.ExamType, exam.Title, exam.Description))
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<PracticeSessionResultDto?> BuildPracticeSessionResultAsync(
        Guid sessionId,
        Guid examId,
        string? status,
        IReadOnlyList<ObjectiveQuestionBlueprint> blueprints,
        IReadOnlyList<PracticeSessionAnswerDto> answers,
        CancellationToken cancellationToken)
    {
        var scoringResult = await context.ScoringResults
            .AsNoTracking()
            .Where(item => item.SessionId == sessionId)
            .OrderByDescending(item => item.ScoredAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (scoringResult is null && answers.Count == 0)
        {
            return null;
        }

        var answeredQuestions = CountAnsweredQuestions(answers);
        var correctQuestions = answers.Count(answer => answer.IsCorrect == true);
        var totalQuestions = blueprints.Count;
        var maxAutoScore = blueprints.Sum(item => item.Points);
        var readingRawScore = CalculateRawScore(answers, blueprints, "READING");
        var listeningRawScore = CalculateRawScore(answers, blueprints, "LISTENING");
        var totalAutoScore = readingRawScore + listeningRawScore;
        var readingMaxScore = CalculateMaxScore(blueprints, "READING");
        var listeningMaxScore = CalculateMaxScore(blueprints, "LISTENING");
        var shouldCalculateBands = scoringResult is not null || NormalizeSessionStatus(status) == "Completed";
        var profile = shouldCalculateBands
            ? await GetExamScoringProfileAsync(examId, cancellationToken)
            : null;
        var readingBandScore = scoringResult?.ReadingScore
            ?? (shouldCalculateBands
                ? IeltsScoringCalculator.CalculateReadingBand(
                    readingRawScore,
                    readingMaxScore,
                    IsGeneralTrainingReadingExam(profile))
                : null);
        var listeningBandScore = scoringResult?.ListeningScore
            ?? (shouldCalculateBands
                ? IeltsScoringCalculator.CalculateListeningBand(listeningRawScore, listeningMaxScore)
                : null);
        var totalBandScore = scoringResult?.TotalBandScore
            ?? (shouldCalculateBands
                ? IeltsScoringCalculator.CalculateOverallBand(
                    readingBandScore,
                    listeningBandScore,
                    scoringResult?.WritingScore,
                    scoringResult?.SpeakingScore)
                : null);

        return new PracticeSessionResultDto(
            sessionId,
            readingBandScore,
            listeningBandScore,
            totalAutoScore,
            maxAutoScore,
            totalQuestions,
            answeredQuestions,
            correctQuestions,
            totalQuestions == 0 ? 0 : Math.Round(correctQuestions * 100d / totalQuestions, 1),
            NormalizeSessionStatus(status),
            scoringResult?.WritingScore,
            scoringResult?.OverallFeedback,
            scoringResult?.SpeakingScore,
            totalBandScore);
    }

    private static int CountAnsweredQuestions(IReadOnlyList<PracticeSessionAnswerDto> answers) =>
        answers.Count(HasAnswerContent);

    private async Task<PracticeSessionResultDto> AttachRewardIfCompletedAsync(
        ExamSession session,
        PracticeSessionResultDto result,
        CancellationToken cancellationToken)
    {
        if (NormalizeSessionStatus(result.Status) != "Completed")
        {
            return result;
        }

        var reward = await ApplyRewardAsync(session, result, cancellationToken);
        return result with { Reward = reward };
    }

    private async Task<PracticeSessionRewardDto> ApplyRewardAsync(
        ExamSession session,
        PracticeSessionResultDto result,
        CancellationToken cancellationToken)
    {
        var user = await context.Users
            .FirstOrDefaultAsync(item => item.Id == session.UserId, cancellationToken)
            ?? throw new InvalidOperationException("User not found.");

        var previousProgress = UserGamificationCalculator.BuildProgress(user.ExperiencePoints);
        var hasPriorCompletedAttempt = await context.ExamSessions
            .AsNoTracking()
            .AnyAsync(
                item =>
                    item.Id != session.Id
                    && item.UserId == session.UserId
                    && item.ExamId == session.ExamId
                    && (item.Status == "Completed" || item.Status == "Scored"),
                cancellationToken);

        var experienceAwarded = hasPriorCompletedAttempt
            ? 0
            : UserGamificationCalculator.CalculateExperienceReward(result.TotalBandScore, result.AccuracyPercent);

        if (experienceAwarded > 0)
        {
            user.ExperiencePoints += experienceAwarded;
        }

        UpdateDailyStreak(user, DateTime.UtcNow);
        user.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);

        var currentProgress = UserGamificationCalculator.BuildProgress(user.ExperiencePoints);
        return new PracticeSessionRewardDto(
            experienceAwarded,
            !hasPriorCompletedAttempt,
            currentProgress.CurrentLevel > previousProgress.CurrentLevel,
            currentProgress.ExperiencePoints,
            currentProgress.CurrentLevel,
            currentProgress.CurrentLevelStartExperience,
            currentProgress.NextLevelExperience,
            currentProgress.ExperienceToNextLevel,
            currentProgress.LevelProgressPercent,
            user.DailyStreakCount,
            user.LongestStreakCount);
    }

    private static void UpdateDailyStreak(User user, DateTime activityAtUtc)
    {
        var activityDate = VietnamDateTimeFormatter.ToVietnamDate(activityAtUtc);
        var lastActivityDate = VietnamDateTimeFormatter.ToVietnamDate(user.LastActivityAt);

        if (lastActivityDate == activityDate)
        {
            user.DailyStreakCount = Math.Max(1, user.DailyStreakCount);
        }
        else if (lastActivityDate.HasValue && lastActivityDate.Value.AddDays(1) == activityDate)
        {
            user.DailyStreakCount = Math.Max(1, user.DailyStreakCount) + 1;
        }
        else
        {
            user.DailyStreakCount = 1;
        }

        user.LongestStreakCount = Math.Max(user.LongestStreakCount, user.DailyStreakCount);
        user.LastActivityAt = activityAtUtc;
    }

    private static int? ComputeResumeQuestionNumber(
        IReadOnlyList<ObjectiveQuestionBlueprint> blueprints,
        IReadOnlyDictionary<Guid, string?> answerMap)
    {
        foreach (var question in blueprints)
        {
            if (!answerMap.TryGetValue(question.QuestionId, out var answerText) || string.IsNullOrWhiteSpace(answerText))
            {
                return question.QuestionNumber;
            }
        }

        return blueprints.LastOrDefault()?.QuestionNumber;
    }
}
