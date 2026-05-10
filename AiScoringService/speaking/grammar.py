from __future__ import annotations

import json
import re
import time
from collections import Counter
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from schemas import SpeakingGrammarAnalysis, SpeakingGrammarIssue
from settings import (
    LANGUAGETOOL_ENABLED,
    LANGUAGETOOL_LANGUAGE,
    LANGUAGETOOL_TIMEOUT_SECONDS,
    LANGUAGETOOL_UNAVAILABLE_COOLDOWN_SECONDS,
    LANGUAGETOOL_URL,
)
from speaking.text_utils import shorten_evidence_text


languagetool_unavailable_until = 0.0

SUBORDINATE_MARKERS = (
    "because",
    "although",
    "though",
    "even though",
    "when",
    "while",
    "if",
    "unless",
    "since",
    "whereas",
    "before",
    "after",
    "which",
    "that",
    "who",
    "where",
)

MODAL_VERBS = {
    "can",
    "could",
    "may",
    "might",
    "must",
    "shall",
    "should",
    "will",
    "would",
}

BE_VERBS = {"am", "is", "are", "was", "were", "be", "been", "being"}
HAVE_VERBS = {"have", "has", "had"}


def extract_grammar_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def split_grammar_units(text: str, tokens: list[str]) -> list[list[str]]:
    raw_units = [
        extract_grammar_tokens(unit)
        for unit in re.split(r"[.!?;]+", text)
        if unit.strip()
    ]
    units = [unit for unit in raw_units if unit]
    if units:
        return units
    return [tokens] if tokens else []


def count_marker_phrases(text: str, markers: tuple[str, ...]) -> int:
    normalized = f" {re.sub(r'[^a-z]+', ' ', text.lower())} "
    return sum(
        len(re.findall(rf"(?<![a-z]){re.escape(marker)}(?![a-z])", normalized))
        for marker in markers
    )


def count_tense_marker_variety(tokens: list[str]) -> int:
    markers: set[str] = set()
    token_set = set(tokens)
    if any(token.endswith("ed") for token in tokens):
        markers.add("regular_past")
    if any(token in {"went", "saw", "made", "took", "came", "became", "thought", "felt", "bought"} for token in tokens):
        markers.add("irregular_past")
    if "will" in token_set or ("going" in token_set and "to" in token_set):
        markers.add("future")
    if any(token in HAVE_VERBS for token in tokens) and any(token.endswith(("ed", "en")) for token in tokens):
        markers.add("perfect")
    for previous, current in zip(tokens, tokens[1:]):
        if previous in BE_VERBS and current.endswith(("ed", "en")):
            markers.add("passive")
            break
    if any(token in {"would", "could", "should", "might"} for token in tokens):
        markers.add("conditional_or_modal")
    return len(markers)


def build_grammar_complexity_metrics(transcript: str, *, word_count: int) -> dict[str, float | int | None]:
    tokens = extract_grammar_tokens(transcript)
    if not tokens or word_count <= 0:
        return {
            "complexity_score": None,
            "complex_sentence_ratio": None,
            "subordinate_clause_count": 0,
            "modal_verb_count": 0,
            "tense_marker_variety": 0,
            "repeated_starter_ratio": None,
        }

    units = split_grammar_units(transcript, tokens)
    unit_count = max(1, len(units))
    subordinate_clause_count = count_marker_phrases(transcript, SUBORDINATE_MARKERS)
    modal_verb_count = sum(1 for token in tokens if token in MODAL_VERBS)
    tense_marker_variety = count_tense_marker_variety(tokens)
    complex_units = [
        unit
        for unit in units
        if len(unit) >= 10 and any(marker in unit for marker in SUBORDINATE_MARKERS)
    ]
    complex_sentence_ratio = len(complex_units) / unit_count

    starters = [unit[0] for unit in units if unit]
    starter_counts = Counter(starters)
    repeated_starter_ratio = (
        (sum(count - 1 for count in starter_counts.values() if count > 1) / max(len(starters) - 1, 1))
        if len(starters) > 1
        else 0.0
    )
    avg_unit_length = word_count / unit_count

    complexity_score = 0.0
    if avg_unit_length >= 14:
        complexity_score += 0.25
    elif avg_unit_length >= 9:
        complexity_score += 0.16
    elif avg_unit_length >= 6:
        complexity_score += 0.08
    complexity_score += min(0.3, subordinate_clause_count * 0.08)
    complexity_score += min(0.2, tense_marker_variety * 0.04)
    complexity_score += min(0.15, modal_verb_count * 0.03)
    complexity_score += min(0.1, complex_sentence_ratio * 0.2)
    complexity_score -= min(0.15, repeated_starter_ratio * 0.15)

    return {
        "complexity_score": round(max(0.0, min(1.0, complexity_score)), 3),
        "complex_sentence_ratio": round(complex_sentence_ratio, 3),
        "subordinate_clause_count": subordinate_clause_count,
        "modal_verb_count": modal_verb_count,
        "tense_marker_variety": tense_marker_variety,
        "repeated_starter_ratio": round(repeated_starter_ratio, 3),
    }


def apply_grammar_complexity_metrics(
    analysis: SpeakingGrammarAnalysis,
    transcript: str,
    *,
    word_count: int,
) -> SpeakingGrammarAnalysis:
    metrics = build_grammar_complexity_metrics(transcript, word_count=word_count)
    analysis.complexity_score = metrics["complexity_score"] if isinstance(metrics["complexity_score"], float) else None
    analysis.complex_sentence_ratio = (
        metrics["complex_sentence_ratio"] if isinstance(metrics["complex_sentence_ratio"], float) else None
    )
    analysis.subordinate_clause_count = int(metrics["subordinate_clause_count"] or 0)
    analysis.modal_verb_count = int(metrics["modal_verb_count"] or 0)
    analysis.tense_marker_variety = int(metrics["tense_marker_variety"] or 0)
    analysis.repeated_starter_ratio = (
        metrics["repeated_starter_ratio"] if isinstance(metrics["repeated_starter_ratio"], float) else None
    )
    return analysis


def get_languagetool_issue_weight(category: str | None, issue_type: str | None) -> float:
    category_id = (category or "").upper()
    issue = (issue_type or "").lower()

    if category_id == "GRAMMAR" or issue == "grammar":
        return 1.0
    if category_id in {"CONFUSED_WORDS", "COLLOCATIONS"}:
        return 0.85
    if category_id in {"TYPOS", "MISSPELLING"} or issue == "misspelling":
        # ASR may spell proper nouns incorrectly, so spelling has weaker grammar weight.
        return 0.4
    if category_id in {"PUNCTUATION", "CASING", "TYPOGRAPHY"}:
        # Speaking transcripts are ASR-generated, so punctuation/casing is weak evidence.
        return 0.1
    if category_id in {"STYLE", "REDUNDANCY"}:
        return 0.25
    return 0.5


def build_languagetool_issue(match: dict) -> SpeakingGrammarIssue | None:
    rule = match.get("rule") if isinstance(match.get("rule"), dict) else {}
    category = rule.get("category") if isinstance(rule.get("category"), dict) else {}
    context = match.get("context") if isinstance(match.get("context"), dict) else {}
    replacements_raw = match.get("replacements") if isinstance(match.get("replacements"), list) else []
    replacements = [
        shorten_evidence_text(item.get("value"), max_length=40)
        for item in replacements_raw
        if isinstance(item, dict) and item.get("value")
    ][:3]

    message = shorten_evidence_text(match.get("message"), max_length=120)
    if not message:
        return None

    matched_text = None
    context_text = context.get("text") if isinstance(context.get("text"), str) else None
    context_offset = context.get("offset")
    context_length = context.get("length")
    if context_text and isinstance(context_offset, int) and isinstance(context_length, int) and context_length > 0:
        matched_text = context_text[context_offset:context_offset + context_length]
    if not matched_text:
        offset = match.get("offset")
        length = match.get("length")
        if isinstance(offset, int) and isinstance(length, int) and length > 0:
            matched_text = context_text[offset:offset + length] if context_text else None

    category_id = category.get("id") if isinstance(category.get("id"), str) else None
    issue_type = rule.get("issueType") if isinstance(rule.get("issueType"), str) else None
    return SpeakingGrammarIssue(
        rule_id=rule.get("id") if isinstance(rule.get("id"), str) else None,
        category=category_id,
        issue_type=issue_type,
        message=message,
        matched_text=shorten_evidence_text(matched_text, max_length=45) if matched_text else None,
        offset=match.get("offset") if isinstance(match.get("offset"), int) else None,
        length=match.get("length") if isinstance(match.get("length"), int) else None,
        replacements=replacements,
        weight=get_languagetool_issue_weight(category_id, issue_type),
    )


def analyze_speaking_grammar_with_languagetool(
    transcript: str,
    *,
    word_count: int,
) -> SpeakingGrammarAnalysis:
    global languagetool_unavailable_until

    analysis = SpeakingGrammarAnalysis(
        language=LANGUAGETOOL_LANGUAGE,
        is_available=False,
    )
    apply_grammar_complexity_metrics(analysis, transcript, word_count=word_count)
    if not LANGUAGETOOL_ENABLED:
        analysis.engine = "disabled"
        analysis.warnings.append("LanguageTool is disabled; grammar scoring used complexity features only.")
        return analysis
    if not LANGUAGETOOL_URL:
        analysis.engine = "not_configured"
        analysis.warnings.append("LanguageTool URL is not configured; grammar scoring used complexity features only.")
        return analysis
    if word_count < 5:
        analysis.engine = "skipped_short_answer"
        analysis.warnings.append("Answer is too short for reliable LanguageTool grammar analysis.")
        return analysis

    now = time.time()
    if now < languagetool_unavailable_until:
        analysis.engine = "temporarily_unavailable"
        analysis.warnings.append("LanguageTool was recently unavailable; grammar scoring used complexity features only.")
        return analysis

    payload = urlencode({
        "text": transcript[:10000],
        "language": LANGUAGETOOL_LANGUAGE,
        "enabledOnly": "false",
    }).encode("utf-8")
    request = Request(
        LANGUAGETOOL_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=LANGUAGETOOL_TIMEOUT_SECONDS) as response:
            raw = response.read()
        data = json.loads(raw.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as ex:
        languagetool_unavailable_until = time.time() + LANGUAGETOOL_UNAVAILABLE_COOLDOWN_SECONDS
        analysis.engine = "unavailable"
        analysis.warnings.append(f"LanguageTool unavailable: {shorten_evidence_text(str(ex), max_length=120)}")
        return analysis

    matches = data.get("matches") if isinstance(data, dict) else None
    if not isinstance(matches, list):
        analysis.engine = "invalid_response"
        analysis.warnings.append("LanguageTool returned an invalid response; grammar scoring used complexity features only.")
        return analysis

    issues = [
        issue
        for issue in (build_languagetool_issue(match) for match in matches if isinstance(match, dict))
        if issue is not None
    ]
    category_counts = Counter(issue.category or "UNKNOWN" for issue in issues)
    weighted_error_count = sum(issue.weight for issue in issues)
    analysis = SpeakingGrammarAnalysis(
        engine="languagetool_http",
        language=LANGUAGETOOL_LANGUAGE,
        is_available=True,
        error_count=len(issues),
        weighted_error_count=round(weighted_error_count, 2),
        error_density_per_100_words=round((weighted_error_count / max(word_count, 1)) * 100, 2),
        category_counts=dict(category_counts),
        issues=issues[:12],
    )
    return apply_grammar_complexity_metrics(analysis, transcript, word_count=word_count)


def build_grammar_feature_map(
    analysis: SpeakingGrammarAnalysis,
) -> dict[str, float | int | None]:
    return {
        "grammar_engine_available": 1 if analysis.is_available else 0,
        "grammar_error_count": analysis.error_count,
        "grammar_weighted_error_count": analysis.weighted_error_count,
        "grammar_error_density_per_100_words": analysis.error_density_per_100_words,
        "grammar_complexity_score": analysis.complexity_score,
        "grammar_complex_sentence_ratio": analysis.complex_sentence_ratio,
        "grammar_subordinate_clause_count": analysis.subordinate_clause_count,
        "grammar_modal_verb_count": analysis.modal_verb_count,
        "grammar_tense_marker_variety": analysis.tense_marker_variety,
        "grammar_repeated_starter_ratio": analysis.repeated_starter_ratio,
        "grammar_warning_count": len(analysis.warnings),
    }


def build_grammar_category_summary(analysis: SpeakingGrammarAnalysis) -> str | None:
    if not analysis.category_counts:
        return None
    ordered = sorted(analysis.category_counts.items(), key=lambda item: item[1], reverse=True)
    return ",".join(f"{category}:{count}" for category, count in ordered[:4])


def build_grammar_issue_evidence(analysis: SpeakingGrammarAnalysis, *, limit: int = 3) -> list[str]:
    evidence: list[str] = []
    for index, issue in enumerate(analysis.issues[:limit], start=1):
        replacement = f" -> {issue.replacements[0]}" if issue.replacements else ""
        matched_text = f"'{issue.matched_text}'" if issue.matched_text else issue.rule_id or "issue"
        category = issue.category or issue.issue_type or "grammar"
        evidence.append(
            f"issue{index}={category}:{matched_text}{replacement} ({issue.message})"
        )
    return evidence
