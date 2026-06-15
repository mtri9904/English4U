from __future__ import annotations

from faster_whisper.transcribe import Segment

from schemas import (
    RubricScore,
    SpeakingAudioQuality,
    SpeakingDiarizationAnalysis,
    SpeakingEvidence,
    SpeakingGrammarAnalysis,
    SpeakingLexicalAnalysis,
    SpeakingPauseStats,
    SpeakingVadAnalysis,
)
from speaking.grammar import build_grammar_category_summary, build_grammar_issue_evidence
from speaking.pronunciation import build_speaking_pronunciation_analysis
from speaking.response_features import (
    build_low_confidence_word_evidence,
    build_word_timestamp_evidence,
)
from speaking.text_utils import format_percent, shorten_evidence_text

def build_speaking_comment(
    *,
    criteria: str,
    band: float,
    features: dict[str, float | int | None],
    audio_backed: bool,
) -> tuple[str, str]:
    word_count = int(features["word_count"] or 0)
    words_per_minute = features["words_per_minute"]
    pause_ratio = float(features["pause_ratio"] or 0.0)
    connector_count = int(features["connector_count"] or 0)
    unique_ratio = float(features["unique_ratio"] or 0.0)
    repetition_ratio = float(features["repetition_ratio"] or 0.0)
    lexical_sophistication_score = features.get("lexical_sophistication_score")
    lexical_advanced_word_ratio = float(features.get("lexical_advanced_word_ratio") or 0.0)
    lexical_repeated_content_ratio = float(features.get("lexical_repeated_content_ratio") or 0.0)
    mean_word_probability = float(features["mean_word_probability"] or 0.0)
    low_confidence_ratio = float(features["low_confidence_ratio"] or 0.0)
    filler_ratio = float(features["filler_ratio"] or 0.0)

    if criteria == "Fluency and Coherence":
        pace_text = (
            f"tốc độ nói khoảng {words_per_minute} WPM"
            if words_per_minute is not None
            else "nhịp nói chưa đủ dữ liệu thời lượng"
        )
        comment = (
            f"Bài nói có khoảng {word_count} từ; {pace_text}. "
            f"Mức ngắt quãng đang ở khoảng {round(pause_ratio * 100)}% thời lượng và số liên từ ý là {connector_count}."
        )
        improvements = (
            "Giữ câu trả lời theo 2-3 ý rõ ràng, nối ý bằng because/so/however/for example, "
            "và giảm các quãng dừng dài hoặc filler không cần thiết."
        )
        return comment, improvements

    if criteria == "Lexical Resource":
        comment = (
            f"Độ đa dạng từ vựng hiện ở khoảng {round(unique_ratio * 100)}%, "
            f"tỉ lệ lặp từ liên tiếp khoảng {round(repetition_ratio * 100)}%."
        )
        improvements = (
            "Mở rộng paraphrase cho các ý quen thuộc, thay từ lặp bằng collocation tự nhiên, "
            "và thêm ví dụ cụ thể thay vì lặp lại cùng một cụm từ."
        )
        return comment, improvements

    if criteria == "Grammatical Range and Accuracy":
        grammar_available = int(features.get("grammar_engine_available") or 0) == 1
        grammar_error_count = int(features.get("grammar_error_count") or 0)
        grammar_density = float(features.get("grammar_error_density_per_100_words") or 0.0)
        if grammar_available:
            if grammar_error_count:
                comment = (
                    f"LanguageTool phát hiện khoảng {grammar_error_count} lỗi/điểm cần kiểm tra, "
                    f"mật độ lỗi có trọng số khoảng {grammar_density:.1f}/100 từ. "
                    f"Câu trả lời có khoảng {int(features['sentence_units'] or 1)} đơn vị ý."
                )
                improvements = (
                    "Ưu tiên sửa các lỗi grammar được liệt kê trong evidence, rồi luyện mở rộng câu bằng "
                    "mệnh đề because/although/when mà vẫn giữ chủ ngữ-động từ rõ ràng."
                )
                return comment, improvements
            comment = (
                "LanguageTool không phát hiện lỗi ngữ pháp rõ ràng trong transcript; "
                f"câu trả lời có khoảng {int(features['sentence_units'] or 1)} đơn vị ý, "
                f"độ dài trung bình khoảng {round(float(features['avg_words_per_sentence'] or 0.0), 1)} từ/ý."
            )
            improvements = (
                "Tiếp theo nên tăng range bằng câu phụ thuộc, mệnh đề quan hệ hoặc điều kiện tự nhiên, "
                "thay vì chỉ dùng các câu đơn an toàn."
            )
            return comment, improvements

        comment = (
            f"Câu trả lời được chia thành khoảng {int(features['sentence_units'] or 1)} đơn vị ý, "
            f"độ dài trung bình khoảng {round(float(features['avg_words_per_sentence'] or 0.0), 1)} từ/ý."
        )
        improvements = (
            "Luyện kết hợp câu đơn với câu có mệnh đề because/although/when, "
            "giữ mỗi ý trọn vẹn chủ ngữ-động từ-tân ngữ và tránh lặp cấu trúc quá ngắn."
        )
        return comment, improvements

    confidence_text = (
        f"Độ rõ theo ASR khoảng {round(mean_word_probability * 100)}%"
        if audio_backed
        else "Điểm này đang dựa chủ yếu trên transcript vì chưa có đủ đặc trưng audio"
    )
    comment = (
        f"{confidence_text}; tỉ lệ từ có độ chắc thấp khoảng {round(low_confidence_ratio * 100)}% "
        f"và filler khoảng {round(filler_ratio * 100)}%."
    )
    improvements = (
        "Nói chậm hơn một chút ở từ khóa, nhấn trọng âm rõ ở danh từ/động từ chính, "
        "và giữ hơi đều để cuối câu không bị nuốt âm."
    )
    return comment, improvements


def build_speaking_evidence_payload(
    *,
    features: dict[str, float | int | None],
    segments: list[Segment],
    audio_quality: SpeakingAudioQuality | None,
    audio_path: str | None,
    prompt_type: str,
    transcript: str | None,
    lexical_analysis: SpeakingLexicalAnalysis | None = None,
    grammar_analysis: SpeakingGrammarAnalysis | None = None,
    vad_analysis: SpeakingVadAnalysis | None = None,
    diarization_analysis: SpeakingDiarizationAnalysis | None = None,
) -> SpeakingEvidence:
    word_timestamps = build_word_timestamp_evidence(segments)
    low_confidence_words = build_low_confidence_word_evidence(word_timestamps)
    pause_stats = SpeakingPauseStats(
        pause_count=int(features["pause_count"] or 0),
        long_pause_count=int(features["long_pause_count"] or 0),
        total_pause_seconds=round(float(features["total_pause_seconds"] or 0.0), 2),
        average_pause_seconds=(
            round(float(features["average_pause_seconds"]), 2)
            if features["average_pause_seconds"] is not None
            else None
        ),
        longest_pause_seconds=(
            round(float(features["longest_pause_seconds"]), 2)
            if features["longest_pause_seconds"] is not None
            else None
        ),
    )
    pronunciation_analysis = build_speaking_pronunciation_analysis(
        word_timestamps=word_timestamps,
        pause_stats=pause_stats,
        features=features,
        audio_path=audio_path,
        transcript=transcript,
    )

    scoring_notes = [
        "Transcript is generated by ASR from the candidate audio and is treated as evidence, not ground truth.",
    ]
    if audio_quality is not None and audio_quality.warnings:
        scoring_notes.extend(audio_quality.warnings)
    if low_confidence_words:
        scoring_notes.append("Some words have low ASR confidence; lexical/grammar conclusions should be read with lower confidence.")
    if not segments:
        scoring_notes.append("No word-level audio timestamps were available; audio-backed evidence is limited.")
    if pronunciation_analysis.engine_warnings:
        scoring_notes.extend(pronunciation_analysis.engine_warnings)
    if pronunciation_analysis.acoustic_pronunciation_score is not None:
        scoring_notes.append(
            "Pronunciation uses a GOP-style acoustic score blended from MFA phone timing, actual-phone match, and prosody evidence."
        )
    if grammar_analysis is not None and grammar_analysis.warnings:
        scoring_notes.extend(grammar_analysis.warnings)
    if lexical_analysis is not None and lexical_analysis.warnings:
        scoring_notes.extend(lexical_analysis.warnings)
    if vad_analysis is not None and vad_analysis.warnings:
        scoring_notes.extend(vad_analysis.warnings)
    if vad_analysis is not None and vad_analysis.is_available:
        scoring_notes.append("Speech activity and pauses are measured with Silero VAD when available.")
    if diarization_analysis is not None and diarization_analysis.is_available:
        scoring_notes.append("Speaker turns are measured with pyannote speaker diarization.")
        if diarization_analysis.speaker_count > 1:
            scoring_notes.append(
                f"Detected {diarization_analysis.speaker_count} speakers; use primary-speaker evidence carefully when audio includes examiner speech."
            )
        if diarization_analysis.warnings:
            scoring_notes.extend(diarization_analysis.warnings)
    if segments and not pronunciation_analysis.has_phoneme_alignment:
        scoring_notes.append("No forced phoneme alignment engine was available; pronunciation uses ASR word timing and confidence proxies.")
    if segments and not pronunciation_analysis.has_pitch_analysis:
        scoring_notes.append("Pitch-based intonation is not measured; install/enable Praat Parselmouth to use pitch evidence.")
    if segments and not pronunciation_analysis.has_actual_phone_recognition:
        scoring_notes.append("Actual phone recognition is not measured; install/enable Allosaurus to compare recognized phones with expected phones.")

    return SpeakingEvidence(
        prompt_type=prompt_type,
        target_duration_seconds=(
            round(float(features["target_duration_seconds"]), 1)
            if features["target_duration_seconds"] is not None
            else None
        ),
        pronunciation_engine=pronunciation_analysis.engine,
        has_word_timing=pronunciation_analysis.has_word_timing,
        has_phoneme_alignment=pronunciation_analysis.has_phoneme_alignment,
        lexical_analysis=lexical_analysis,
        grammar_analysis=grammar_analysis,
        pronunciation_analysis=pronunciation_analysis,
        audio_quality=audio_quality,
        vad_analysis=vad_analysis,
        diarization_analysis=diarization_analysis,
        asr_confidence=(
            round(float(features["asr_confidence"]), 3)
            if features["asr_confidence"] is not None
            else None
        ),
        speech_ratio=(
            round(float(features["speech_ratio"]), 3)
            if features["speech_ratio"] is not None
            else None
        ),
        pause_stats=pause_stats,
        word_timestamps=word_timestamps,
        low_confidence_words=low_confidence_words,
        scoring_notes=scoring_notes,
    )


def build_rubric_evidence(
    *,
    criteria: str,
    features: dict[str, float | int | None],
    evidence: SpeakingEvidence,
) -> list[str]:
    word_count = int(features["word_count"] or 0)
    words_per_minute = features["words_per_minute"]
    asr_confidence = evidence.asr_confidence
    speech_ratio = evidence.speech_ratio
    pause_stats = evidence.pause_stats or SpeakingPauseStats()
    vad_analysis = evidence.vad_analysis
    diarization_analysis = evidence.diarization_analysis
    speech_activity_source = (
        vad_analysis.engine
        if vad_analysis is not None and vad_analysis.is_available
        else "asr_word_timing"
    )
    low_confidence_words = ", ".join(
        word.word
        for word in evidence.low_confidence_words[:5]
        if word.word
    )

    if criteria == "Fluency and Coherence":
        fluency_evidence = [
            f"word_count={word_count}",
            f"wpm={words_per_minute if words_per_minute is not None else 'n/a'}",
            f"speech_ratio={format_percent(speech_ratio)}",
            f"speech_activity_source={speech_activity_source}",
            f"pauses={pause_stats.pause_count}, long_pauses={pause_stats.long_pause_count}, total_pause={pause_stats.total_pause_seconds}s",
            f"vad_segments={vad_analysis.segment_count if vad_analysis is not None and vad_analysis.is_available else 'n/a'}",
            f"target_duration={evidence.target_duration_seconds if evidence.target_duration_seconds is not None else 'n/a'}s",
            f"coverage={format_percent(features['coverage_ratio'])}",
        ]
        if diarization_analysis is not None:
            fluency_evidence.extend([
                f"speaker_diarization={diarization_analysis.engine}",
                f"speakers={diarization_analysis.speaker_count}",
                f"speaker_turns={diarization_analysis.speaker_turn_count}",
                f"primary_speaker_ratio={format_percent(diarization_analysis.primary_speaker_ratio)}",
                f"exclusive_diarization={'yes' if diarization_analysis.exclusive_speaker_diarization else 'no'}",
            ])
        return fluency_evidence

    if criteria == "Lexical Resource":
        lexical_analysis = evidence.lexical_analysis
        lexical_evidence = [
            f"word_count={word_count}",
            f"unique_word_ratio={format_percent(features['unique_ratio'])}",
            f"content_word_ratio={format_percent(features['content_ratio'])}",
            f"repetition_ratio={format_percent(features['repetition_ratio'])}",
            f"type_token_ratio={format_percent(features.get('lexical_type_token_ratio'))}",
            f"lexical_density={format_percent(features.get('lexical_density'))}",
            f"advanced_word_ratio={format_percent(features.get('lexical_advanced_word_ratio'))}",
            f"rare_word_ratio={format_percent(features.get('lexical_rare_word_ratio'))}",
            f"common_word_ratio={format_percent(features.get('lexical_common_word_ratio'))}",
            f"repeated_content_ratio={format_percent(features.get('lexical_repeated_content_ratio'))}",
            f"sophistication_score={features.get('lexical_sophistication_score') if features.get('lexical_sophistication_score') is not None else 'n/a'}",
            f"asr_confidence={format_percent(asr_confidence)}",
        ]
        if lexical_analysis is not None:
            lexical_evidence.extend([
                f"lexical_engine={lexical_analysis.engine}",
                f"lexical_engine_available={'yes' if lexical_analysis.is_available else 'no'}",
                f"avg_zipf_frequency={lexical_analysis.avg_zipf_frequency if lexical_analysis.avg_zipf_frequency is not None else 'n/a'}",
                f"mtld={lexical_analysis.mtld if lexical_analysis.mtld is not None else 'n/a'}",
                f"hdd={lexical_analysis.hdd if lexical_analysis.hdd is not None else 'n/a'}",
            ])
            if lexical_analysis.warnings:
                lexical_evidence.append(f"lexical_warning={shorten_evidence_text(lexical_analysis.warnings[0], max_length=110)}")
        return lexical_evidence

    if criteria == "Grammatical Range and Accuracy":
        grammar_analysis = evidence.grammar_analysis
        grammar_evidence = [
            f"sentence_units={int(features['sentence_units'] or 1)}",
            f"avg_words_per_unit={round(float(features['avg_words_per_sentence'] or 0.0), 1)}",
            f"connector_count={int(features['connector_count'] or 0)}",
            f"grammar_complexity_score={features.get('grammar_complexity_score') if features.get('grammar_complexity_score') is not None else 'n/a'}",
            f"complex_sentence_ratio={format_percent(features.get('grammar_complex_sentence_ratio'))}",
            f"subordinate_clause_markers={int(features.get('grammar_subordinate_clause_count') or 0)}",
            f"modal_verbs={int(features.get('grammar_modal_verb_count') or 0)}",
            f"tense_marker_variety={int(features.get('grammar_tense_marker_variety') or 0)}",
            f"filler_ratio={format_percent(features['filler_ratio'])}",
            f"asr_confidence={format_percent(asr_confidence)}",
        ]
        if grammar_analysis is not None:
            grammar_evidence.extend([
                f"grammar_engine={grammar_analysis.engine}",
                f"grammar_available={'yes' if grammar_analysis.is_available else 'no'}",
                f"grammar_errors={grammar_analysis.error_count}",
                f"weighted_error_density={grammar_analysis.error_density_per_100_words}/100w",
            ])
            category_summary = build_grammar_category_summary(grammar_analysis)
            if category_summary:
                grammar_evidence.append(f"grammar_categories={category_summary}")
            grammar_evidence.extend(build_grammar_issue_evidence(grammar_analysis))
            if grammar_analysis.warnings:
                grammar_evidence.append(f"grammar_warning={shorten_evidence_text(grammar_analysis.warnings[0], max_length=110)}")
        return grammar_evidence

    pronunciation_analysis = evidence.pronunciation_analysis
    if evidence.has_phoneme_alignment:
        alignment_label = "forced_phoneme_alignment"
    elif pronunciation_analysis is not None and pronunciation_analysis.has_word_timing:
        alignment_label = "word_timing_proxy"
    else:
        alignment_label = "no"
    pronunciation_evidence = [
        f"engine={evidence.pronunciation_engine}",
        f"phoneme_alignment={alignment_label}",
        f"asr_confidence={format_percent(asr_confidence)}",
        f"low_confidence_word_ratio={format_percent(features['low_confidence_ratio'])}",
        f"speech_ratio={format_percent(speech_ratio)}",
        f"speech_activity_source={speech_activity_source}",
        f"audio_quality={evidence.audio_quality.label if evidence.audio_quality is not None else 'transcript_only'}",
    ]
    if pronunciation_analysis is not None:
        pronunciation_evidence.extend([
            f"alignment_source={pronunciation_analysis.alignment_source or 'n/a'}",
            f"acoustic_source={pronunciation_analysis.acoustic_source or 'n/a'}",
            f"acoustic_pronunciation_score={pronunciation_analysis.acoustic_pronunciation_score if pronunciation_analysis.acoustic_pronunciation_score is not None else 'n/a'}",
            f"acoustic_pronunciation_source={pronunciation_analysis.acoustic_pronunciation_source or 'n/a'}",
            f"segmental_score={pronunciation_analysis.segmental_score if pronunciation_analysis.segmental_score is not None else 'n/a'}",
            f"prosody_score={pronunciation_analysis.prosody_score if pronunciation_analysis.prosody_score is not None else 'n/a'}",
            f"intelligibility_score={pronunciation_analysis.intelligibility_score if pronunciation_analysis.intelligibility_score is not None else 'n/a'}",
            f"phone_timing_score={pronunciation_analysis.phone_timing_score if pronunciation_analysis.phone_timing_score is not None else 'n/a'}",
            f"phone_timing_issue_ratio={format_percent(pronunciation_analysis.phone_timing_issue_ratio)}",
            f"actual_phone_source={pronunciation_analysis.actual_phone_source or 'n/a'}",
            f"phone_match_score={pronunciation_analysis.phone_match_score if pronunciation_analysis.phone_match_score is not None else 'n/a'}",
            f"pronunciation_issue_count={pronunciation_analysis.issue_count}",
            f"pronunciation_risk_ratio={format_percent(pronunciation_analysis.pronunciation_risk_ratio)}",
            f"rhythm_score={pronunciation_analysis.rhythm_score if pronunciation_analysis.rhythm_score is not None else 'n/a'}",
            f"stress_score={pronunciation_analysis.stress_score if pronunciation_analysis.stress_score is not None else 'n/a'}",
            f"intonation_score={pronunciation_analysis.intonation_score if pronunciation_analysis.intonation_score is not None else 'pitch_not_measured'}",
            f"chunking_score={pronunciation_analysis.chunking_score if pronunciation_analysis.chunking_score is not None else 'n/a'}",
        ])
        if pronunciation_analysis.has_pitch_analysis:
            pronunciation_evidence.extend([
                f"pitch_mean_hz={pronunciation_analysis.pitch_mean_hz if pronunciation_analysis.pitch_mean_hz is not None else 'n/a'}",
                f"pitch_range_hz={pronunciation_analysis.pitch_range_hz if pronunciation_analysis.pitch_range_hz is not None else 'n/a'}",
                f"pitch_variation_score={pronunciation_analysis.pitch_variation_score if pronunciation_analysis.pitch_variation_score is not None else 'n/a'}",
            ])
        if pronunciation_analysis.engine_warnings:
            pronunciation_evidence.append(f"pronunciation_warning={shorten_evidence_text(pronunciation_analysis.engine_warnings[0], max_length=110)}")
        for index, issue in enumerate(pronunciation_analysis.issues[:4], start=1):
            pronunciation_evidence.append(
                f"pron_issue{index}={issue.word}:{issue.issue_type or 'risk'}:{issue.actual_phoneme or 'n/a'}"
            )
    if low_confidence_words:
        pronunciation_evidence.append(f"low_confidence_words={low_confidence_words}")
    return pronunciation_evidence


def build_rubric_confidence(
    *,
    criteria: str,
    features: dict[str, float | int | None],
    evidence: SpeakingEvidence,
    audio_backed: bool,
) -> float:
    word_count = int(features["word_count"] or 0)
    asr_confidence = evidence.asr_confidence
    confidence = 0.78 if audio_backed else 0.45

    if criteria == "Pronunciation":
        pronunciation_analysis = evidence.pronunciation_analysis
        if evidence.has_phoneme_alignment:
            confidence = 0.9 if pronunciation_analysis is not None and pronunciation_analysis.has_pitch_analysis and pronunciation_analysis.has_actual_phone_recognition else 0.82
        elif audio_backed and evidence.word_timestamps:
            confidence = 0.62 if pronunciation_analysis is not None and pronunciation_analysis.has_pitch_analysis else 0.55
        else:
            confidence = 0.28
    elif criteria == "Grammatical Range and Accuracy":
        grammar_available = int(features.get("grammar_engine_available") or 0) == 1
        grammar_complexity_available = features.get("grammar_complexity_score") is not None
        if grammar_available:
            confidence = 0.82 if word_count >= 20 else 0.62
        elif grammar_complexity_available:
            confidence = 0.68 if word_count >= 20 else 0.52
        else:
            confidence = 0.62 if word_count >= 20 else 0.5
    elif criteria == "Lexical Resource":
        lexical_available = int(features.get("lexical_engine_available") or 0) == 1
        if lexical_available:
            confidence = 0.82 if word_count >= 20 else 0.62
        else:
            confidence = 0.72 if word_count >= 20 else 0.55

    if (
        evidence.vad_analysis is not None
        and evidence.vad_analysis.is_available
        and criteria in {"Fluency and Coherence", "Pronunciation"}
    ):
        confidence += 0.06

    if asr_confidence is not None:
        if asr_confidence < 0.55:
            confidence -= 0.22
        elif asr_confidence < 0.7:
            confidence -= 0.1
        elif asr_confidence > 0.88 and audio_backed and criteria != "Pronunciation":
            confidence += 0.08

    if evidence.audio_quality is not None:
        if not evidence.audio_quality.is_usable:
            confidence -= 0.25
        elif evidence.audio_quality.label == "unknown":
            confidence -= 0.12
        elif evidence.audio_quality.warnings:
            confidence -= 0.08

    if word_count < 8:
        confidence -= 0.18

    return round(min(0.95, max(0.1, confidence)), 2)


def build_no_response_speaking_result(
    duration_seconds: float | None,
    evidence: SpeakingEvidence | None = None,
) -> tuple[list[RubricScore], str]:
    duration_text = (
        f" Bản ghi dài khoảng {duration_seconds:.1f} giây nhưng không có lời nói đủ rõ để nhận diện."
        if duration_seconds is not None and duration_seconds > 0
        else " Không có lời nói đủ rõ để nhận diện trong câu trả lời này."
    )
    evidence_lines = [
        "no_response=true",
        f"duration_seconds={round(duration_seconds, 1) if duration_seconds is not None else 'n/a'}",
    ]
    if evidence is not None and evidence.audio_quality is not None:
        evidence_lines.append(f"audio_quality={evidence.audio_quality.label}")
        evidence_lines.append(f"silence_ratio={format_percent(evidence.audio_quality.silence_ratio)}")
    if evidence is not None and evidence.asr_confidence is not None:
        evidence_lines.append(f"asr_confidence={format_percent(evidence.asr_confidence)}")
    confidence = 0.82 if evidence is not None and evidence.audio_quality is not None and not evidence.audio_quality.is_usable else 0.65
    rubrics = [
        RubricScore(
            criteria="Fluency and Coherence",
            band=1.0,
            comment=f"Không có câu trả lời nói có thể đánh giá về độ trôi chảy hoặc mạch lạc.{duration_text}",
            improvements="Khi bí ý, hãy nói tối thiểu 1-2 câu trực tiếp về việc bạn chưa chắc, rồi đưa một ví dụ hoặc lý do đơn giản.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
        RubricScore(
            criteria="Lexical Resource",
            band=1.0,
            comment="Không có đủ từ vựng được nói ra để thể hiện khả năng diễn đạt.",
            improvements="Chuẩn bị một vài cụm mở đầu an toàn như I am not very familiar with this topic, but I think... để vẫn tạo được câu trả lời.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
        RubricScore(
            criteria="Grammatical Range and Accuracy",
            band=1.0,
            comment="Không có ngôn ngữ đủ dài để đánh giá cấu trúc câu hoặc độ chính xác ngữ pháp.",
            improvements="Ưu tiên tạo câu đơn hoàn chỉnh với chủ ngữ và động từ trước, sau đó thêm because hoặc for example để mở rộng.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
        RubricScore(
            criteria="Pronunciation",
            band=1.0,
            comment="Không có lời nói đủ rõ để đánh giá phát âm ở mức câu trả lời.",
            improvements="Nói rõ từng từ khóa và giữ âm lượng ổn định; nếu chưa nghĩ ra ý, vẫn nên nói một câu ngắn thay vì im lặng.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
    ]
    overall_feedback = (
        "Câu trả lời được chấm như no response vì audio không tạo ra transcript có thể đánh giá. "
        "Trong Speaking thực tế, việc không trả lời làm giảm điểm vì examiner không có bằng chứng ngôn ngữ để chấm các tiêu chí."
    )
    return rubrics, overall_feedback

