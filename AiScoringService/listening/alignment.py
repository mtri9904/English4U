from __future__ import annotations

import re
import unicodedata

from schemas import ListeningTranscriptSegment


QUESTION_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "twentyone": 21,
    "twentytwo": 22,
    "twentythree": 23,
    "twentyfour": 24,
    "twentyfive": 25,
    "twentysix": 26,
    "twentyseven": 27,
    "twentyeight": 28,
    "twentynine": 29,
    "thirty": 30,
    "thirtyone": 31,
    "thirtytwo": 32,
    "thirtythree": 33,
    "thirtyfour": 34,
    "thirtyfive": 35,
    "thirtysix": 36,
    "thirtyseven": 37,
    "thirtyeight": 38,
    "thirtynine": 39,
    "forty": 40,
}

SECTION_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
}

LISTENING_SECTION_TRANSITION_MARKERS = {
    2: [
        "now turn to section two",
        "turn to section two",
        "now turn to section 2",
        "turn to section 2",
    ],
    3: [
        "now turn to section three",
        "turn to section three",
        "now turn to section 3",
        "turn to section 3",
    ],
    4: [
        "now turn to section four",
        "turn to section four",
        "now turn to section 4",
        "turn to section 4",
    ],
}


def normalize_alignment_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9.%/$&+' -]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def build_alignment_token_variants(token: str) -> set[str]:
    normalized = normalize_alignment_text(token)
    if not normalized or " " in normalized:
        return set()

    variants = {normalized}

    if normalized.endswith("ies") and len(normalized) > 4:
        variants.add(normalized[:-3] + "y")

    if normalized.endswith("ments") and len(normalized) > 7:
        variants.add(normalized[:-5])
        variants.add(normalized[:-1])

    if normalized.endswith("ment") and len(normalized) > 6:
        variants.add(normalized[:-4])

    if normalized.endswith("ing") and len(normalized) > 5:
        stem = normalized[:-3]
        variants.add(stem)
        variants.add(stem + "e")

    if normalized.endswith("ed") and len(normalized) > 4:
        stem = normalized[:-2]
        variants.add(stem)
        variants.add(stem + "e")

    if normalized.endswith("es") and len(normalized) > 4:
        variants.add(normalized[:-2])

    if normalized.endswith("s") and len(normalized) > 3:
        variants.add(normalized[:-1])

    return {variant for variant in variants if len(variant) >= 2}


def extract_alignment_tokens(text: str | None) -> set[str]:
    normalized = normalize_alignment_text(text)
    if not normalized:
        return set()

    tokens: set[str] = set()
    for token in normalized.split(" "):
        if not token:
            continue
        tokens.update(build_alignment_token_variants(token))

    return tokens


def parse_question_number_token(token: str | None) -> int | None:
    cleaned = re.sub(r"[^a-z0-9]", "", (token or "").lower())
    if not cleaned:
        return None

    if cleaned.isdigit():
        return int(cleaned)

    return QUESTION_NUMBER_WORDS.get(cleaned)


def parse_number_phrase_token(token: str | None) -> int | None:
    cleaned = normalize_alignment_text(token)
    if not cleaned:
        return None

    direct = parse_question_number_token(cleaned)
    if direct is not None:
        return direct

    compact = re.sub(r"[^a-z0-9]", "", cleaned)
    return parse_question_number_token(compact)


def extract_question_range_from_text(text: str | None) -> tuple[int, int] | None:
    normalized = normalize_alignment_text(text)
    if not normalized:
        return None

    match = re.search(
        r"\bquestions?\s+([a-z0-9 -]+?)\s*(?:to|-)\s*([a-z0-9 -]+)\b",
        normalized,
    )
    if not match:
        return None

    start_question = parse_number_phrase_token(match.group(1))
    end_question = parse_number_phrase_token(match.group(2))
    if start_question is None or end_question is None or start_question > end_question:
        return None

    return start_question, end_question


def extract_section_number_from_text(text: str | None) -> int | None:
    normalized = normalize_alignment_text(text)
    if not normalized:
        return None

    match = re.search(r"\bsection\s+([a-z0-9 -]+)\b", normalized)
    if not match:
        return None

    token = match.group(1).strip()
    compact = re.sub(r"\s+", " ", token)
    if compact in SECTION_NUMBER_WORDS:
        return SECTION_NUMBER_WORDS[compact]

    parsed = parse_number_phrase_token(compact)
    if parsed is None or parsed < 1 or parsed > 4:
        return None

    return parsed


def detect_question_range_scopes(segments: list[ListeningTranscriptSegment]) -> list[dict]:
    raw_events: list[tuple[int, int, int]] = []

    for segment_index, segment in enumerate(segments):
        question_range = extract_question_range_from_text(segment.text)
        if question_range is None:
            continue

        raw_events.append((segment_index, question_range[0], question_range[1]))

    if not raw_events:
        return []

    compressed_events: list[tuple[int, int, int]] = []
    for event in raw_events:
        if compressed_events and compressed_events[-1][1:] == event[1:]:
            compressed_events[-1] = event
            continue

        compressed_events.append(event)

    scopes: list[dict] = []
    for index, (segment_index, start_question, end_question) in enumerate(compressed_events):
        next_segment_index = compressed_events[index + 1][0] if index + 1 < len(compressed_events) else len(segments)
        start_segment_index = min(segment_index + 1, len(segments) - 1)
        end_segment_index = min(
            len(segments) - 1,
            max(start_segment_index, next_segment_index - 1),
        )
        scopes.append({
            "start_question": start_question,
            "end_question": end_question,
            "start_segment_index": start_segment_index,
            "end_segment_index": end_segment_index,
        })

    return scopes


def detect_section_scopes(segments: list[ListeningTranscriptSegment]) -> list[dict]:
    raw_events: list[tuple[int, int]] = []

    for segment_index, segment in enumerate(segments):
        section_number = extract_section_number_from_text(segment.text)
        if section_number is None:
            continue

        raw_events.append((segment_index, section_number))

    if not raw_events:
        return []

    compressed_events: list[tuple[int, int]] = []
    for event in raw_events:
        if compressed_events and compressed_events[-1][1] == event[1]:
            compressed_events[-1] = event
            continue

        compressed_events.append(event)

    scopes: list[dict] = []
    for index, (segment_index, section_number) in enumerate(compressed_events):
        next_segment_index = compressed_events[index + 1][0] if index + 1 < len(compressed_events) else len(segments)
        start_segment_index = min(segment_index + 1, len(segments) - 1)
        end_segment_index = min(
            len(segments) - 1,
            max(start_segment_index, next_segment_index - 1),
        )
        scopes.append({
            "section_number": section_number,
            "start_segment_index": start_segment_index,
            "end_segment_index": end_segment_index,
        })

    return scopes


def find_scope_for_question(question_number: int, scopes: list[dict]) -> tuple[int, int] | None:
    for scope in scopes:
        if scope["start_question"] <= question_number <= scope["end_question"]:
            return scope["start_segment_index"], scope["end_segment_index"]

    return None


def find_section_scope_for_question(question_number: int, scopes: list[dict]) -> tuple[int, int] | None:
    target_section_number = max(1, min(4, ((question_number - 1) // 10) + 1))

    for scope in scopes:
        if scope["section_number"] == target_section_number:
            return scope["start_segment_index"], scope["end_segment_index"]

    return None


def get_question_part_range(question_number: int) -> tuple[int, int]:
    part_index = max(0, (question_number - 1) // 10)
    start_question = part_index * 10 + 1
    return start_question, start_question + 9


def get_question_part_number(question_number: int) -> int:
    return max(1, min(4, ((question_number - 1) // 10) + 1))


def find_listening_section_start_index(
    segments: list[ListeningTranscriptSegment],
    section_number: int,
    start_search_index: int = 0,
) -> int | None:
    markers = LISTENING_SECTION_TRANSITION_MARKERS.get(section_number, [])
    normalized_segment_texts = [
        normalize_alignment_text(segment.text)
        for segment in segments
    ]

    for segment_index in range(start_search_index, len(segments)):
        segment_text = normalized_segment_texts[segment_index]
        if any(marker in segment_text for marker in markers):
            return segment_index

    for segment_index in range(start_search_index, len(segments)):
        segment_text = normalized_segment_texts[segment_index]
        if "turn to" in segment_text and extract_section_number_from_text(segment_text) == section_number:
            return segment_index

    for segment_index in range(start_search_index, len(segments) - 1):
        segment_text = normalized_segment_texts[segment_index]
        next_tokens = normalized_segment_texts[segment_index + 1].split()
        if not next_tokens:
            continue

        next_section_number: int | None = None
        if re.search(r"\bturn to (?:section|part)$", segment_text):
            next_section_number = parse_number_phrase_token(next_tokens[0])
        elif re.search(r"\bturn to$", segment_text) and next_tokens[0] in {"section", "part"}:
            next_section_number = parse_number_phrase_token(next_tokens[1] if len(next_tokens) > 1 else None)

        if next_section_number == section_number:
            return segment_index + 1

    section_scopes = detect_section_scopes(segments)
    for scope in section_scopes:
        if scope["section_number"] == section_number:
            return max(0, scope["start_segment_index"] - 1)

    return None


def split_listening_transcript_into_parts(
    segments: list[ListeningTranscriptSegment],
) -> list[dict]:
    if not segments:
        return []

    start_indexes = {1: 0}
    search_start_index = 0
    for section_number in (2, 3, 4):
        start_index = find_listening_section_start_index(
            segments,
            section_number,
            start_search_index=search_start_index,
        )
        if start_index is None:
            raise ValueError(f"Could not locate transition marker for section {section_number}.")

        start_indexes[section_number] = start_index
        search_start_index = start_index + 1

    ordered_start_indexes = [
        start_indexes[1],
        start_indexes[2],
        start_indexes[3],
        start_indexes[4],
    ]
    if ordered_start_indexes != sorted(ordered_start_indexes) or len(set(ordered_start_indexes)) != 4:
        raise ValueError("Listening section boundaries are not strictly increasing.")

    parts: list[dict] = []
    for part_number, global_start_index in enumerate(ordered_start_indexes, start=1):
        global_end_index = (
            ordered_start_indexes[part_number]
            if part_number < 4
            else len(segments)
        )
        parts.append({
            "part_number": part_number,
            "global_start_index": global_start_index,
            "segments": segments[global_start_index:global_end_index],
        })

    return parts
