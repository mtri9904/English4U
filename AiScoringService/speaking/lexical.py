from __future__ import annotations

from collections import Counter

from runtime_utils import get_python_module_status
from schemas import SpeakingLexicalAnalysis
from speaking.text_utils import SPEAKING_STOPWORDS, extract_speaking_tokens


def calculate_lexical_sophistication_score(
    *,
    lexical_density: float,
    type_token_ratio: float,
    advanced_word_ratio: float,
    rare_word_ratio: float,
    mtld: float | None,
) -> float:
    score = 0.0
    score += min(0.28, max(0.0, (lexical_density - 0.42) / 0.28) * 0.28)
    score += min(0.24, max(0.0, (type_token_ratio - 0.45) / 0.25) * 0.24)
    score += min(0.28, advanced_word_ratio * 1.65)
    score -= min(0.12, rare_word_ratio * 1.2)
    if mtld is not None:
        score += min(0.2, max(0.0, (mtld - 35.0) / 65.0) * 0.2)
    return round(max(0.0, min(1.0, score)), 3)


def analyze_speaking_lexical(text: str) -> SpeakingLexicalAnalysis:
    tokens = extract_speaking_tokens(text)
    word_count = len(tokens)
    unique_count = len(set(tokens))
    content_tokens = [token for token in tokens if token not in SPEAKING_STOPWORDS]
    lexical_density = len(content_tokens) / word_count if word_count else 0.0
    type_token_ratio = unique_count / word_count if word_count else 0.0

    repeated_content_count = 0
    if content_tokens:
        content_counts = Counter(content_tokens)
        repeated_content_count = sum(count - 1 for count in content_counts.values() if count > 1)
    repeated_content_ratio = repeated_content_count / max(len(content_tokens), 1)

    wordfreq_status = get_python_module_status("wordfreq")
    lexicalrichness_status = get_python_module_status("lexicalrichness")
    warnings: list[str] = []
    if not wordfreq_status["available"]:
        warnings.append(f"wordfreq unavailable: {wordfreq_status['error']}")
    if not lexicalrichness_status["available"]:
        warnings.append(f"lexicalrichness unavailable: {lexicalrichness_status['error']}")

    avg_zipf_frequency: float | None = None
    advanced_word_ratio = 0.0
    rare_word_ratio = 0.0
    common_word_ratio = 0.0
    if wordfreq_status["available"] and content_tokens:
        try:
            from wordfreq import zipf_frequency  # type: ignore

            frequencies = [float(zipf_frequency(token, "en")) for token in content_tokens]
            known_frequencies = [value for value in frequencies if value > 0.0]
            if known_frequencies:
                avg_zipf_frequency = round(sum(known_frequencies) / len(known_frequencies), 3)
                advanced_word_ratio = sum(1 for value in known_frequencies if 3.0 <= value < 4.5) / len(known_frequencies)
                rare_word_ratio = sum(1 for value in known_frequencies if value < 3.0) / len(known_frequencies)
                common_word_ratio = sum(1 for value in known_frequencies if value >= 5.0) / len(known_frequencies)
        except Exception as ex:
            warnings.append(f"wordfreq failed: {type(ex).__name__}: {ex}")

    mtld: float | None = None
    hdd: float | None = None
    if lexicalrichness_status["available"] and word_count >= 10:
        try:
            from lexicalrichness import LexicalRichness  # type: ignore

            richness = LexicalRichness(" ".join(tokens))
            mtld = round(float(richness.mtld(threshold=0.72)), 3)
            hdd_draws = min(42, max(2, word_count // 2))
            hdd = round(float(richness.hdd(draws=hdd_draws)), 3)
        except Exception as ex:
            warnings.append(f"lexicalrichness failed: {type(ex).__name__}: {ex}")

    sophistication_score = calculate_lexical_sophistication_score(
        lexical_density=lexical_density,
        type_token_ratio=type_token_ratio,
        advanced_word_ratio=advanced_word_ratio,
        rare_word_ratio=rare_word_ratio,
        mtld=mtld,
    )
    return SpeakingLexicalAnalysis(
        engine="wordfreq_lexicalrichness_v1",
        is_available=bool(wordfreq_status["available"] or lexicalrichness_status["available"]),
        word_count=word_count,
        unique_word_count=unique_count,
        lexical_density=round(lexical_density, 3),
        type_token_ratio=round(type_token_ratio, 3),
        advanced_word_ratio=round(advanced_word_ratio, 3),
        rare_word_ratio=round(rare_word_ratio, 3),
        common_word_ratio=round(common_word_ratio, 3),
        avg_zipf_frequency=avg_zipf_frequency,
        mtld=mtld,
        hdd=hdd,
        repeated_content_ratio=round(repeated_content_ratio, 3),
        sophistication_score=sophistication_score,
        warnings=warnings,
    )


def build_lexical_feature_map(analysis: SpeakingLexicalAnalysis) -> dict[str, float | int | None]:
    return {
        "lexical_engine_available": 1 if analysis.is_available else 0,
        "lexical_density": analysis.lexical_density,
        "lexical_type_token_ratio": analysis.type_token_ratio,
        "lexical_advanced_word_ratio": analysis.advanced_word_ratio,
        "lexical_rare_word_ratio": analysis.rare_word_ratio,
        "lexical_common_word_ratio": analysis.common_word_ratio,
        "lexical_avg_zipf_frequency": analysis.avg_zipf_frequency,
        "lexical_mtld": analysis.mtld,
        "lexical_hdd": analysis.hdd,
        "lexical_repeated_content_ratio": analysis.repeated_content_ratio,
        "lexical_sophistication_score": analysis.sophistication_score,
        "lexical_warning_count": len(analysis.warnings),
    }
