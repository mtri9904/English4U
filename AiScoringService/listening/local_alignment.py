from __future__ import annotations

import re
from typing import Literal

from listening.alignment import (
    build_alignment_token_variants,
    extract_alignment_tokens,
    find_scope_for_question,
    find_section_scope_for_question,
    get_question_part_range,
    normalize_alignment_text,
)
from schemas import (
    ListeningAlignmentQuestion,
    ListeningTranscriptQuestionAlignment,
    ListeningTranscriptSegment,
)

MAP_LOCATION_CUE_PHRASES = [
    "you ll see",
    "you can see",
    "if you want to go to",
    "walk along",
    "you ll come to",
    "the last thing to mention is",
    "there s a covered picnic",
    "there s one near",
    "if you take the side path",
    "cross the bridge",
    "that goes to the house",
    "the building was originally",
]

MAP_LOCATION_TOKENS = {
    "maze",
    "cafe",
    "barn",
    "house",
    "bridge",
    "picnic",
    "scarecrow",
    "path",
    "field",
    "yard",
    "pool",
    "car",
    "park",
    "schoolhouse",
    "workshop",
    "workshops",
    "farmyard",
}


ALIGNMENT_STOPWORDS = {
    "the", "and", "that", "this", "with", "from", "into", "your", "their", "there", "about", "would", "could",
    "should", "have", "has", "had", "were", "was", "been", "being", "while", "where", "when", "which", "what",
    "then", "than", "them", "they", "those", "these", "just", "also", "only", "more", "most", "very",
    "much", "many", "some", "such", "over", "under", "after", "before", "because", "through", "during", "between",
    "each", "other", "another", "into", "onto", "upon", "across", "around", "within", "without", "against", "among",
    "student", "students", "answer", "question", "questions", "listening", "part", "section",
}

ALIGNMENT_INTRO_PHRASES = [
    "i ll tell you something about",
    "let s look at",
    "a word about",
    "before you hear",
    "now listen",
    "listen carefully",
    "you will hear",
    "first you have some time",
    "you have some time to look at",
    "now turn to section",
    "that is the end of section",
    "you now have half a minute",
    "hi great to see you",
    "i m jodi",
    "i ll be looking after both of you",
]


def split_alignment_answer_candidates(value: str | None) -> list[str]:
    return [
        candidate
        for candidate in (normalize_alignment_text(item) for item in (value or "").split("|"))
        if len(candidate) >= 2
    ]


def get_alignment_answer_candidates(question: ListeningAlignmentQuestion) -> list[str]:
    candidates = split_alignment_answer_candidates(question.correct_answer)
    candidates.extend(
        candidate
        for candidate in (normalize_alignment_text(item) for item in question.correct_option_texts)
        if len(candidate) >= 2
    )
    return list(dict.fromkeys(candidates))


def get_alignment_evidence_tokens(question: ListeningAlignmentQuestion) -> list[str]:
    tokens: set[str] = set()

    for candidate in get_alignment_answer_candidates(question):
        tokens.update(extract_alignment_tokens(candidate))

    for option_text in question.correct_option_texts or []:
        tokens.update(extract_alignment_tokens(option_text))

    return [
        token
        for token in tokens
        if len(token) >= 3 and token not in ALIGNMENT_STOPWORDS
    ]


def get_alignment_keyword_tokens(question: ListeningAlignmentQuestion) -> list[str]:
    question_tokens = [
        token
        for token in extract_alignment_tokens(question.question_text)
        if len(token) >= 3 and token not in ALIGNMENT_STOPWORDS
    ]

    if len(question_tokens) >= 2:
        return question_tokens

    fallback_tokens = [
        token
        for token in extract_alignment_tokens(question.context_text)
        if len(token) >= 3 and token not in ALIGNMENT_STOPWORDS
    ]

    return list(dict.fromkeys([*question_tokens, *fallback_tokens]))


def get_alignment_anchor_phrases(question: ListeningAlignmentQuestion) -> list[str]:
    phrases: list[str] = []

    for source in [question.question_text or "", question.context_text or ""]:
        if not source.strip():
            continue

        for line in source.splitlines():
            normalized_line = normalize_alignment_text(line)
            if not normalized_line or len(normalized_line) < 3:
                continue

            phrases.append(normalized_line)

        normalized_source = normalize_alignment_text(source)
        if normalized_source and len(normalized_source) >= 3:
            phrases.append(normalized_source)

    deduped_phrases: list[str] = []
    seen: set[str] = set()
    for phrase in phrases:
        if phrase in seen:
            continue
        if len(phrase) > 140:
            continue

        seen.add(phrase)
        deduped_phrases.append(phrase)

    return deduped_phrases[:8]


def alignment_text_contains_candidate(segment_text: str, candidate: str) -> bool:
    if not candidate:
        return False

    if len(candidate) <= 3:
        return re.search(rf"(^|[^a-z0-9]){re.escape(candidate)}([^a-z0-9]|$)", segment_text) is not None

    return candidate in segment_text


def looks_like_introductory_alignment_segment(raw_text: str) -> bool:
    normalized = normalize_alignment_text(raw_text)
    return any(phrase in normalized for phrase in ALIGNMENT_INTRO_PHRASES)


def score_alignment_window(
    window_text: str,
    raw_text: str,
    anchor_phrases: list[str],
    answer_candidates: list[str],
    evidence_tokens: list[str],
    keyword_tokens: list[str],
    group_type: str | None = None,
) -> float:
    score = 0.0
    normalized_window_tokens = extract_alignment_tokens(window_text)
    evidence_match_count = 0
    has_direct_candidate_match = False
    requires_direct_evidence = bool(answer_candidates or evidence_tokens)
    keyword_match_count = 0
    strong_keyword_match_count = 0
    direct_anchor_match_count = 0
    anchor_match_count = 0
    normalized_group_type = (group_type or "").strip().upper()

    for phrase in anchor_phrases:
        if alignment_text_contains_candidate(window_text, phrase):
            score += 26 if len(phrase) >= 10 else 20
            direct_anchor_match_count += 1
            anchor_match_count += 1
            continue

        phrase_tokens = [token for token in phrase.split(" ") if len(token) >= 3]
        if not phrase_tokens:
            continue

        matched_tokens = sum(
            1
            for token in phrase_tokens
            if any(variant in normalized_window_tokens for variant in build_alignment_token_variants(token))
        )
        if matched_tokens == len(phrase_tokens):
            score += 12 if len(phrase_tokens) >= 3 else 8
            anchor_match_count += 1
        elif matched_tokens >= max(1, int(len(phrase_tokens) * 0.6 + 0.5)):
            score += 4
            anchor_match_count += 1

    for candidate in answer_candidates:
        if alignment_text_contains_candidate(window_text, candidate):
            score += 18 if len(candidate) >= 8 else 14
            has_direct_candidate_match = True
            continue

        candidate_tokens = [token for token in candidate.split(" ") if token]
        if len(candidate_tokens) >= 2:
            matched_tokens = sum(
                1
                for token in candidate_tokens
                if any(variant in normalized_window_tokens for variant in build_alignment_token_variants(token))
            )
            if matched_tokens == len(candidate_tokens):
                score += 10
                has_direct_candidate_match = True
            elif matched_tokens >= max(2, int(len(candidate_tokens) * 0.66 + 0.5)):
                score += 5

    for token in evidence_tokens:
        if token in normalized_window_tokens:
            evidence_match_count += 1
            score += 4 if len(token) >= 6 else 3

    for token in keyword_tokens:
        if token in normalized_window_tokens:
            keyword_match_count += 1
            if len(token) >= 6:
                strong_keyword_match_count += 1

            if requires_direct_evidence:
                score += 0.25 if len(token) >= 6 else 0.1
            else:
                score += 1.25 if len(token) >= 6 else 0.75

    if (normalized_group_type.startswith("MATCHING") or normalized_group_type.startswith("MCQ")) and direct_anchor_match_count > 0:
        score += max(0, window_text.count(" ") // 6) * 0.75

    if not requires_direct_evidence:
        if strong_keyword_match_count >= 1:
            score += 2.25
        if keyword_match_count >= 2:
            score += 1.5
        elif keyword_match_count == 1 and strong_keyword_match_count == 0:
            score += 0.5

    if requires_direct_evidence and not has_direct_candidate_match and evidence_match_count == 0:
        # Some multiple-choice answers are paraphrased rather than spoken verbatim.
        # Allow strong question-text overlap to survive as a lower-confidence candidate.
        if direct_anchor_match_count >= 1 or anchor_match_count >= 2:
            score += 3.0
        elif strong_keyword_match_count >= 1 and keyword_match_count >= 2:
            score += 1.5
        else:
            return 0.0

    if looks_like_introductory_alignment_segment(raw_text):
        if has_direct_candidate_match:
            score -= 2
        elif evidence_match_count > 0:
            score -= 8
        else:
            score -= 18

    if not requires_direct_evidence and not has_direct_candidate_match and evidence_match_count == 0 and score < 3.0:
        return 0.0

    if score <= 0:
        return 0.0

    return score


def format_alignment_time_label(seconds: float | None) -> str:
    total_seconds = max(0, int(seconds or 0))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    remaining_seconds = total_seconds % 60

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"

    return f"{minutes:02d}:{remaining_seconds:02d}"


def build_alignment_candidate_windows(
    segments: list[ListeningTranscriptSegment],
    question: ListeningAlignmentQuestion,
    allowed_segment_range: tuple[int, int] | None = None,
) -> list[dict]:
    normalized_segment_texts = [normalize_alignment_text(segment.text) for segment in segments]
    anchor_phrases = get_alignment_anchor_phrases(question)
    answer_candidates = get_alignment_answer_candidates(question)
    evidence_tokens = get_alignment_evidence_tokens(question)
    keyword_tokens = get_alignment_keyword_tokens(question)
    normalized_group_type = (question.group_type or "").strip().upper()

    if not anchor_phrases and not answer_candidates and not evidence_tokens and not keyword_tokens:
        return []

    candidates: list[dict] = []
    allowed_start_index = allowed_segment_range[0] if allowed_segment_range else 0
    allowed_end_index = allowed_segment_range[1] if allowed_segment_range else len(segments) - 1
    if normalized_group_type.startswith("MATCHING") or normalized_group_type.startswith("MCQ"):
        max_window_size = 4
    elif answer_candidates or evidence_tokens:
        max_window_size = 2
    else:
        max_window_size = 3

    for start_index in range(allowed_start_index, allowed_end_index + 1):
        max_end_index = min(allowed_end_index, start_index + max_window_size - 1)
        for end_index in range(start_index, max_end_index + 1):
            window_text = " ".join(normalized_segment_texts[start_index:end_index + 1]).strip()
            raw_text = " ".join(
                segment.text.strip()
                for segment in segments[start_index:end_index + 1]
                if segment.text and segment.text.strip()
            ).strip()
            score = score_alignment_window(
                window_text,
                raw_text,
                anchor_phrases,
                answer_candidates,
                evidence_tokens,
                keyword_tokens,
                normalized_group_type,
            )
            if score <= 0:
                continue

            # Prefer the shortest precise snippet when scores are otherwise similar.
            score -= (end_index - start_index) * 0.35
            if score <= 0:
                continue

            candidates.append({
                "segment_indexes": list(range(start_index, end_index + 1)),
                "start_index": start_index,
                "end_index": end_index,
                "score": score,
                "time_label": (
                    f"{format_alignment_time_label(segments[start_index].start_time)}"
                    f" - {format_alignment_time_label(segments[end_index].end_time or segments[end_index].start_time)}"
                ),
                "text": raw_text,
            })

    deduped_candidates: list[dict] = []
    seen_keys: set[tuple[int, ...]] = set()
    for candidate in sorted(candidates, key=lambda item: (-item["score"], len(item["segment_indexes"]), item["start_index"])):
        key = tuple(candidate["segment_indexes"])
        if key in seen_keys:
            continue

        seen_keys.add(key)
        deduped_candidates.append(candidate)
        if len(deduped_candidates) >= 12:
            break

    for index, candidate in enumerate(deduped_candidates, start=1):
        candidate["candidate_id"] = index

    return deduped_candidates


def select_fallback_alignment_candidate(
    candidates: list[dict],
    *,
    requires_direct_evidence: bool = False,
) -> tuple[dict | None, Literal["high", "medium", "low"]]:
    if not candidates:
        return None, "low"

    top_candidate = candidates[0]
    second_score = candidates[1]["score"] if len(candidates) > 1 else 0.0
    score_gap = top_candidate["score"] - second_score

    if requires_direct_evidence:
        if top_candidate["score"] < 8 and score_gap < 3:
            return None, "low"
    elif top_candidate["score"] < 3.5:
        return None, "low"

    if top_candidate["score"] >= 16 or score_gap >= 8:
        return top_candidate, "high"

    if top_candidate["score"] >= 9 or score_gap >= 3:
        return top_candidate, "medium"

    return top_candidate, "low"


def build_map_labelling_candidates(
    segments: list[ListeningTranscriptSegment],
    allowed_segment_range: tuple[int, int],
) -> list[dict]:
    normalized_segment_texts = [normalize_alignment_text(segment.text) for segment in segments]
    allowed_start_index, allowed_end_index = allowed_segment_range
    candidates: list[dict] = []

    for start_index in range(allowed_start_index, allowed_end_index + 1):
        max_end_index = min(allowed_end_index, start_index + 1)
        for end_index in range(start_index, max_end_index + 1):
            raw_text = " ".join(
                segment.text.strip()
                for segment in segments[start_index:end_index + 1]
                if segment.text and segment.text.strip()
            ).strip()
            normalized_window_text = " ".join(normalized_segment_texts[start_index:end_index + 1]).strip()

            if not raw_text or looks_like_introductory_alignment_segment(raw_text):
                continue

            score = 0.0
            for phrase in MAP_LOCATION_CUE_PHRASES:
                if phrase in normalized_window_text:
                    score += 3.0

            tokens = extract_alignment_tokens(normalized_window_text)
            token_match_count = sum(1 for token in MAP_LOCATION_TOKENS if token in tokens)
            score += token_match_count * 1.5

            if "turn" in tokens and ("left" in tokens or "right" in tokens):
                score += 1.5

            if "cross" in tokens and "bridge" in tokens:
                score += 1.5

            if score < 3.5:
                continue

            score -= (end_index - start_index) * 0.25
            candidates.append({
                "segment_indexes": list(range(start_index, end_index + 1)),
                "start_index": start_index,
                "end_index": end_index,
                "score": score,
                "time_label": (
                    f"{format_alignment_time_label(segments[start_index].start_time)}"
                    f" - {format_alignment_time_label(segments[end_index].end_time or segments[end_index].start_time)}"
                ),
                "text": raw_text,
            })

    deduped_candidates: list[dict] = []
    seen_keys: set[tuple[int, ...]] = set()
    for candidate in sorted(candidates, key=lambda item: (item["start_index"], -item["score"], len(item["segment_indexes"]))):
        key = tuple(candidate["segment_indexes"])
        if key in seen_keys:
            continue

        seen_keys.add(key)
        deduped_candidates.append(candidate)

    return deduped_candidates


def fill_map_labelling_gaps(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    segments: list[ListeningTranscriptSegment],
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> None:
    ordered_questions = sorted(
        [question for question in questions if (question.group_type or "").upper() == "MAP_LABELLING"],
        key=lambda item: item.question_number,
    )
    if not ordered_questions:
        return

    groups: list[list[ListeningAlignmentQuestion]] = []
    current_group: list[ListeningAlignmentQuestion] = []
    for question in ordered_questions:
        if current_group and question.question_number != current_group[-1].question_number + 1:
            groups.append(current_group)
            current_group = []
        current_group.append(question)

    if current_group:
        groups.append(current_group)

    for group in groups:
        scope = (
            find_scope_for_question(group[0].question_number, question_scopes)
            or find_section_scope_for_question(group[0].question_number, section_scopes)
        )
        if scope is None:
            continue

        candidate_pool = build_map_labelling_candidates(segments, scope)
        if not candidate_pool:
            continue

        used_candidate_indexes: set[int] = set()

        def mark_used_for_alignment(alignment: ListeningTranscriptQuestionAlignment) -> None:
            aligned_indexes = set(alignment.segment_indexes)
            for candidate_index, candidate in enumerate(candidate_pool):
                if aligned_indexes.intersection(candidate["segment_indexes"]):
                    used_candidate_indexes.add(candidate_index)

        for question in group:
            existing_alignment = alignments_by_question.get(question.question_number)
            if existing_alignment and existing_alignment.segment_indexes:
                mark_used_for_alignment(existing_alignment)

        previous_end_index = scope[0] - 1
        for index, question in enumerate(group):
            existing_alignment = alignments_by_question.get(question.question_number)
            if existing_alignment and existing_alignment.segment_indexes:
                previous_end_index = max(previous_end_index, max(existing_alignment.segment_indexes))
                continue

            next_anchor_start_index: int | None = None
            for later_question in group[index + 1:]:
                later_alignment = alignments_by_question.get(later_question.question_number)
                if later_alignment and later_alignment.segment_indexes:
                    next_anchor_start_index = min(later_alignment.segment_indexes)
                    break

            chosen_candidate_index: int | None = None
            for candidate_index, candidate in enumerate(candidate_pool):
                if candidate_index in used_candidate_indexes:
                    continue
                if candidate["start_index"] <= previous_end_index:
                    continue
                if next_anchor_start_index is not None and candidate["start_index"] >= next_anchor_start_index:
                    continue

                chosen_candidate_index = candidate_index
                break

            if chosen_candidate_index is None:
                continue

            chosen_candidate = candidate_pool[chosen_candidate_index]
            used_candidate_indexes.add(chosen_candidate_index)
            previous_end_index = chosen_candidate["end_index"]
            alignments_by_question[question.question_number] = ListeningTranscriptQuestionAlignment(
                question_number=question.question_number,
                segment_indexes=chosen_candidate["segment_indexes"],
                confidence="low",
            )


def get_alignment_scope_key(
    question_number: int,
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> tuple:
    for scope in question_scopes:
        if scope["start_question"] <= question_number <= scope["end_question"]:
            return ("question-range", scope["start_question"], scope["end_question"])

    target_section_number = max(1, min(4, ((question_number - 1) // 10) + 1))
    for scope in section_scopes:
        if scope["section_number"] == target_section_number:
            return ("section", target_section_number)

    start_question, end_question = get_question_part_range(question_number)
    return ("part", start_question, end_question)


def find_matching_alignment_candidate(
    candidates: list[dict],
    segment_indexes: list[int] | None,
) -> dict | None:
    if not candidates or not segment_indexes:
        return None

    target_key = tuple(segment_indexes)
    for candidate in candidates:
        if tuple(candidate["segment_indexes"]) == target_key:
            return candidate

    return None


def reconcile_alignment_gaps_and_duplicates(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    candidate_lists_by_question: dict[int, list[dict]],
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> None:
    grouped_questions: dict[tuple, list[ListeningAlignmentQuestion]] = {}
    for question in sorted(questions, key=lambda item: item.question_number):
        if (question.group_type or "").upper() == "MAP_LABELLING":
            continue
        if question.question_number not in candidate_lists_by_question:
            continue

        scope_key = get_alignment_scope_key(question.question_number, question_scopes, section_scopes)
        grouped_questions.setdefault(scope_key, []).append(question)

    for ordered_questions in grouped_questions.values():
        if len(ordered_questions) < 2:
            continue

        selected_candidates_by_question: dict[int, dict | None] = {}
        for question in ordered_questions:
            alignment = alignments_by_question.get(question.question_number)
            selected_candidates_by_question[question.question_number] = find_matching_alignment_candidate(
                candidate_lists_by_question.get(question.question_number, []),
                alignment.segment_indexes if alignment else None,
            )

        duplicate_groups: dict[tuple[int, ...], list[ListeningAlignmentQuestion]] = {}
        for question in ordered_questions:
            selected_candidate = selected_candidates_by_question.get(question.question_number)
            if selected_candidate is None:
                continue

            duplicate_groups.setdefault(tuple(selected_candidate["segment_indexes"]), []).append(question)

        for duplicate_questions in duplicate_groups.values():
            if len(duplicate_questions) <= 1:
                continue

            def duplicate_priority(item: ListeningAlignmentQuestion) -> tuple[int, float, int]:
                alignment = alignments_by_question.get(item.question_number)
                confidence_rank = 0
                if alignment and alignment.confidence == "high":
                    confidence_rank = 2
                elif alignment and alignment.confidence == "medium":
                    confidence_rank = 1

                candidate = selected_candidates_by_question.get(item.question_number)
                candidate_score = candidate["score"] if candidate is not None else 0.0
                return confidence_rank, candidate_score, -item.question_number

            keeper = max(duplicate_questions, key=duplicate_priority)
            for question in duplicate_questions:
                if question.question_number == keeper.question_number:
                    continue

                selected_candidates_by_question[question.question_number] = None
                alignments_by_question[question.question_number] = ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=[],
                    confidence="low",
                )

        for _ in range(3):
            made_change = False

            for index, question in enumerate(ordered_questions):
                question_number = question.question_number
                current_alignment = alignments_by_question.get(question_number)
                current_candidate = selected_candidates_by_question.get(question_number)
                if current_candidate is not None and current_alignment and current_alignment.segment_indexes:
                    continue

                candidates = candidate_lists_by_question.get(question_number, [])
                if not candidates:
                    continue

                previous_candidate: dict | None = None
                for previous_question in reversed(ordered_questions[:index]):
                    previous_candidate = selected_candidates_by_question.get(previous_question.question_number)
                    if previous_candidate is not None:
                        break

                next_candidate: dict | None = None
                for next_question in ordered_questions[index + 1:]:
                    next_candidate = selected_candidates_by_question.get(next_question.question_number)
                    if next_candidate is not None:
                        break

                used_signatures = {
                    tuple(candidate["segment_indexes"])
                    for other_question_number, candidate in selected_candidates_by_question.items()
                    if other_question_number != question_number and candidate is not None
                }
                used_segment_indexes = {
                    segment_index
                    for other_question_number, candidate in selected_candidates_by_question.items()
                    if other_question_number != question_number and candidate is not None
                    for segment_index in candidate["segment_indexes"]
                }

                best_candidate: dict | None = None
                best_adjusted_score = float("-inf")
                for candidate in candidates:
                    adjusted_score = candidate["score"]
                    candidate_signature = tuple(candidate["segment_indexes"])
                    if candidate_signature in used_signatures:
                        adjusted_score -= 20

                    overlap_count = len(set(candidate["segment_indexes"]).intersection(used_segment_indexes))
                    adjusted_score -= overlap_count * 4.5

                    if previous_candidate is not None and candidate["end_index"] < previous_candidate["start_index"]:
                        adjusted_score -= 4 + min(
                            6.0,
                            (previous_candidate["start_index"] - candidate["end_index"]) * 0.25,
                        )

                    if next_candidate is not None and candidate["start_index"] > next_candidate["end_index"]:
                        adjusted_score -= 4 + min(
                            6.0,
                            (candidate["start_index"] - next_candidate["end_index"]) * 0.25,
                        )

                    if (
                        previous_candidate is not None
                        and next_candidate is not None
                        and previous_candidate["end_index"] < candidate["start_index"] < next_candidate["start_index"]
                    ):
                        adjusted_score += 1.5

                    if adjusted_score > best_adjusted_score:
                        best_adjusted_score = adjusted_score
                        best_candidate = candidate

                requires_direct_evidence = bool(
                    get_alignment_answer_candidates(question) or get_alignment_evidence_tokens(question)
                )
                minimum_score = 4.0 if requires_direct_evidence else 3.0
                if best_candidate is None or best_adjusted_score < minimum_score:
                    continue

                confidence: Literal["high", "medium", "low"]
                if best_adjusted_score >= 12:
                    confidence = "high"
                elif best_adjusted_score >= 7:
                    confidence = "medium"
                else:
                    confidence = "low"

                selected_candidates_by_question[question_number] = best_candidate
                alignments_by_question[question_number] = ListeningTranscriptQuestionAlignment(
                    question_number=question_number,
                    segment_indexes=best_candidate["segment_indexes"],
                    confidence=confidence,
                )
                made_change = True

            if not made_change:
                break


def optimize_alignment_sequences(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    candidate_lists_by_question: dict[int, list[dict]],
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> None:
    grouped_questions: dict[tuple, list[ListeningAlignmentQuestion]] = {}
    for question in sorted(questions, key=lambda item: item.question_number):
        if (question.group_type or "").upper() == "MAP_LABELLING":
            continue
        if question.question_number not in candidate_lists_by_question:
            continue

        scope_key = get_alignment_scope_key(question.question_number, question_scopes, section_scopes)
        grouped_questions.setdefault(scope_key, []).append(question)

    for ordered_questions in grouped_questions.values():
        if len(ordered_questions) < 2:
            continue

        state_scores: dict[int, float] = {-1: 0.0}
        state_paths: dict[int, list[tuple[int, dict | None]]] = {-1: []}

        for question in ordered_questions:
            question_number = question.question_number
            existing_alignment = alignments_by_question.get(question_number)
            existing_signature = (
                tuple(existing_alignment.segment_indexes)
                if existing_alignment and existing_alignment.segment_indexes
                else None
            )
            confidence_bonus = 0.0
            if existing_alignment and existing_alignment.confidence == "high":
                confidence_bonus = 3.5
            elif existing_alignment and existing_alignment.confidence == "medium":
                confidence_bonus = 2.0
            elif existing_alignment and existing_alignment.confidence == "low":
                confidence_bonus = 0.75

            question_candidates = candidate_lists_by_question.get(question_number, [])[:8]
            if existing_signature and existing_alignment and existing_alignment.confidence in {"high", "medium"}:
                anchored_candidates = [
                    candidate
                    for candidate in question_candidates
                    if tuple(candidate["segment_indexes"]) == existing_signature
                ]
                if anchored_candidates:
                    question_candidates = anchored_candidates

            next_state_scores: dict[int, float] = {}
            next_state_paths: dict[int, list[tuple[int, dict | None]]] = {}

            for previous_end_index, previous_score in state_scores.items():
                previous_path = state_paths[previous_end_index]

                allow_null = not (
                    existing_signature
                    and existing_alignment
                    and existing_alignment.confidence in {"high", "medium"}
                )
                if allow_null:
                    null_score = previous_score - 3.5
                    best_null_score = next_state_scores.get(previous_end_index, float("-inf"))
                    if null_score > best_null_score:
                        next_state_scores[previous_end_index] = null_score
                        next_state_paths[previous_end_index] = [
                            *previous_path,
                            (question_number, None),
                        ]

                for candidate in question_candidates:
                    if candidate["start_index"] <= previous_end_index:
                        continue

                    candidate_score = float(candidate["score"])
                    if tuple(candidate["segment_indexes"]) == existing_signature:
                        candidate_score += confidence_bonus

                    if len(candidate["segment_indexes"]) > 1:
                        candidate_score -= 0.35 * (len(candidate["segment_indexes"]) - 1)

                    state_end_index = candidate["end_index"]
                    combined_score = previous_score + candidate_score
                    best_candidate_score = next_state_scores.get(state_end_index, float("-inf"))
                    if combined_score > best_candidate_score:
                        next_state_scores[state_end_index] = combined_score
                        next_state_paths[state_end_index] = [
                            *previous_path,
                            (question_number, candidate),
                        ]

            if not next_state_scores:
                continue

            state_scores = next_state_scores
            state_paths = next_state_paths

        if not state_scores:
            continue

        best_end_index = max(state_scores, key=lambda key: state_scores[key])
        best_path = state_paths[best_end_index]
        for question_number, candidate in best_path:
            existing_alignment = alignments_by_question.get(question_number)
            if candidate is not None and existing_alignment and tuple(existing_alignment.segment_indexes) == tuple(candidate["segment_indexes"]):
                confidence = existing_alignment.confidence or "medium"
            else:
                confidence = "medium" if candidate else "low"

            alignments_by_question[question_number] = ListeningTranscriptQuestionAlignment(
                question_number=question_number,
                segment_indexes=candidate["segment_indexes"] if candidate else [],
                confidence=confidence,
            )


def collapse_alignment_to_anchor_segments(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    segments: list[ListeningTranscriptSegment],
) -> None:
    questions_by_number = {
        question.question_number: question
        for question in questions
    }

    for question_number, alignment in list(alignments_by_question.items()):
        if not alignment.segment_indexes or len(alignment.segment_indexes) <= 1:
            continue

        question = questions_by_number.get(question_number)
        if question is None:
            continue
        normalized_group_type = (question.group_type or "").strip().upper()
        if normalized_group_type == "MAP_LABELLING" or normalized_group_type.startswith("MATCHING"):
            continue

        anchor_phrases = get_alignment_anchor_phrases(question)
        answer_candidates = get_alignment_answer_candidates(question)
        evidence_tokens = get_alignment_evidence_tokens(question)
        keyword_tokens = get_alignment_keyword_tokens(question)

        best_segment_index: int | None = None
        best_segment_score = float("-inf")
        for segment_index in alignment.segment_indexes:
            if segment_index < 0 or segment_index >= len(segments):
                continue

            segment_text = normalize_alignment_text(segments[segment_index].text)
            raw_text = segments[segment_index].text
            segment_score = score_alignment_window(
                segment_text,
                raw_text,
                anchor_phrases,
                answer_candidates,
                evidence_tokens,
                keyword_tokens,
                normalized_group_type,
            )
            if segment_score > best_segment_score:
                best_segment_score = segment_score
                best_segment_index = segment_index

        if best_segment_index is None:
            continue

        alignments_by_question[question_number] = ListeningTranscriptQuestionAlignment(
            question_number=question_number,
            segment_indexes=[best_segment_index],
            confidence=alignment.confidence,
        )

