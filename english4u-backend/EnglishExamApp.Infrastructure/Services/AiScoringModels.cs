using System.Text.Json.Serialization;

namespace EnglishExamApp.Infrastructure.Services;

public sealed record AiScoreWritingRequest(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("answer_id")] string AnswerId,
    [property: JsonPropertyName("essay_text")] string EssayText,
    [property: JsonPropertyName("question_prompt")] string? QuestionPrompt,
    [property: JsonPropertyName("skill_type")] string SkillType = "Writing");

public sealed record AiScoreSpeakingForm(
    string SessionId,
    string AnswerId,
    string? QuestionPrompt);

public sealed record AiScoreSpeakingSessionRequest(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("answers")] IReadOnlyList<AiScoreSpeakingSessionAnswer> Answers);

public sealed record AiScoreSpeakingSessionAnswer(
    [property: JsonPropertyName("answer_id")] string AnswerId,
    [property: JsonPropertyName("question_prompt")] string? QuestionPrompt,
    [property: JsonPropertyName("transcript_text")] string? TranscriptText,
    [property: JsonPropertyName("part_number")] int? PartNumber,
    [property: JsonPropertyName("prompt_type")] string? PromptType,
    [property: JsonPropertyName("duration_seconds")] double? DurationSeconds,
    [property: JsonPropertyName("target_duration_seconds")] int? TargetDurationSeconds,
    [property: JsonPropertyName("rubrics")] IReadOnlyList<AiRubricScore> Rubrics,
    [property: JsonPropertyName("no_response")] bool NoResponse);

public sealed record AiScoreResponse(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("answer_id")] string AnswerId,
    [property: JsonPropertyName("overall_band")] double OverallBand,
    [property: JsonPropertyName("rubrics")] List<AiRubricScore> Rubrics,
    [property: JsonPropertyName("overall_feedback")] string? OverallFeedback = null,
    [property: JsonPropertyName("detailed_corrections")] List<AiWritingCorrection>? DetailedCorrections = null,
    [property: JsonPropertyName("transcript_text")] string? TranscriptText = null,
    [property: JsonPropertyName("speaking_evidence")] AiSpeakingEvidence? SpeakingEvidence = null);

public sealed record AiRubricScore(
    [property: JsonPropertyName("criteria")] string Criteria,
    [property: JsonPropertyName("band")] double Band,
    [property: JsonPropertyName("comment")] string Comment,
    [property: JsonPropertyName("improvements")] string Improvements,
    [property: JsonPropertyName("confidence")] double? Confidence = null,
    [property: JsonPropertyName("evidence")] IReadOnlyList<string>? Evidence = null);

public sealed record AiSpeakingEvidence(
    [property: JsonPropertyName("evidence_version")] string? EvidenceVersion,
    [property: JsonPropertyName("pronunciation_engine")] string? PronunciationEngine,
    [property: JsonPropertyName("has_word_timing")] bool HasWordTiming,
    [property: JsonPropertyName("has_phoneme_alignment")] bool HasPhonemeAlignment,
    [property: JsonPropertyName("audio_quality")] AiSpeakingAudioQuality? AudioQuality,
    [property: JsonPropertyName("asr_confidence")] double? AsrConfidence,
    [property: JsonPropertyName("pronunciation_analysis")] AiSpeakingPronunciationAnalysis? PronunciationAnalysis,
    [property: JsonPropertyName("speech_ratio")] double? SpeechRatio,
    [property: JsonPropertyName("pause_stats")] AiSpeakingPauseStats? PauseStats,
    [property: JsonPropertyName("word_timestamps")] IReadOnlyList<AiSpeakingWordTimestamp>? WordTimestamps,
    [property: JsonPropertyName("low_confidence_words")] IReadOnlyList<AiSpeakingWordTimestamp>? LowConfidenceWords,
    [property: JsonPropertyName("scoring_notes")] IReadOnlyList<string>? ScoringNotes);

public sealed record AiSpeakingAudioQuality(
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

public sealed record AiSpeakingPauseStats(
    [property: JsonPropertyName("pause_count")] int PauseCount,
    [property: JsonPropertyName("long_pause_count")] int LongPauseCount,
    [property: JsonPropertyName("total_pause_seconds")] double TotalPauseSeconds,
    [property: JsonPropertyName("average_pause_seconds")] double? AveragePauseSeconds,
    [property: JsonPropertyName("longest_pause_seconds")] double? LongestPauseSeconds);

public sealed record AiSpeakingWordTimestamp(
    [property: JsonPropertyName("word")] string Word,
    [property: JsonPropertyName("start")] double? Start,
    [property: JsonPropertyName("end")] double? End,
    [property: JsonPropertyName("probability")] double? Probability);

public sealed record AiSpeakingPronunciationAnalysis(
    [property: JsonPropertyName("engine")] string? Engine,
    [property: JsonPropertyName("has_word_timing")] bool HasWordTiming,
    [property: JsonPropertyName("has_phoneme_alignment")] bool HasPhonemeAlignment,
    [property: JsonPropertyName("has_pitch_analysis")] bool HasPitchAnalysis,
    [property: JsonPropertyName("has_actual_phone_recognition")] bool HasActualPhoneRecognition,
    [property: JsonPropertyName("actual_phone_source")] string? ActualPhoneSource,
    [property: JsonPropertyName("alignment_source")] string? AlignmentSource,
    [property: JsonPropertyName("acoustic_source")] string? AcousticSource,
    [property: JsonPropertyName("issue_count")] int IssueCount,
    [property: JsonPropertyName("pronunciation_risk_ratio")] double PronunciationRiskRatio,
    [property: JsonPropertyName("rhythm_score")] double? RhythmScore,
    [property: JsonPropertyName("stress_score")] double? StressScore,
    [property: JsonPropertyName("intonation_score")] double? IntonationScore,
    [property: JsonPropertyName("chunking_score")] double? ChunkingScore,
    [property: JsonPropertyName("pitch_mean_hz")] double? PitchMeanHz,
    [property: JsonPropertyName("pitch_range_hz")] double? PitchRangeHz,
    [property: JsonPropertyName("pitch_variation_score")] double? PitchVariationScore,
    [property: JsonPropertyName("phone_match_score")] double? PhoneMatchScore,
    [property: JsonPropertyName("issues")] IReadOnlyList<AiSpeakingPhonemeIssue>? Issues,
    [property: JsonPropertyName("engine_warnings")] IReadOnlyList<string>? EngineWarnings);

public sealed record AiSpeakingPhonemeIssue(
    [property: JsonPropertyName("word")] string? Word,
    [property: JsonPropertyName("expected_phoneme")] string? ExpectedPhoneme,
    [property: JsonPropertyName("actual_phoneme")] string? ActualPhoneme,
    [property: JsonPropertyName("is_correct")] bool? IsCorrect,
    [property: JsonPropertyName("confidence")] double? Confidence,
    [property: JsonPropertyName("start")] double? Start,
    [property: JsonPropertyName("end")] double? End,
    [property: JsonPropertyName("issue_type")] string? IssueType);

public sealed record AiWritingCorrection(
    [property: JsonPropertyName("start_index")] int? StartIndex,
    [property: JsonPropertyName("end_index")] int? EndIndex,
    [property: JsonPropertyName("original_text")] string? OriginalText,
    [property: JsonPropertyName("corrected_text")] string? CorrectedText,
    [property: JsonPropertyName("explanation")] string? Explanation,
    [property: JsonPropertyName("criteria")] string? Criteria);
