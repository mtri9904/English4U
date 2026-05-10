from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ScoreWritingRequest(BaseModel):
    session_id: str
    answer_id: str
    essay_text: str
    question_prompt: str | None = None
    skill_type: str = "Writing"


class RubricScore(BaseModel):
    criteria: str
    band: float
    comment: str
    improvements: str
    confidence: float | None = None
    evidence: list[str] = Field(default_factory=list)


class SpeakingWordTimestamp(BaseModel):
    word: str
    start: float | None = None
    end: float | None = None
    probability: float | None = None


class SpeakingPauseStats(BaseModel):
    pause_count: int = 0
    long_pause_count: int = 0
    total_pause_seconds: float = 0.0
    average_pause_seconds: float | None = None
    longest_pause_seconds: float | None = None


class SpeakingVadSegment(BaseModel):
    start: float
    end: float


class SpeakingVadAnalysis(BaseModel):
    engine: str = "silero_vad"
    is_available: bool = False
    segment_count: int = 0
    speech_seconds: float = 0.0
    speech_ratio: float | None = None
    pause_stats: SpeakingPauseStats = Field(default_factory=SpeakingPauseStats)
    segments: list[SpeakingVadSegment] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SpeakingSpeakerSegment(BaseModel):
    start: float
    end: float
    speaker: str


class SpeakingDiarizationAnalysis(BaseModel):
    engine: str = "pyannote_community_1"
    is_available: bool = False
    is_enabled: bool = False
    model: str | None = None
    speaker_count: int = 0
    speaker_turn_count: int = 0
    primary_speaker: str | None = None
    primary_speaker_ratio: float | None = None
    exclusive_speaker_diarization: bool = False
    segments: list[SpeakingSpeakerSegment] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SpeakingAudioQuality(BaseModel):
    is_usable: bool = True
    label: str = "unknown"
    duration_seconds: float | None = None
    sample_rate_hz: int | None = None
    channels: int | None = None
    silence_ratio: float | None = None
    clipping_ratio: float | None = None
    loudness_dbfs: float | None = None
    snr_db: float | None = None
    normalized_audio_format: str | None = None
    warnings: list[str] = Field(default_factory=list)


class SpeakingGrammarIssue(BaseModel):
    rule_id: str | None = None
    category: str | None = None
    issue_type: str | None = None
    message: str
    matched_text: str | None = None
    offset: int | None = None
    length: int | None = None
    replacements: list[str] = Field(default_factory=list)
    weight: float = 1.0


class SpeakingGrammarAnalysis(BaseModel):
    engine: str = "languagetool_http"
    language: str = "en-US"
    is_available: bool = False
    complexity_engine: str = "heuristic_grammar_complexity_v1"
    error_count: int = 0
    weighted_error_count: float = 0.0
    error_density_per_100_words: float = 0.0
    complexity_score: float | None = None
    complex_sentence_ratio: float | None = None
    subordinate_clause_count: int = 0
    modal_verb_count: int = 0
    tense_marker_variety: int = 0
    repeated_starter_ratio: float | None = None
    category_counts: dict[str, int] = Field(default_factory=dict)
    issues: list[SpeakingGrammarIssue] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SpeakingLexicalAnalysis(BaseModel):
    engine: str = "wordfreq_lexicalrichness_v1"
    is_available: bool = False
    word_count: int = 0
    unique_word_count: int = 0
    lexical_density: float = 0.0
    type_token_ratio: float = 0.0
    advanced_word_ratio: float = 0.0
    rare_word_ratio: float = 0.0
    common_word_ratio: float = 0.0
    avg_zipf_frequency: float | None = None
    mtld: float | None = None
    hdd: float | None = None
    repeated_content_ratio: float = 0.0
    sophistication_score: float = 0.0
    warnings: list[str] = Field(default_factory=list)


class SpeakingPronunciationIssue(BaseModel):
    word: str
    expected_phoneme: str | None = None
    actual_phoneme: str | None = None
    is_correct: bool | None = None
    confidence: float | None = None
    start: float | None = None
    end: float | None = None
    issue_type: str | None = None


class SpeakingPronunciationAnalysis(BaseModel):
    engine: str = "asr_word_timing_phoneme_proxy_v2"
    has_word_timing: bool = False
    has_phoneme_alignment: bool = False
    has_pitch_analysis: bool = False
    has_actual_phone_recognition: bool = False
    actual_phone_source: str | None = None
    alignment_source: str | None = None
    acoustic_source: str | None = None
    issue_count: int = 0
    pronunciation_risk_ratio: float = 0.0
    acoustic_pronunciation_score: float | None = None
    acoustic_pronunciation_source: str | None = None
    segmental_score: float | None = None
    prosody_score: float | None = None
    intelligibility_score: float | None = None
    phone_timing_score: float | None = None
    phone_timing_issue_ratio: float | None = None
    rhythm_score: float | None = None
    stress_score: float | None = None
    intonation_score: float | None = None
    chunking_score: float | None = None
    pitch_mean_hz: float | None = None
    pitch_range_hz: float | None = None
    pitch_variation_score: float | None = None
    phone_match_score: float | None = None
    issues: list[SpeakingPronunciationIssue] = Field(default_factory=list)
    engine_warnings: list[str] = Field(default_factory=list)


class SpeakingEvidence(BaseModel):
    evidence_version: str = "speaking-evidence-v5"
    prompt_type: str | None = None
    target_duration_seconds: float | None = None
    pronunciation_engine: str = "asr_word_timing_phoneme_proxy_v2"
    has_word_timing: bool = False
    has_phoneme_alignment: bool = False
    lexical_analysis: SpeakingLexicalAnalysis | None = None
    grammar_analysis: SpeakingGrammarAnalysis | None = None
    pronunciation_analysis: SpeakingPronunciationAnalysis | None = None
    audio_quality: SpeakingAudioQuality | None = None
    vad_analysis: SpeakingVadAnalysis | None = None
    diarization_analysis: SpeakingDiarizationAnalysis | None = None
    asr_confidence: float | None = None
    speech_ratio: float | None = None
    pause_stats: SpeakingPauseStats | None = None
    word_timestamps: list[SpeakingWordTimestamp] = Field(default_factory=list)
    low_confidence_words: list[SpeakingWordTimestamp] = Field(default_factory=list)
    scoring_notes: list[str] = Field(default_factory=list)


class ScoreResponse(BaseModel):
    session_id: str
    answer_id: str
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None
    transcript_text: str | None = None
    speaking_evidence: SpeakingEvidence | None = None


class StructuredScoreResult(BaseModel):
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None


class StructuredSpeakingGeminiResult(BaseModel):
    rubrics: list[RubricScore]


class SpeakingSessionRubricInput(BaseModel):
    criteria: str
    band: float
    comment: str | None = None
    improvements: str | None = None
    confidence: float | None = None
    evidence: list[str] = Field(default_factory=list)


class SpeakingSessionAnswerInput(BaseModel):
    answer_id: str
    question_prompt: str | None = None
    transcript_text: str | None = None
    part_number: int | None = None
    prompt_type: str | None = None
    duration_seconds: float | None = None
    target_duration_seconds: float | None = None
    rubrics: list[SpeakingSessionRubricInput] = Field(default_factory=list)
    no_response: bool = False


class ScoreSpeakingSessionRequest(BaseModel):
    session_id: str
    answers: list[SpeakingSessionAnswerInput] = Field(default_factory=list)


class StructuredSpeakingSessionResult(BaseModel):
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None


class GenerateSpeakingPromptAudioRequest(BaseModel):
    promptText: str


class ListeningTranscriptRequest(BaseModel):
    audio_url: str
    language: str | None = "en"


class ListeningTranscriptSegment(BaseModel):
    start_time: float
    end_time: float | None = None
    text: str


class ListeningTranscriptResponse(BaseModel):
    segments: list[ListeningTranscriptSegment]
    transcript_text: str


class ListeningAlignmentQuestion(BaseModel):
    question_number: int
    question_text: str | None = None
    correct_answer: str | None = None
    correct_option_texts: list[str] = Field(default_factory=list)
    context_text: str | None = None
    group_type: str | None = None


class ListeningTranscriptAlignmentRequest(BaseModel):
    transcript_segments: list[ListeningTranscriptSegment]
    questions: list[ListeningAlignmentQuestion]


class ListeningTranscriptQuestionAlignment(BaseModel):
    question_number: int
    segment_indexes: list[int] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] | None = None


class ListeningTranscriptAlignmentResponse(BaseModel):
    alignments: list[ListeningTranscriptQuestionAlignment]


class ListeningAlignmentSelection(BaseModel):
    question_number: int
    candidate_id: int | None = None
    confidence: Literal["high", "medium", "low"] | None = None


class ListeningAlignmentSelectionBatch(BaseModel):
    selections: list[ListeningAlignmentSelection]


class GeminiAlignmentQuotaExhaustedError(RuntimeError):
    pass
