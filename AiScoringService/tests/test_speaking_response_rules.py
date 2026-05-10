from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import SpeakingAudioQuality, SpeakingEvidence, SpeakingPronunciationAnalysis  # noqa: E402
from speaking.response_rules import build_rule_rubric_bands  # noqa: E402


def make_features(
    *,
    word_count: int,
    duration_seconds: float,
    mean_word_probability: float,
    low_confidence_ratio: float,
    speech_ratio: float,
    pause_ratio: float,
) -> dict[str, float | int | None]:
    return {
        "word_count": word_count,
        "words_per_minute": word_count / duration_seconds * 60 if duration_seconds > 0 else None,
        "pause_ratio": pause_ratio,
        "speech_ratio": speech_ratio,
        "filler_ratio": 0.0,
        "connector_count": 0,
        "coverage_ratio": None,
        "unique_ratio": 0.0,
        "long_word_ratio": 0.0,
        "repetition_ratio": 0.0,
        "avg_words_per_sentence": 0.0,
        "low_confidence_ratio": low_confidence_ratio,
        "mean_word_probability": mean_word_probability,
        "avg_no_speech_prob": 0.0,
        "sentence_units": 1,
        "long_pause_count": 0,
        "pause_count": 0,
        "total_pause_seconds": 0.0,
        "average_pause_seconds": None,
        "longest_pause_seconds": None,
        "content_ratio": 0.0,
        "grammar_engine_available": 0,
        "grammar_error_density_per_100_words": 0.0,
        "grammar_error_count": 0,
        "grammar_complexity_score": 0.0,
        "grammar_complex_sentence_ratio": 0.0,
        "grammar_subordinate_clause_count": 0,
        "grammar_modal_verb_count": 0,
        "grammar_tense_marker_variety": 0,
        "grammar_repeated_starter_ratio": 0.0,
        "lexical_sophistication_score": 0.0,
        "lexical_advanced_word_ratio": 0.0,
        "lexical_rare_word_ratio": 0.0,
        "lexical_common_word_ratio": 0.0,
        "lexical_repeated_content_ratio": 0.0,
        "lexical_mtld": None,
        "lexical_hdd": None,
        "speaker_diarization_enabled": 0,
        "speaker_count": 1,
        "speaker_turn_count": 0,
        "primary_speaker_ratio": 1.0,
    }


def make_evidence(
    *,
    acoustic: float,
    segmental: float,
    prosody: float,
    intelligibility: float,
    timing: float,
    phone_match: float,
    rhythm: float,
    stress: float,
    intonation: float,
    chunking: float,
    issue_count: int,
    risk_ratio: float,
) -> SpeakingEvidence:
    pronunciation = SpeakingPronunciationAnalysis(
        has_word_timing=True,
        has_phoneme_alignment=True,
        has_pitch_analysis=True,
        has_actual_phone_recognition=True,
        acoustic_pronunciation_score=acoustic,
        segmental_score=segmental,
        prosody_score=prosody,
        intelligibility_score=intelligibility,
        phone_timing_score=timing,
        phone_match_score=phone_match,
        rhythm_score=rhythm,
        stress_score=stress,
        intonation_score=intonation,
        chunking_score=chunking,
        issue_count=issue_count,
        pronunciation_risk_ratio=risk_ratio,
    )
    return SpeakingEvidence(
        pronunciation_analysis=pronunciation,
        has_word_timing=True,
        has_phoneme_alignment=True,
        audio_quality=SpeakingAudioQuality(label="usable"),
    )


class SpeakingResponseRulesTests(unittest.TestCase):
    def test_high_band_audio_backed_pronunciation_rises_above_six_point_five(self) -> None:
        features = make_features(
            word_count=19,
            duration_seconds=8.34,
            mean_word_probability=0.801,
            low_confidence_ratio=0.158,
            speech_ratio=0.969,
            pause_ratio=0.031,
        )
        evidence = make_evidence(
            acoustic=0.454,
            segmental=0.351,
            prosody=0.866,
            intelligibility=0.714,
            timing=0.289,
            phone_match=0.42,
            rhythm=0.892,
            stress=0.67,
            intonation=0.903,
            chunking=1.0,
            issue_count=11,
            risk_ratio=0.579,
        )

        bands = build_rule_rubric_bands(
            features=features,
            evidence=evidence,
            part_number=1,
            prompt_type="part1_short_answer",
            audio_quality=evidence.audio_quality,
            audio_backed=True,
        )

        self.assertEqual(bands["Pronunciation"], 7.0)

    def test_stronger_high_band_pronunciation_can_reach_seven_point_five(self) -> None:
        features = make_features(
            word_count=650,
            duration_seconds=283.0,
            mean_word_probability=0.901,
            low_confidence_ratio=0.075,
            speech_ratio=0.874,
            pause_ratio=0.103,
        )
        evidence = make_evidence(
            acoustic=0.505,
            segmental=0.424,
            prosody=0.828,
            intelligibility=0.86,
            timing=0.491,
            phone_match=0.35,
            rhythm=0.844,
            stress=0.76,
            intonation=0.792,
            chunking=0.891,
            issue_count=7,
            risk_ratio=0.226,
        )

        bands = build_rule_rubric_bands(
            features=features,
            evidence=evidence,
            part_number=1,
            prompt_type="part1_short_answer",
            audio_quality=evidence.audio_quality,
            audio_backed=True,
        )

        self.assertEqual(bands["Pronunciation"], 7.5)

    def test_strong_language_features_reach_band_seven_range(self) -> None:
        features = make_features(
            word_count=160,
            duration_seconds=90.0,
            mean_word_probability=0.9,
            low_confidence_ratio=0.05,
            speech_ratio=0.88,
            pause_ratio=0.08,
        )
        features.update({
            "connector_count": 6,
            "coverage_ratio": 0.95,
            "unique_ratio": 0.45,
            "long_word_ratio": 0.2,
            "repetition_ratio": 0.03,
            "avg_words_per_sentence": 13.5,
            "sentence_units": 12,
            "content_ratio": 0.6,
            "grammar_engine_available": 1,
            "grammar_error_density_per_100_words": 0.8,
            "grammar_error_count": 2,
            "grammar_complexity_score": 0.72,
            "grammar_subordinate_clause_count": 4,
            "grammar_tense_marker_variety": 4,
            "grammar_repeated_starter_ratio": 0.08,
            "lexical_sophistication_score": 0.66,
            "lexical_advanced_word_ratio": 0.18,
            "lexical_rare_word_ratio": 0.04,
            "lexical_common_word_ratio": 0.46,
            "lexical_repeated_content_ratio": 0.06,
            "lexical_mtld": 76.0,
            "lexical_hdd": 0.82,
        })
        evidence = make_evidence(
            acoustic=0.5,
            segmental=0.42,
            prosody=0.82,
            intelligibility=0.86,
            timing=0.5,
            phone_match=0.45,
            rhythm=0.82,
            stress=0.76,
            intonation=0.79,
            chunking=0.86,
            issue_count=5,
            risk_ratio=0.18,
        )

        bands = build_rule_rubric_bands(
            features=features,
            evidence=evidence,
            part_number=2,
            prompt_type="part2_long_turn",
            audio_quality=evidence.audio_quality,
            audio_backed=True,
        )

        self.assertGreaterEqual(bands["Fluency and Coherence"], 7.5)
        self.assertGreaterEqual(bands["Lexical Resource"], 7.5)
        self.assertGreaterEqual(bands["Grammatical Range and Accuracy"], 7.0)


if __name__ == "__main__":
    unittest.main()
