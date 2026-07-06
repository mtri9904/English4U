from __future__ import annotations

from schemas import SpeakingAudioQuality, SpeakingEvidence
from speaking.band_utils import round_band_half


def build_rule_rubric_bands(
    *,
    features: dict[str, float | int | None],
    evidence: SpeakingEvidence,
    part_number: int | None,
    prompt_type: str,
    audio_quality: SpeakingAudioQuality | None,
    audio_backed: bool,
) -> dict[str, float]:
    word_count = int(features["word_count"] or 0)
    words_per_minute = features["words_per_minute"]
    pause_ratio = float(features["pause_ratio"] or 0.0)
    speech_ratio_value = features.get("speech_ratio")
    speech_ratio = float(speech_ratio_value) if speech_ratio_value is not None else None
    filler_ratio = float(features["filler_ratio"] or 0.0)
    connector_count = int(features["connector_count"] or 0)
    coverage_ratio = features["coverage_ratio"]
    unique_ratio = float(features["unique_ratio"] or 0.0)
    long_word_ratio = float(features["long_word_ratio"] or 0.0)
    repetition_ratio = float(features["repetition_ratio"] or 0.0)
    avg_words_per_sentence = float(features["avg_words_per_sentence"] or 0.0)
    low_confidence_ratio = float(features["low_confidence_ratio"] or 0.0)
    mean_word_probability = float(features["mean_word_probability"] or 0.0)
    avg_no_speech_prob = float(features["avg_no_speech_prob"] or 0.0)
    grammar_available = int(features.get("grammar_engine_available") or 0) == 1
    grammar_error_density = float(features.get("grammar_error_density_per_100_words") or 0.0)
    grammar_error_count = int(features.get("grammar_error_count") or 0)
    grammar_complexity_score = float(features.get("grammar_complexity_score") or 0.0)
    subordinate_clause_count = int(features.get("grammar_subordinate_clause_count") or 0)
    tense_marker_variety = int(features.get("grammar_tense_marker_variety") or 0)
    repeated_starter_ratio = float(features.get("grammar_repeated_starter_ratio") or 0.0)
    lexical_sophistication_score = float(features.get("lexical_sophistication_score") or 0.0)
    lexical_advanced_word_ratio = float(features.get("lexical_advanced_word_ratio") or 0.0)
    lexical_rare_word_ratio = float(features.get("lexical_rare_word_ratio") or 0.0)
    lexical_common_word_ratio = float(features.get("lexical_common_word_ratio") or 0.0)
    lexical_repeated_content_ratio = float(features.get("lexical_repeated_content_ratio") or 0.0)
    lexical_mtld = features.get("lexical_mtld")
    lexical_hdd = features.get("lexical_hdd")
    pronunciation_analysis = evidence.pronunciation_analysis

    fluency_score = 6.0
    if word_count < 12:
        fluency_score = 4.0
    elif word_count < 25:
        fluency_score = min(fluency_score, 5.0)

    if words_per_minute is not None:
        if words_per_minute < 75:
            fluency_score -= 1.0
        elif words_per_minute < 95:
            fluency_score -= 0.5
        elif 105 <= words_per_minute <= 165:
            fluency_score += 0.5
        elif words_per_minute > 185:
            fluency_score -= 0.5

    if coverage_ratio is not None:
        if prompt_type == "part2_long_turn" and coverage_ratio < 0.6:
            fluency_score -= 1.25
        elif coverage_ratio < 0.35:
            fluency_score -= 1.0
        elif coverage_ratio < 0.55:
            fluency_score -= 0.5
        elif 0.85 <= coverage_ratio <= 1.2:
            fluency_score += 0.25

    if pause_ratio > 0.32:
        fluency_score -= 1.0
    elif pause_ratio > 0.22:
        fluency_score -= 0.5
    elif pause_ratio < 0.12 and word_count >= 25:
        fluency_score += 0.25

    if speech_ratio is not None:
        if speech_ratio < 0.35 and word_count >= 12:
            fluency_score -= 0.5
        elif speech_ratio >= 0.62 and word_count >= 35:
            fluency_score += 0.25

    if filler_ratio > 0.08:
        fluency_score -= 0.5
    elif filler_ratio < 0.02:
        fluency_score += 0.25

    if connector_count >= 3 and word_count >= 35:
        fluency_score += 0.5
    elif connector_count == 0 and word_count >= 30:
        fluency_score -= 0.25

    if (
        word_count >= 90
        and pause_ratio <= 0.16
        and filler_ratio <= 0.04
        and int(features["long_pause_count"] or 0) <= 2
    ):
        fluency_score += 0.25
    if (
        word_count >= 120
        and connector_count >= 5
        and words_per_minute is not None
        and 95 <= words_per_minute <= 175
    ):
        fluency_score += 0.25

    if int(features["long_pause_count"] or 0) >= 5:
        fluency_score -= 0.5

    lexical_score = 6.0
    if word_count < 12:
        lexical_score = 4.0
    elif word_count < 25:
        lexical_score = min(lexical_score, 5.0)

    if word_count >= 80:
        if unique_ratio < 0.32:
            lexical_score -= 0.75
        elif unique_ratio < 0.40:
            lexical_score -= 0.25
        elif unique_ratio > 0.58:
            lexical_score += 0.25
    else:
        if unique_ratio < 0.42:
            lexical_score -= 1.0
        elif unique_ratio < 0.52:
            lexical_score -= 0.5
        elif unique_ratio > 0.68 and word_count >= 25:
            lexical_score += 0.5

    if long_word_ratio > 0.18 and word_count >= 25:
        lexical_score += 0.25
    if float(features["content_ratio"] or 0.0) > 0.55 and word_count >= 20:
        lexical_score += 0.25
    if repetition_ratio > 0.12:
        lexical_score -= 0.5
    if filler_ratio > 0.08:
        lexical_score -= 0.25
    if lexical_sophistication_score >= 0.62 and word_count >= 45:
        lexical_score += 0.5
    elif lexical_sophistication_score >= 0.42 and word_count >= 25:
        lexical_score += 0.25
    elif lexical_sophistication_score < 0.16 and word_count >= 30:
        lexical_score -= 0.25
    if lexical_advanced_word_ratio >= 0.16 and word_count >= 30:
        lexical_score += 0.25
    if lexical_common_word_ratio > 0.76 and word_count >= 40:
        lexical_score -= 0.25
    if lexical_rare_word_ratio > 0.14 and word_count >= 20:
        lexical_score -= 0.25
    if lexical_repeated_content_ratio > 0.25 and word_count >= 25:
        lexical_score -= 0.5
    elif lexical_repeated_content_ratio > 0.16 and word_count >= 25:
        lexical_score -= 0.25
    if lexical_mtld is not None and word_count >= 45:
        lexical_mtld_value = float(lexical_mtld)
        if lexical_mtld_value >= 75.0:
            lexical_score += 0.5
        elif lexical_mtld_value >= 55.0:
            lexical_score += 0.25
    if lexical_hdd is not None and float(lexical_hdd) >= 0.78 and word_count >= 45:
        lexical_score += 0.25
    if part_number == 2:
        if word_count < 35:
            lexical_score = min(lexical_score, 6.0)
        elif word_count < 55:
            lexical_score = min(lexical_score, 6.5)
    else:
        if word_count < 12:
            lexical_score = min(lexical_score, 5.0)
        elif word_count < 20:
            lexical_score = min(lexical_score, 6.0)

    grammar_score = 5.5
    if word_count < 12:
        grammar_score = 4.0
    elif word_count < 25:
        grammar_score = min(grammar_score, 5.0)

    if avg_words_per_sentence >= 7 and int(features["sentence_units"] or 1) >= 2:
        grammar_score += 0.5
    elif avg_words_per_sentence < 4 and word_count >= 15:
        grammar_score -= 0.5

    if connector_count >= 2:
        grammar_score += 0.25
    if repetition_ratio > 0.1:
        grammar_score -= 0.25
    if unique_ratio > 0.6 and word_count >= 30:
        grammar_score += 0.25
    if filler_ratio > 0.08:
        grammar_score -= 0.25
    if low_confidence_ratio > 0.35:
        grammar_score -= 0.5
    if grammar_complexity_score >= 0.78 and word_count >= 60:
        grammar_score += 0.75
    elif grammar_complexity_score >= 0.62 and word_count >= 45:
        grammar_score += 0.5
    elif grammar_complexity_score >= 0.45 and word_count >= 25:
        grammar_score += 0.25
    elif grammar_complexity_score < 0.18 and word_count >= 30:
        grammar_score -= 0.25
    if subordinate_clause_count == 0 and word_count >= 50 and connector_count < 2:
        grammar_score -= 0.25
    if tense_marker_variety >= 3 and word_count >= 35:
        grammar_score += 0.25
    if subordinate_clause_count >= 3 and tense_marker_variety >= 3 and word_count >= 60:
        grammar_score += 0.25
    if repeated_starter_ratio > 0.5 and word_count >= 35:
        grammar_score -= 0.25
    if grammar_available:
        if grammar_error_density >= 10.0:
            grammar_score -= 1.5
        elif grammar_error_density >= 6.0:
            grammar_score -= 1.0
        elif grammar_error_density >= 3.0:
            grammar_score -= 0.5
        elif grammar_error_density <= 1.5 and word_count >= 50:
            grammar_score += 0.25
        elif (
            grammar_error_count == 0
            and word_count >= 50
            and avg_words_per_sentence >= 10
            and connector_count >= 1
        ):
            grammar_score += 0.25
        if grammar_error_density <= 2.0 and grammar_complexity_score >= 0.55 and word_count >= 45:
            grammar_score += 0.25
    if part_number == 2:
        if word_count < 35:
            grammar_score = min(grammar_score, 6.0)
        elif word_count < 55:
            grammar_score = min(grammar_score, 6.5)
    else:
        if word_count < 12:
            grammar_score = min(grammar_score, 5.0)
        elif word_count < 20:
            grammar_score = min(grammar_score, 6.0)

    pronunciation_score = 6.0
    if word_count < 10:
        pronunciation_score = 4.5

    if pronunciation_analysis is not None and pronunciation_analysis.has_word_timing:
        if pronunciation_analysis.acoustic_pronunciation_score is not None:
            pronunciation_score = 5.0 + pronunciation_analysis.acoustic_pronunciation_score * 4.5
        else:
            pronunciation_score = 5.1 + mean_word_probability * 1.15

        if pronunciation_analysis.prosody_score is not None:
            pronunciation_score += (pronunciation_analysis.prosody_score - 0.6) * 0.65
        if pronunciation_analysis.intelligibility_score is not None:
            pronunciation_score += (pronunciation_analysis.intelligibility_score - 0.65) * 0.45
        if pronunciation_analysis.phone_timing_score is not None:
            pronunciation_score += (pronunciation_analysis.phone_timing_score - 0.45) * 0.35
        if pronunciation_analysis.phone_match_score is not None:
            pronunciation_score += (pronunciation_analysis.phone_match_score - 0.4) * 0.35

        if mean_word_probability < 0.55:
            pronunciation_score -= 0.35
        elif mean_word_probability < 0.7:
            pronunciation_score -= 0.15
        elif mean_word_probability > 0.9 and audio_backed:
            pronunciation_score += 0.05

        if low_confidence_ratio > 0.35:
            pronunciation_score -= 0.35
        elif low_confidence_ratio > 0.22:
            pronunciation_score -= 0.2
        elif low_confidence_ratio > 0.12:
            pronunciation_score -= 0.1

        risk_ratio = pronunciation_analysis.pronunciation_risk_ratio
        if risk_ratio >= 0.55:
            pronunciation_score -= 0.2
        elif risk_ratio >= 0.35:
            pronunciation_score -= 0.15
        elif risk_ratio >= 0.2:
            pronunciation_score -= 0.1

        if pronunciation_analysis.segmental_score is not None:
            if pronunciation_analysis.segmental_score < 0.20:
                pronunciation_score = min(pronunciation_score, 5.5)
            elif pronunciation_analysis.segmental_score < 0.28:
                pronunciation_score = min(pronunciation_score, 6.0)
            elif pronunciation_analysis.segmental_score < 0.34:
                pronunciation_score = min(pronunciation_score, 6.5)
            elif pronunciation_analysis.segmental_score < 0.40:
                pronunciation_score = min(pronunciation_score, 7.0)
        if pronunciation_analysis.prosody_score is not None:
            if pronunciation_analysis.prosody_score < 0.45:
                pronunciation_score = min(pronunciation_score, 6.0)
            elif pronunciation_analysis.prosody_score < 0.58:
                pronunciation_score = min(pronunciation_score, 6.5)
        if pronunciation_analysis.intelligibility_score is not None:
            if pronunciation_analysis.intelligibility_score < 0.50:
                pronunciation_score = min(pronunciation_score, 6.0)
            elif pronunciation_analysis.intelligibility_score < 0.65:
                pronunciation_score = min(pronunciation_score, 6.5)

        if pronunciation_analysis.rhythm_score is not None and pronunciation_analysis.rhythm_score < 0.40:
            pronunciation_score -= 0.25
        elif pronunciation_analysis.rhythm_score is not None and pronunciation_analysis.rhythm_score < 0.55:
            pronunciation_score -= 0.1

        if pronunciation_analysis.stress_score is not None and pronunciation_analysis.stress_score < 0.40:
            pronunciation_score -= 0.1
        if pronunciation_analysis.chunking_score is not None and pronunciation_analysis.chunking_score < 0.40:
            pronunciation_score -= 0.1
        if pronunciation_analysis.has_pitch_analysis and pronunciation_analysis.intonation_score is not None:
            if pronunciation_analysis.intonation_score < 0.45:
                pronunciation_score -= 0.25
            elif pronunciation_analysis.intonation_score < 0.60:
                pronunciation_score -= 0.1
            elif pronunciation_analysis.intonation_score >= 0.78 and word_count >= 30:
                pronunciation_score += 0.15
        if pronunciation_analysis.issue_count == 0 and word_count >= 40 and mean_word_probability > 0.85:
            pronunciation_score += 0.15
        elif pronunciation_analysis.issue_count <= 3 and word_count >= 40 and mean_word_probability > 0.88:
            pronunciation_score += 0.1
        if pronunciation_analysis.has_phoneme_alignment and pronunciation_analysis.pronunciation_risk_ratio <= 0.08 and word_count >= 40:
            pronunciation_score += 0.15
        if pronunciation_analysis.has_actual_phone_recognition and pronunciation_analysis.phone_match_score is not None:
            if pronunciation_analysis.phone_match_score < 0.20:
                pronunciation_score -= 0.2
            elif pronunciation_analysis.phone_match_score < 0.35:
                pronunciation_score -= 0.1
            elif pronunciation_analysis.phone_match_score < 0.50:
                pronunciation_score -= 0.05
            elif pronunciation_analysis.phone_match_score >= 0.78 and word_count >= 30:
                pronunciation_score += 0.15

    if pause_ratio > 0.28:
        pronunciation_score -= 0.5
    if speech_ratio is not None and speech_ratio < 0.35 and word_count >= 12:
        pronunciation_score -= 0.25
    if avg_no_speech_prob > 0.55:
        pronunciation_score -= 0.25
    if words_per_minute is not None and (words_per_minute < 75 or words_per_minute > 190):
        pronunciation_score -= 0.25
    if not evidence.has_phoneme_alignment:
        pronunciation_score = min(pronunciation_score, 8.0)
    if audio_quality is None or audio_quality.label == "unknown":
        pronunciation_score = min(pronunciation_score, 7.5)

    return {
        "Fluency and Coherence": round_band_half(fluency_score),
        "Lexical Resource": round_band_half(lexical_score),
        "Grammatical Range and Accuracy": round_band_half(grammar_score),
        "Pronunciation": round_band_half(pronunciation_score),
    }
