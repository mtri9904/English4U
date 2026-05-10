from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
import tempfile

from schemas import (
    SpeakingPauseStats,
    SpeakingPronunciationAnalysis,
    SpeakingPronunciationIssue,
    SpeakingWordTimestamp,
)
from settings import (
    SPEAKING_ALLOSAURUS_LANG,
    SPEAKING_ALLOSAURUS_MODEL,
    SPEAKING_MFA_ACOUSTIC_MODEL_PATH,
    SPEAKING_MFA_BINARY,
    SPEAKING_MFA_DICTIONARY_PATH,
    SPEAKING_PHONE_MATCH_THRESHOLD,
    SPEAKING_PITCH_CEILING_HZ,
    SPEAKING_PITCH_FLOOR_HZ,
    SPEAKING_PRONUNCIATION_STRICT,
    SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS,
)
from speaking.pronunciation_core import (
    build_actual_phoneme_proxy,
    build_expected_phoneme_profile,
    estimate_syllable_count,
    has_consonant_cluster,
    score_prosody_value,
)
from speaking.pronunciation_runtime import (
    build_mfa_subprocess_env,
    get_speaking_pronunciation_tool_status,
    is_mfa_binary_usable,
    pronunciation_requires_allosaurus,
    pronunciation_requires_mfa,
    pronunciation_requires_praat,
    raise_strict_pronunciation_error,
    resolve_mfa_binary_path,
    should_attempt_allosaurus_phone_recognition,
    should_attempt_mfa_alignment,
    should_attempt_praat_pitch,
)
from speaking.text_utils import (
    SPEAKING_STOPWORDS,
    extract_speaking_tokens,
    shorten_evidence_text,
)

allosaurus_recognizer_cache: dict[str, object] = {}


def score_phone_timing_issue_ratio(issue_ratio: float) -> float:
    return round(max(0.0, min(1.0, 1.0 - issue_ratio * 2.25)), 3)


def weighted_component_score(components: list[tuple[float | None, float]]) -> float | None:
    usable = [(float(score), weight) for score, weight in components if score is not None and weight > 0]
    if not usable:
        return None
    total_weight = sum(weight for _, weight in usable)
    return round(sum(score * weight for score, weight in usable) / total_weight, 3)


def average_component_score(values: list[float | None]) -> float | None:
    usable = [float(value) for value in values if value is not None]
    if not usable:
        return None
    return round(sum(usable) / len(usable), 3)


def score_intelligibility_from_features(features: dict[str, float | int | None]) -> float | None:
    mean_word_probability = features.get("mean_word_probability")
    if mean_word_probability is None:
        return None
    score = float(mean_word_probability)
    score -= min(0.35, float(features.get("low_confidence_ratio") or 0.0) * 0.55)
    speech_ratio = features.get("speech_ratio")
    if speech_ratio is not None and float(speech_ratio) < 0.55:
        score -= min(0.18, (0.55 - float(speech_ratio)) * 0.45)
    avg_no_speech_prob = features.get("avg_no_speech_prob")
    if avg_no_speech_prob is not None and float(avg_no_speech_prob) > 0.35:
        score -= min(0.16, (float(avg_no_speech_prob) - 0.35) * 0.4)
    return round(max(0.0, min(1.0, score)), 3)


def refresh_acoustic_pronunciation_score(analysis: SpeakingPronunciationAnalysis) -> None:
    segmental_components: list[tuple[float | None, float]] = []
    sources: list[str] = []

    if analysis.phone_timing_score is not None:
        segmental_components.append((analysis.phone_timing_score, 0.42))
        sources.append("mfa_phone_timing")

    if analysis.phone_match_score is not None and analysis.has_actual_phone_recognition:
        segmental_components.append((analysis.phone_match_score, 0.38))
        sources.append("allosaurus_phone_match")

    analysis.segmental_score = weighted_component_score(segmental_components)
    analysis.prosody_score = average_component_score([
        analysis.rhythm_score,
        analysis.stress_score,
        analysis.intonation_score,
        analysis.chunking_score,
    ])

    weighted_components: list[tuple[float | None, float]] = [
        (analysis.segmental_score, 0.80),
        (analysis.prosody_score, 0.20),
    ]
    if analysis.prosody_score is not None:
        sources.append("praat_prosody" if analysis.has_pitch_analysis else "timing_prosody")

    acoustic_score = weighted_component_score(weighted_components)
    if acoustic_score is None:
        analysis.acoustic_pronunciation_score = None
        analysis.acoustic_pronunciation_source = None
        return

    analysis.acoustic_pronunciation_score = acoustic_score
    analysis.acoustic_pronunciation_source = "+".join(dict.fromkeys(sources))


def analyze_pitch_with_parselmouth(audio_path: str) -> tuple[dict[str, float | str], str | None]:
    try:
        import parselmouth  # type: ignore
    except Exception as ex:
        return {}, f"Praat/Parselmouth pitch analysis is unavailable: {shorten_evidence_text(str(ex), max_length=120)}"

    try:
        sound = parselmouth.Sound(audio_path)
        pitch = sound.to_pitch(
            time_step=0.01,
            pitch_floor=SPEAKING_PITCH_FLOOR_HZ,
            pitch_ceiling=SPEAKING_PITCH_CEILING_HZ,
        )
        raw_values = pitch.selected_array["frequency"]
        pitch_values = [float(value) for value in raw_values if float(value) > 0]
    except Exception as ex:
        return {}, f"Praat/Parselmouth pitch analysis failed: {shorten_evidence_text(str(ex), max_length=120)}"

    if len(pitch_values) < 3:
        return {}, "Praat/Parselmouth found too few voiced frames for reliable pitch evidence."

    pitch_mean = sum(pitch_values) / len(pitch_values)
    pitch_min = min(pitch_values)
    pitch_max = max(pitch_values)
    pitch_variance = sum((value - pitch_mean) ** 2 for value in pitch_values) / len(pitch_values)
    pitch_cv = math.sqrt(pitch_variance) / pitch_mean if pitch_mean > 0 else 0.0
    return {
        "source": "praat_parselmouth",
        "pitch_mean_hz": round(pitch_mean, 1),
        "pitch_range_hz": round(pitch_max - pitch_min, 1),
        "pitch_variation_score": score_prosody_value(pitch_cv, ideal=0.22, tolerance=0.22),
    }, None


def parse_textgrid_quoted_value(line: str) -> str:
    value = line.split("=", 1)[1].strip() if "=" in line else ""
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1].replace('""', '"')
    return value


def parse_textgrid_intervals(textgrid_path: str, tier_names: set[str]) -> list[dict[str, float | str]]:
    intervals: list[dict[str, float | str]] = []
    tier_is_target = False
    current_interval: dict[str, float | str] | None = None
    normalized_tier_names = {name.lower() for name in tier_names}

    with open(textgrid_path, "r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line.startswith("item ["):
                tier_is_target = False
                current_interval = None
                continue
            if line.startswith("name ="):
                tier_name = parse_textgrid_quoted_value(line).strip().lower()
                tier_is_target = tier_name in normalized_tier_names
                current_interval = None
                continue
            if not tier_is_target:
                continue
            if line.startswith("intervals ["):
                current_interval = {}
                continue
            if current_interval is None:
                continue
            if line.startswith("xmin ="):
                try:
                    current_interval["start"] = float(line.split("=", 1)[1].strip())
                except ValueError:
                    current_interval["start"] = 0.0
                continue
            if line.startswith("xmax ="):
                try:
                    current_interval["end"] = float(line.split("=", 1)[1].strip())
                except ValueError:
                    current_interval["end"] = 0.0
                continue
            if line.startswith("text ="):
                current_interval["text"] = parse_textgrid_quoted_value(line)
                if "start" in current_interval and "end" in current_interval:
                    intervals.append(current_interval)
                current_interval = None

    return intervals


def interval_text(interval: dict[str, float | str]) -> str:
    return str(interval.get("text") or "").strip()


def is_alignment_silence_label(value: str) -> bool:
    return value.strip().lower() in {"", "sp", "sil", "silence", "<eps>", "<sil>"}


def find_textgrid_file(output_dir: str) -> str | None:
    for root, _, files in os.walk(output_dir):
        for filename in files:
            if filename.lower().endswith(".textgrid"):
                return os.path.join(root, filename)
    return None


def build_mfa_analysis_from_textgrid(textgrid_path: str, transcript: str) -> tuple[SpeakingPronunciationAnalysis | None, list[str]]:
    warnings = [
        "MFA forced alignment uses dictionary phones and timing; it is not independent phone recognition."
    ]
    word_intervals = parse_textgrid_intervals(textgrid_path, {"words", "word"})
    phone_intervals = parse_textgrid_intervals(textgrid_path, {"phones", "phone"})
    if not word_intervals or not phone_intervals:
        return None, ["MFA TextGrid did not contain usable word and phone tiers."]

    usable_words = [
        interval
        for interval in word_intervals
        if not is_alignment_silence_label(interval_text(interval))
    ]
    if not usable_words:
        return None, ["MFA TextGrid did not contain aligned spoken words."]

    issues: list[SpeakingPronunciationIssue] = []
    issue_count = 0
    timing_issue_count = 0
    aligned_word_count = 0
    for word_interval in usable_words:
        word_text = interval_text(word_interval)
        word_start = float(word_interval.get("start") or 0.0)
        word_end = float(word_interval.get("end") or 0.0)
        if word_end <= word_start:
            continue

        word_phone_intervals = [
            phone
            for phone in phone_intervals
            if not is_alignment_silence_label(interval_text(phone))
            and word_start <= ((float(phone.get("start") or 0.0) + float(phone.get("end") or 0.0)) / 2) <= word_end
        ]
        phone_labels = [interval_text(phone) for phone in word_phone_intervals]
        phone_sequence = " ".join(phone_labels)
        word_duration = word_end - word_start
        issue_type: str | None = None

        if not phone_labels:
            issue_type = "missing_phone_alignment"
        else:
            aligned_word_count += 1
            phone_durations = [
                max(0.0, float(phone.get("end") or 0.0) - float(phone.get("start") or 0.0))
                for phone in word_phone_intervals
            ]
            average_phone_duration = sum(phone_durations) / len(phone_durations) if phone_durations else 0.0
            syllable_count = estimate_syllable_count(word_text)
            if any(duration < 0.025 for duration in phone_durations) or word_duration < max(0.10, 0.07 * syllable_count):
                issue_type = "compressed_phone_timing"
            elif average_phone_duration > 0.22 or any(duration > 0.42 for duration in phone_durations):
                issue_type = "stretched_phone_timing"

        if issue_type is not None:
            issue_count += 1
            if issue_type in {"missing_phone_alignment", "compressed_phone_timing", "stretched_phone_timing"}:
                timing_issue_count += 1

        issues.append(SpeakingPronunciationIssue(
            word=word_text[:80],
            expected_phoneme=phone_sequence[:100] if phone_sequence else build_expected_phoneme_profile(word_text),
            actual_phoneme=(
                f"mfa_timing={phone_sequence};dur={word_duration:.2f}s" if phone_sequence else "mfa_timing=missing"
            )[:100],
            is_correct=issue_type is None,
            confidence=0.82,
            start=round(word_start, 2),
            end=round(word_end, 2),
            issue_type=issue_type or "aligned_phone_timing",
        ))

    issues = sorted(issues, key=lambda issue: (issue.is_correct is not False, issue.start or 0.0, issue.word))[:24]
    reference_word_count = max(len(extract_speaking_tokens(transcript)), len(usable_words), 1)
    risk_ratio = issue_count / reference_word_count
    timing_denominator = max(len(usable_words), aligned_word_count, 1)
    timing_issue_ratio = timing_issue_count / timing_denominator
    analysis = SpeakingPronunciationAnalysis(
        engine="mfa_forced_alignment_v1",
        has_word_timing=True,
        has_phoneme_alignment=True,
        alignment_source="montreal_forced_aligner",
        acoustic_source="mfa_acoustic_model",
        issue_count=issue_count,
        pronunciation_risk_ratio=round(risk_ratio, 3),
        phone_timing_score=score_phone_timing_issue_ratio(timing_issue_ratio),
        phone_timing_issue_ratio=round(timing_issue_ratio, 3),
        issues=issues,
        engine_warnings=warnings,
    )
    refresh_acoustic_pronunciation_score(analysis)
    return analysis, []


def run_mfa_forced_alignment(audio_path: str, transcript: str) -> tuple[SpeakingPronunciationAnalysis | None, list[str]]:
    warnings: list[str] = []
    if not SPEAKING_MFA_DICTIONARY_PATH or not SPEAKING_MFA_ACOUSTIC_MODEL_PATH:
        return None, ["MFA is enabled/requested but dictionary or acoustic model is not configured."]

    mfa_binary = resolve_mfa_binary_path()
    if not mfa_binary:
        return None, [f"MFA binary was not found: {SPEAKING_MFA_BINARY}."]
    if not is_mfa_binary_usable(mfa_binary):
        return None, [f"MFA binary is present but not usable: {mfa_binary}."]

    with tempfile.TemporaryDirectory(prefix="speaking_mfa_") as work_dir:
        corpus_dir = os.path.join(work_dir, "corpus")
        output_dir = os.path.join(work_dir, "aligned")
        mfa_temp_dir = os.path.join(work_dir, "mfa_temp")
        os.makedirs(corpus_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(mfa_temp_dir, exist_ok=True)
        utterance_audio_path = os.path.join(corpus_dir, "answer.wav")
        utterance_lab_path = os.path.join(corpus_dir, "answer.lab")
        shutil.copyfile(audio_path, utterance_audio_path)
        with open(utterance_lab_path, "w", encoding="utf-8") as handle:
            handle.write(re.sub(r"\s+", " ", transcript.strip()))

        command = [
            mfa_binary,
            "align",
            "--clean",
            "--overwrite",
            "--single_speaker",
            "--num_jobs",
            "1",
            "--temporary_directory",
            mfa_temp_dir,
            corpus_dir,
            SPEAKING_MFA_DICTIONARY_PATH,
            SPEAKING_MFA_ACOUSTIC_MODEL_PATH,
            output_dir,
        ]
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                env=build_mfa_subprocess_env(mfa_binary),
                timeout=SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS,
            )
        except Exception as ex:
            return None, [f"MFA forced alignment failed to run: {shorten_evidence_text(str(ex), max_length=140)}"]

        if completed.returncode != 0:
            detail = shorten_evidence_text((completed.stderr or completed.stdout or "unknown error").strip(), max_length=180)
            return None, [f"MFA forced alignment exited with code {completed.returncode}: {detail}"]

        textgrid_path = find_textgrid_file(output_dir)
        if textgrid_path is None:
            return None, ["MFA forced alignment completed but no TextGrid output was found."]

        analysis, parse_warnings = build_mfa_analysis_from_textgrid(textgrid_path, transcript)
        warnings.extend(parse_warnings)
        return analysis, warnings


def apply_pitch_metrics_to_pronunciation_analysis(
    analysis: SpeakingPronunciationAnalysis,
    pitch_metrics: dict[str, float | str],
) -> None:
    analysis.has_pitch_analysis = True
    analysis.acoustic_source = str(pitch_metrics.get("source") or analysis.acoustic_source or "praat_parselmouth")
    analysis.pitch_mean_hz = float(pitch_metrics["pitch_mean_hz"]) if "pitch_mean_hz" in pitch_metrics else None
    analysis.pitch_range_hz = float(pitch_metrics["pitch_range_hz"]) if "pitch_range_hz" in pitch_metrics else None
    analysis.pitch_variation_score = (
        float(pitch_metrics["pitch_variation_score"]) if "pitch_variation_score" in pitch_metrics else None
    )
    if analysis.pitch_variation_score is not None:
        analysis.intonation_score = analysis.pitch_variation_score
    refresh_acoustic_pronunciation_score(analysis)


def get_allosaurus_recognizer() -> object:
    cache_key = SPEAKING_ALLOSAURUS_MODEL
    if cache_key not in allosaurus_recognizer_cache:
        from allosaurus.app import read_recognizer  # type: ignore

        allosaurus_recognizer_cache[cache_key] = read_recognizer(cache_key)
    return allosaurus_recognizer_cache[cache_key]


def parse_allosaurus_phone_output(raw_output: str) -> list[dict[str, float | str]]:
    phones: list[dict[str, float | str]] = []
    for line in raw_output.splitlines():
        parts = line.strip().split()
        if not parts:
            continue
        if len(parts) >= 3:
            try:
                phones.append({
                    "start": float(parts[0]),
                    "end": float(parts[0]) + float(parts[1]),
                    "phone": parts[2],
                })
                continue
            except ValueError:
                pass
        for phone in parts:
            phones.append({"phone": phone})
    return phones


def run_allosaurus_phone_recognition(audio_path: str) -> tuple[list[dict[str, float | str]], str | None]:
    try:
        recognizer = get_allosaurus_recognizer()
        raw_output = recognizer.recognize(
            audio_path,
            SPEAKING_ALLOSAURUS_LANG,
            timestamp=True,
        )
    except Exception as ex:
        return [], f"Allosaurus actual phone recognition failed: {shorten_evidence_text(str(ex), max_length=160)}"

    phones = parse_allosaurus_phone_output(str(raw_output or ""))
    if not phones:
        return [], "Allosaurus actual phone recognition returned no phones."
    return phones, None


def phone_label_to_broad_class(label: str) -> str:
    explicit_class = label.strip().upper()
    if explicit_class in {"V", "P", "F", "N", "L", "A", "S", "C"}:
        return explicit_class
    normalized = re.sub(r"[0-9????\.\-_=;:,]+", "", label.lower()).strip()
    if not normalized:
        return "?"
    if normalized in {"sp", "sil", "silence", "<eps>", "<sil>"}:
        return "S"
    if re.search(r"[aeiou?????????????????]", normalized):
        return "V"
    if any(marker in normalized for marker in ("ch", "jh", "d?", "t?", "ts", "dz")):
        return "A"
    if any(marker in normalized for marker in ("s", "z", "?", "?", "?", "?", "f", "v", "h")):
        return "F"
    if any(marker in normalized for marker in ("p", "b", "t", "d", "k", "g", "?", "?")):
        return "P"
    if any(marker in normalized for marker in ("m", "n", "?")):
        return "N"
    if any(marker in normalized for marker in ("l", "r", "?", "?", "w", "j", "y")):
        return "L"
    return "C"


def build_expected_phone_classes_for_word(word: str) -> list[str]:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    classes: list[str] = []
    index = 0
    while index < len(cleaned):
        pair = cleaned[index:index + 2]
        char = cleaned[index]
        if pair in {"ch", "jh"}:
            current = "A"
            index += 2
        elif pair in {"sh", "th", "ph"}:
            current = "F"
            index += 2
        elif char in "aeiouy":
            current = "V"
            index += 1
        elif char in "pbtdkgcq":
            current = "P"
            index += 1
        elif char in "szfvhx":
            current = "F"
            index += 1
        elif char in "mn":
            current = "N"
            index += 1
        elif char in "lrwy":
            current = "L"
            index += 1
        else:
            current = "C"
            index += 1
        if not classes or classes[-1] != current:
            classes.append(current)
    return classes or ["C"]


def expected_phones_for_issue(issue: SpeakingPronunciationIssue) -> list[str]:
    expected_phones = (issue.expected_phoneme or "").split()
    if expected_phones and not any("=" in phone or ";" in phone for phone in expected_phones):
        return expected_phones
    return build_expected_phone_classes_for_word(issue.word)


def phone_sequence_similarity(expected_phones: list[str], actual_phones: list[str]) -> float:
    if not expected_phones or not actual_phones:
        return 0.0
    expected_classes = [phone_label_to_broad_class(phone) for phone in expected_phones]
    actual_classes = [phone_label_to_broad_class(phone) for phone in actual_phones]
    rows = len(expected_classes) + 1
    cols = len(actual_classes) + 1
    distances = [[0 for _ in range(cols)] for _ in range(rows)]
    for row in range(rows):
        distances[row][0] = row
    for col in range(cols):
        distances[0][col] = col
    for row in range(1, rows):
        for col in range(1, cols):
            substitution_cost = 0 if expected_classes[row - 1] == actual_classes[col - 1] else 1
            distances[row][col] = min(
                distances[row - 1][col] + 1,
                distances[row][col - 1] + 1,
                distances[row - 1][col - 1] + substitution_cost,
            )
    edit_distance = distances[-1][-1]
    return round(max(0.0, 1.0 - edit_distance / max(len(expected_classes), len(actual_classes), 1)), 3)


def phones_for_time_window(
    phones: list[dict[str, float | str]],
    start: float | None,
    end: float | None,
) -> list[str]:
    if start is None or end is None or end <= start:
        return []
    return [
        str(phone["phone"])
        for phone in phones
        if "start" in phone
        and "end" in phone
        and start <= ((float(phone["start"]) + float(phone["end"])) / 2) <= end
    ]


def apply_actual_phone_recognition_to_analysis(
    analysis: SpeakingPronunciationAnalysis,
    actual_phones: list[dict[str, float | str]],
) -> None:
    all_phone_labels = [str(phone.get("phone") or "") for phone in actual_phones if phone.get("phone")]
    analysis.has_actual_phone_recognition = True
    analysis.actual_phone_source = f"allosaurus:{SPEAKING_ALLOSAURUS_MODEL}:{SPEAKING_ALLOSAURUS_LANG}"
    if not all_phone_labels:
        analysis.phone_match_score = 0.0
        return

    row_scores: list[float] = []
    mismatch_count = 0
    for issue in analysis.issues:
        if issue.start is None or issue.end is None:
            continue
        expected_phones = expected_phones_for_issue(issue)
        if not expected_phones:
            continue
        actual_window_phones = phones_for_time_window(actual_phones, issue.start, issue.end)
        if not actual_window_phones:
            continue
        similarity = phone_sequence_similarity(expected_phones, actual_window_phones)
        row_scores.append(similarity)
        expected_text = " ".join(expected_phones)
        if not issue.expected_phoneme or "=" in issue.expected_phoneme or ";" in issue.expected_phoneme:
            issue.expected_phoneme = expected_text[:100]
        issue.actual_phoneme = (
            f"allosaurus={' '.join(actual_window_phones)};expected={expected_text};match={similarity:.2f}"
        )[:100]
        issue.confidence = round(max(issue.confidence or 0.0, 0.78), 3)
        if similarity < SPEAKING_PHONE_MATCH_THRESHOLD:
            if issue.is_correct is not False:
                mismatch_count += 1
            issue.is_correct = False
            issue.issue_type = "actual_phone_mismatch"

    analysis.phone_match_score = round(sum(row_scores) / len(row_scores), 3) if row_scores else None
    if mismatch_count:
        analysis.issue_count += mismatch_count
        reference_count = max(len(analysis.issues), 1)
        analysis.pronunciation_risk_ratio = round(min(1.0, analysis.issue_count / reference_count), 3)
    refresh_acoustic_pronunciation_score(analysis)


def enhance_speaking_pronunciation_analysis(
    analysis: SpeakingPronunciationAnalysis,
    *,
    audio_path: str | None,
    transcript: str | None,
) -> SpeakingPronunciationAnalysis:
    warnings: list[str] = []
    strict_errors: list[str] = []
    pitch_metrics: dict[str, float | str] = {}
    has_ratable_transcript = bool(transcript and len(extract_speaking_tokens(transcript)) >= 3)
    base_rhythm_score = analysis.rhythm_score
    base_stress_score = analysis.stress_score
    base_chunking_score = analysis.chunking_score
    base_intelligibility_score = analysis.intelligibility_score

    if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and not audio_path:
        strict_errors.append("Strict pronunciation scoring requires candidate audio; transcript-only scoring is not allowed.")

    if should_attempt_praat_pitch(audio_path):
        pitch_metrics, pitch_warning = analyze_pitch_with_parselmouth(audio_path or "")
        if pitch_warning:
            warnings.append(pitch_warning)
            if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_praat():
                strict_errors.append(pitch_warning)
        if pitch_metrics:
            apply_pitch_metrics_to_pronunciation_analysis(analysis, pitch_metrics)
    elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_praat():
        strict_errors.append("Praat/Parselmouth pitch analysis is required but is disabled, unavailable, or missing audio.")

    if should_attempt_mfa_alignment(audio_path, transcript):
        mfa_analysis, mfa_warnings = run_mfa_forced_alignment(audio_path or "", transcript or "")
        warnings.extend(mfa_warnings)
        if mfa_analysis is not None:
            analysis = mfa_analysis
            analysis.rhythm_score = base_rhythm_score
            analysis.stress_score = base_stress_score
            analysis.chunking_score = base_chunking_score
            analysis.intelligibility_score = base_intelligibility_score
            if pitch_metrics:
                apply_pitch_metrics_to_pronunciation_analysis(analysis, pitch_metrics)
        elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_mfa():
            strict_errors.extend(mfa_warnings or ["MFA forced phoneme alignment is required but did not produce alignment."])
    elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_mfa():
        strict_errors.append("MFA forced phoneme alignment is required but is disabled, unavailable, or missing audio/transcript.")

    if should_attempt_allosaurus_phone_recognition(audio_path):
        actual_phones, allosaurus_warning = run_allosaurus_phone_recognition(audio_path or "")
        if allosaurus_warning:
            warnings.append(allosaurus_warning)
            if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_allosaurus():
                strict_errors.append(allosaurus_warning)
        elif actual_phones:
            apply_actual_phone_recognition_to_analysis(analysis, actual_phones)
    elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_allosaurus():
        strict_errors.append("Allosaurus actual phone recognition is required but is disabled, unavailable, or missing audio.")

    if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT:
        if pronunciation_requires_praat() and not analysis.has_pitch_analysis:
            strict_errors.append("Required Praat pitch/intonation evidence is missing.")
        if pronunciation_requires_mfa() and not analysis.has_phoneme_alignment:
            strict_errors.append("Required MFA forced phoneme alignment evidence is missing.")
        if pronunciation_requires_allosaurus() and not analysis.has_actual_phone_recognition:
            strict_errors.append("Required Allosaurus actual phone recognition evidence is missing.")
        raise_strict_pronunciation_error(list(dict.fromkeys(strict_errors)))

    refresh_acoustic_pronunciation_score(analysis)
    analysis.engine_warnings.extend(warnings)
    return analysis


def build_speaking_pronunciation_analysis(
    *,
    word_timestamps: list[SpeakingWordTimestamp],
    pause_stats: SpeakingPauseStats,
    features: dict[str, float | int | None],
    audio_path: str | None = None,
    transcript: str | None = None,
) -> SpeakingPronunciationAnalysis:
    timed_words = [
        word
        for word in word_timestamps
        if word.word and word.start is not None and word.end is not None and word.end > word.start
    ]
    if not timed_words:
        analysis = SpeakingPronunciationAnalysis(
            engine="asr_word_timing_phoneme_proxy_v2",
            has_word_timing=False,
            has_phoneme_alignment=False,
            alignment_source="none",
            intelligibility_score=score_intelligibility_from_features(features),
        )
        return enhance_speaking_pronunciation_analysis(
            analysis,
            audio_path=audio_path,
            transcript=transcript,
        )

    durations = [float(word.end - word.start) for word in timed_words]
    mean_duration = sum(durations) / len(durations)
    duration_variance = sum((duration - mean_duration) ** 2 for duration in durations) / len(durations)
    duration_cv = math.sqrt(duration_variance) / mean_duration if mean_duration > 0 else 0.0
    rhythm_score = score_prosody_value(duration_cv, ideal=0.55, tolerance=0.75)

    content_durations = []
    function_durations = []
    for word, duration in zip(timed_words, durations):
        cleaned = re.sub(r"[^a-z']", "", word.word.lower())
        if not cleaned:
            continue
        if cleaned in SPEAKING_STOPWORDS:
            function_durations.append(duration)
        else:
            content_durations.append(duration)

    stress_score: float | None = None
    if content_durations and function_durations:
        content_average = sum(content_durations) / len(content_durations)
        function_average = sum(function_durations) / len(function_durations)
        if function_average > 0:
            stress_ratio = content_average / function_average
            stress_score = score_prosody_value(stress_ratio, ideal=1.35, tolerance=0.9)

    duration_seconds = features.get("duration_seconds")
    pause_ratio = float(features.get("pause_ratio") or 0.0)
    long_pause_penalty = min(0.45, pause_stats.long_pause_count * 0.08)
    pause_ratio_penalty = min(0.45, max(0.0, pause_ratio - 0.12) * 1.4)
    chunking_score = round(max(0.0, min(1.0, 1.0 - long_pause_penalty - pause_ratio_penalty)), 3)

    risk_issues: list[SpeakingPronunciationIssue] = []
    reference_rows: list[SpeakingPronunciationIssue] = []
    for word in timed_words:
        cleaned = re.sub(r"[^a-z']", "", word.word.lower()).strip("'")
        if not cleaned:
            continue

        probability = word.probability
        duration = float(word.end - word.start) if word.start is not None and word.end is not None else None
        syllable_count = estimate_syllable_count(cleaned)
        issue_type: str | None = None

        if probability is not None and probability < 0.5:
            issue_type = "low_asr_confidence"
        elif duration is not None and duration < max(0.07, 0.075 * syllable_count):
            issue_type = "compressed_word_timing"
        elif has_consonant_cluster(cleaned) and probability is not None and probability < 0.72:
            issue_type = "consonant_cluster_risk"
        elif cleaned.endswith(("p", "t", "k", "b", "d", "g", "s", "z", "sh", "ch", "x", "f", "v", "th")) and probability is not None and probability < 0.72:
            issue_type = "final_consonant_risk"
        elif len(cleaned) >= 8 and duration is not None and duration / syllable_count < 0.11:
            issue_type = "reduced_multisyllable_risk"

        row = SpeakingPronunciationIssue(
            word=word.word.strip()[:80],
            expected_phoneme=" ".join(build_expected_phone_classes_for_word(cleaned)),
            actual_phoneme=build_actual_phoneme_proxy(
                probability=probability,
                duration_seconds=duration,
                issue_type=issue_type,
            ),
            is_correct=issue_type is None,
            confidence=round(float(probability), 3) if probability is not None else None,
            start=word.start,
            end=word.end,
            issue_type=issue_type or "word_timing_reference",
        )
        if issue_type is None:
            if cleaned not in SPEAKING_STOPWORDS and len(cleaned) >= 3:
                reference_rows.append(row)
            continue
        risk_issues.append(row)

    risk_issues = sorted(
        risk_issues,
        key=lambda issue: (issue.confidence if issue.confidence is not None else 1.0, issue.start or 0.0),
    )
    reference_rows = sorted(
        reference_rows,
        key=lambda issue: (issue.start or 0.0, issue.word),
    )
    evidence_rows = (risk_issues[:16] + reference_rows[: max(0, 24 - len(risk_issues[:16]))])[:24]
    risk_ratio = len(risk_issues) / max(len(timed_words), 1)

    analysis = SpeakingPronunciationAnalysis(
        engine="asr_word_timing_phoneme_proxy_v2",
        has_word_timing=True,
        has_phoneme_alignment=False,
        alignment_source="faster_whisper_word_timing",
        acoustic_source="faster_whisper",
        issue_count=len(risk_issues),
        pronunciation_risk_ratio=round(risk_ratio, 3),
        rhythm_score=rhythm_score,
        stress_score=stress_score,
        intonation_score=None,
        chunking_score=chunking_score,
        intelligibility_score=score_intelligibility_from_features(features),
        issues=evidence_rows,
    )
    refresh_acoustic_pronunciation_score(analysis)
    return enhance_speaking_pronunciation_analysis(
        analysis,
        audio_path=audio_path,
        transcript=transcript,
    )
