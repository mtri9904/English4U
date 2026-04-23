import re
from dataclasses import dataclass, field

OPTION_REQUIRED_TYPES = {
    "MULTIPLE_CHOICE",
    "MCQ",
    "MCQ_MULTIPLE",
    "MATCHING_HEADING",
    "MATCHING_FEATURES",
    "MATCHING_INFO",
    "DIAGRAM_LABELING",
}


@dataclass
class ParsedOption:
    text: str
    label: str
    order_index: int


@dataclass
class ParsedQuestion:
    number: int
    content: str
    question_type: str
    options: list[ParsedOption] = field(default_factory=list)
    correct_answer: str | None = None
    explanation: str | None = None


@dataclass
class ParsedQuestionGroup:
    instruction: str
    question_type: str
    start_q: int
    end_q: int
    questions: list[ParsedQuestion] = field(default_factory=list)


@dataclass
class ParsedPassage:
    title: str
    content: str
    question_groups: list[ParsedQuestionGroup] = field(default_factory=list)

    @property
    def question_count(self) -> int:
        return sum(len(g.questions) for g in self.question_groups)

    @property
    def has_all_answers(self) -> bool:
        for g in self.question_groups:
            for q in g.questions:
                if not q.correct_answer:
                    return False
        return self.question_count > 0

    @property
    def missing_answer_count(self) -> int:
        count = 0
        for g in self.question_groups:
            for q in g.questions:
                if not q.correct_answer:
                    count += 1
        return count

    @property
    def missing_option_count(self) -> int:
        count = 0
        for g in self.question_groups:
            for q in g.questions:
                if q.question_type in OPTION_REQUIRED_TYPES and len(q.options) == 0:
                    count += 1
        return count

    @property
    def has_all_required_options(self) -> bool:
        for g in self.question_groups:
            for q in g.questions:
                if q.question_type in OPTION_REQUIRED_TYPES and len(q.options) == 0:
                    return False
        return self.question_count > 0


@dataclass
class ParsedExam:
    passages: list[ParsedPassage]
    answers: dict[int, str]
    explanations: dict[int, str]
    total_questions: int

    @property
    def has_enough_questions(self) -> bool:
        return self.total_questions >= 5

    @property
    def has_all_answers(self) -> bool:
        return all(p.has_all_answers for p in self.passages if p.question_count > 0)

    @property
    def total_missing_answers(self) -> int:
        return sum(p.missing_answer_count for p in self.passages)

    @property
    def has_all_options(self) -> bool:
        return all(p.has_all_required_options for p in self.passages if p.question_count > 0)

    @property
    def total_missing_options(self) -> int:
        return sum(p.missing_option_count for p in self.passages)


TRASH_LINE_REGEXES = [
    re.compile(r"(?i)^\s*page\s+\d+\s*$"),
    re.compile(r"(?i)^\s*p\.\s*\d+\s*$"),
    re.compile(r"(?i)^\s*\d+\s*$"),
    re.compile(r"(?i)^\s*\d+\s*/\s*\d+\s*$"),
    re.compile(r"(?i)^\s*©.*$"),
    re.compile(r"(?i)^\s*copyright.*$"),
    re.compile(r"(?i)^\s*all\s+rights\s+reserved.*$"),
    re.compile(r"(?i)^\s*-{3,}\s*$"),
    re.compile(r"(?i)^\s*_{3,}\s*$"),
    re.compile(r"(?i)^\s*={3,}\s*$"),
    re.compile(r"(?i)^\s*\*{3,}\s*$"),
    re.compile(r"(?i)^\s*turn\s+over\s*$"),
    re.compile(r"(?i)^\s*(continued\s+on\s+next|see\s+next)\s+page\s*$"),
    re.compile(r"(?i)^\s*#\s*$"),
]

TRASH_CONTAINS_REGEXES = [
    re.compile(r"(?i)https?://\S+"),
    re.compile(r"(?i)www\.\S+"),
    re.compile(r"(?i)scan\s*(this\s+)?qr\s*code"),
    re.compile(r"(?i)open\s+(this\s+)?url"),
    re.compile(r"(?i)mobile\s+device"),
    re.compile(r"(?i)how\s+to\s+use"),
    re.compile(r"(?i)download\s+(the\s+)?app"),
    re.compile(r"(?i)visit\s+(our\s+)?(website|site)"),
    re.compile(r"(?i)for\s+more\s+(practices?|information|details)"),
    re.compile(r"(?i)subscribe\s+to"),
    re.compile(r"(?i)follow\s+us\s+on"),
    re.compile(r"(?i)prepared\s+by"),
    re.compile(r"(?i)downloaded?\s+(from|at|by)"),
    re.compile(r"(?i)source\s*:"),
    re.compile(r"(?i)you\s+have\s+\d+\s+ways?\s+to\s+access"),
    re.compile(r"(?i)access\s+.*\s+for\s+more"),
    re.compile(r"(?i)this\s+(page|document)\s+(is|has)"),
]

TRASH_STANDALONE_REGEXES = [
    re.compile(r"(?i)^\s*ielts\s+(mock\s+)?test\s*\d*\s*$"),
    re.compile(r"(?i)^\s*practice\s+test\s+\d+\s*$"),
    re.compile(r"(?i)^\s*test\s+\d+\s*$"),
    re.compile(r"(?i)^\s*ielts\s+(academic\s+)?reading\s*$"),
    re.compile(r"(?i)^\s*reading\s+test\s*\d*\s*$"),
    re.compile(r"(?i)^\s*general\s+training\s*$"),
    re.compile(r"(?i)^\s*academic\s+reading\s*$"),
    re.compile(r"(?i)^\s*reading\s+practice\s+test\s*\d*\s*$"),
    re.compile(r"(?i)^\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*\d*\s*$"),
]

PASSAGE_CONTENT_TRASH = [
    re.compile(r"(?i)you\s+should\s+spend\s+about\s+\d+\s+minutes?\s+on"),
    re.compile(r"(?i)which\s+are\s+based\s+on\s+reading\s+passage"),
    re.compile(r"(?i)write\s+your\s+answers?\s+in\s+box(es)?"),
    re.compile(r"(?i)on\s+your\s+answer\s+sheet"),
    re.compile(r"(?i)NB\s+you\s+may\s+use\s+any\s+letter"),
    re.compile(r"(?i)read,?\s+the\s+text\s+below\s+and\s+answer"),
    re.compile(r"(?i)read\s+the\s+(following\s+)?passage"),
    re.compile(r"(?i)^\s*passage\s+\d+\s*$"),
]


def _is_trash_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False

    for pattern in TRASH_LINE_REGEXES:
        if pattern.match(stripped):
            return True

    for pattern in TRASH_CONTAINS_REGEXES:
        if pattern.search(stripped):
            return True

    for pattern in TRASH_STANDALONE_REGEXES:
        if pattern.match(stripped):
            return True

    return False


def _is_passage_content_trash(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    for pattern in PASSAGE_CONTENT_TRASH:
        if pattern.search(stripped):
            return True

    for pattern in TRASH_CONTAINS_REGEXES:
        if pattern.search(stripped):
            return True

    return False


def _strip_cover_page(raw_text: str) -> str:
    first_passage = re.search(
        r"(?i)(?:READING\s+)?PASSAGE\s+\d",
        raw_text,
    )
    if first_passage:
        return raw_text[first_passage.start():]
    return raw_text


def _clean_text(raw_text: str) -> str:
    text = _strip_cover_page(raw_text)

    lines = text.split("\n")
    cleaned: list[str] = []
    for line in lines:
        if _is_trash_line(line):
            continue
        cleaned.append(line)

    result = "\n".join(cleaned)
    result = re.sub(r"\n{4,}", "\n\n\n", result)
    return result.strip()


def _clean_passage_content(text: str) -> str:
    lines = text.split("\n")
    cleaned: list[str] = []
    for line in lines:
        if _is_passage_content_trash(line):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def parse_ielts_pdf(raw_text: str) -> ParsedExam:
    answers, explanations, text_without_answers = _extract_answer_key(raw_text)
    cleaned = _clean_text(text_without_answers)
    sections = _split_into_passage_sections(cleaned)

    parsed_passages: list[ParsedPassage] = []
    total_q = 0

    for i, section in enumerate(sections):
        passage_text, question_text = _split_passage_from_questions(section)
        passage_text = _clean_passage_content(passage_text)

        if len(passage_text.strip()) < 100:
            continue

        title = f"Reading Passage {i + 1}"
        title_match = re.search(
            r"(?i)(?:READING\s+)?PASSAGE\s+\d+\s*[:\-–]?\s*\n+\s*(.+)",
            passage_text,
        )
        if title_match:
            candidate = title_match.group(1).strip()
            if (
                len(candidate) > 3
                and not re.match(r"(?i)^(you should|questions?|read)", candidate)
                and not _is_trash_line(candidate)
            ):
                title = candidate

        heading_match = re.search(r"(?i)(?:READING\s+)?PASSAGE\s+\d+", passage_text)
        if heading_match:
            after_heading = passage_text[heading_match.end():].strip()
            first_line = after_heading.split("\n")[0].strip() if after_heading else ""
            if first_line and len(first_line) > 3 and not re.match(r"(?i)^(you should|questions?|read)", first_line):
                passage_text = after_heading

        question_groups: list[ParsedQuestionGroup] = []
        if question_text:
            question_groups = _parse_question_sections(question_text, answers, explanations)

        passage = ParsedPassage(title=title, content=passage_text, question_groups=question_groups)
        total_q += passage.question_count
        parsed_passages.append(passage)

    return ParsedExam(
        passages=parsed_passages,
        answers=answers,
        explanations=explanations,
        total_questions=total_q,
    )


def parsed_passage_to_group(passage: ParsedPassage, order_index: int) -> dict:
    def normalize_question_type(raw_type: str | None) -> str:
        key = (raw_type or "").strip().upper().replace("-", "_").replace(" ", "_")
        alias_map = {
            "MCQ": "MCQ_SINGLE",
            "MULTIPLE_CHOICE": "MCQ_SINGLE",
            "MULTIPLE_CHOICE_SINGLE": "MCQ_SINGLE",
            "MCQ_SINGLE": "MCQ_SINGLE",
            "MCQ_MULTIPLE": "MCQ_MULTIPLE",
            "MULTIPLE_CHOICE_MULTI": "MCQ_MULTIPLE",
            "MULTIPLE_CHOICE_MULTIPLE": "MCQ_MULTIPLE",
            "TRUE_FALSE_NG": "TFNG",
            "TRUE_FALSE_NOT_GIVEN": "TFNG",
            "TFNG": "TFNG",
            "YES_NO_NG": "YNNG",
            "YES_NO_NOT_GIVEN": "YNNG",
            "YNNG": "YNNG",
            "MATCHING_HEADING": "MATCHING_HEADINGS",
            "MATCHING_HEADINGS": "MATCHING_HEADINGS",
            "MATCHING_INFO": "MATCHING_INFO",
            "MATCHING_INFORMATION": "MATCHING_INFO",
            "MATCHING_FEATURES": "MATCHING_FEATURES",
            "SENTENCE_COMPLETION": "SENTENCE_COMPLETION",
            "FORM_COMPLETION": "SENTENCE_COMPLETION",
            "NOTE_COMPLETION": "SENTENCE_COMPLETION",
            "SUMMARY_COMPLETION": "SUMMARY_COMPLETION",
            "TABLE_COMPLETION": "TABLE_COMPLETION",
            "FLOWCHART_COMPLETION": "FLOWCHART_COMPLETION",
            "FLOW_CHART_COMPLETION": "FLOWCHART_COMPLETION",
            "SHORT_ANSWER": "SHORT_ANSWER",
            "DIAGRAM_LABELING": "MAP_LABELLING",
            "DIAGRAM_LABELLING": "MAP_LABELLING",
            "MAP_LABELING": "MAP_LABELLING",
            "MAP_LABELLING": "MAP_LABELLING",
            "MATCHING_TABLE": "MATCHING_TABLE",
        }
        return alias_map.get(key, key if key else "MCQ_SINGLE")

    def split_answer_tokens(answer: str | None) -> list[str]:
        if not answer:
            return []
        return [
            token.strip().upper()
            for token in re.split(r"\s*(?:\||,|/|;|&|\band\b)\s*", answer, flags=re.IGNORECASE)
            if token.strip()
        ]

    def normalize_token(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip().upper()

    option_like_types = {
        "MCQ_SINGLE",
        "MCQ_MULTIPLE",
        "TFNG",
        "YNNG",
        "MATCHING_HEADINGS",
        "MATCHING_INFO",
        "MATCHING_FEATURES",
        "MATCHING_TABLE",
        "MAP_LABELLING",
    }
    fill_like_types = {
        "SENTENCE_COMPLETION",
        "SUMMARY_COMPLETION",
        "TABLE_COMPLETION",
        "FLOWCHART_COMPLETION",
        "SHORT_ANSWER",
    }
    letter_answer_types = {
        "MCQ_SINGLE",
        "MCQ_MULTIPLE",
        "MATCHING_HEADINGS",
        "MATCHING_INFO",
        "MATCHING_FEATURES",
        "MATCHING_TABLE",
        "MAP_LABELLING",
    }

    all_questions_data: list[dict] = []
    question_groups_data: list[dict] = []

    for parsed_group in passage.question_groups:
        group_type = normalize_question_type(parsed_group.question_type)
        group_questions: list[dict] = []

        for q in parsed_group.questions:
            q_type = normalize_question_type(q.question_type or parsed_group.question_type)
            answer_raw = (q.correct_answer or "").strip() or None
            answer_tokens = split_answer_tokens(answer_raw)
            options_data: list[dict] = []

            source_options = list(q.options)
            if q_type == "TFNG" and not source_options:
                source_options = [
                    ParsedOption(text="TRUE", label="TRUE", order_index=0),
                    ParsedOption(text="FALSE", label="FALSE", order_index=1),
                    ParsedOption(text="NOT GIVEN", label="NOT GIVEN", order_index=2),
                ]
            if q_type == "YNNG" and not source_options:
                source_options = [
                    ParsedOption(text="YES", label="YES", order_index=0),
                    ParsedOption(text="NO", label="NO", order_index=1),
                    ParsedOption(text="NOT GIVEN", label="NOT GIVEN", order_index=2),
                ]

            for idx, opt in enumerate(source_options):
                option_text = (opt.text or "").strip()
                option_label = (opt.label or "").strip().upper() or chr(65 + idx)
                is_correct = False

                if answer_tokens:
                    if q_type in letter_answer_types:
                        is_correct = option_label in answer_tokens or normalize_token(option_text) in answer_tokens
                    elif q_type in {"TFNG", "YNNG"}:
                        normalized_text = normalize_token(option_text)
                        is_correct = any(normalized_text == normalize_token(token) for token in answer_tokens)
                    else:
                        normalized_text = normalize_token(option_text)
                        is_correct = any(normalized_text == normalize_token(token) for token in answer_tokens)

                options_data.append(
                    {
                        "optionText": option_text,
                        "isCorrect": is_correct,
                        "orderIndex": opt.order_index if opt.order_index is not None else idx,
                    }
                )

            content = (q.content or "").strip()
            if q_type in fill_like_types and q_type != "SHORT_ANSWER" and answer_raw and "___" not in content:
                replacement = answer_raw.split("|")[0].split(",")[0].strip()
                if replacement:
                    content = content.replace(replacement, "___")

            question_data = {
                "questionType": q_type,
                "questionNumber": q.number,
                "content": content,
                "correctAnswer": answer_raw,
                "explanation": q.explanation,
                "points": 1.0,
                "orderIndex": len(all_questions_data),
                "options": options_data if q_type in option_like_types else [],
            }

            group_questions.append(question_data)
            all_questions_data.append(question_data)

        if group_questions:
            question_numbers = [q.get("questionNumber") for q in group_questions if isinstance(q.get("questionNumber"), int)]
            question_groups_data.append(
                {
                    "groupType": group_type,
                    "instruction": parsed_group.instruction,
                    "startQuestion": min(question_numbers) if question_numbers else None,
                    "endQuestion": max(question_numbers) if question_numbers else None,
                    "questions": group_questions,
                }
            )

    if not question_groups_data and all_questions_data:
        question_numbers = [q.get("questionNumber") for q in all_questions_data if isinstance(q.get("questionNumber"), int)]
        question_groups_data.append(
            {
                "groupType": normalize_question_type(all_questions_data[0].get("questionType")),
                "instruction": "",
                "startQuestion": min(question_numbers) if question_numbers else None,
                "endQuestion": max(question_numbers) if question_numbers else None,
                "questions": all_questions_data,
            }
        )

    return {
        "title": passage.title,
        "content": passage.content,
        "audioUrl": None,
        "orderIndex": order_index,
        "questionGroups": question_groups_data,
        "questions": all_questions_data,
    }


def _normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_answer_token(value: str) -> str:
    token = _normalize_spaces(value)
    upper = token.upper()

    normalized_map = {
        "NOTGIVEN": "NOT GIVEN",
        "NOT GIVEN": "NOT GIVEN",
        "TRUE": "TRUE",
        "FALSE": "FALSE",
        "YES": "YES",
        "NO": "NO",
    }
    compact = upper.replace(" ", "")
    if compact in normalized_map:
        return normalized_map[compact]

    if re.fullmatch(r"[A-Z]", upper):
        return upper

    if re.fullmatch(r"[IVXLCDM]{1,8}", upper):
        return upper

    return token


def _normalize_answer_list(raw: str) -> str:
    parts = [
        _normalize_answer_token(part)
        for part in re.split(r"\s*(?:,|/|\||;|&|\band\b)\s*", raw, flags=re.IGNORECASE)
        if part.strip()
    ]
    return ",".join(parts)


def _is_answer_token(text: str) -> bool:
    value = _normalize_answer_token(text)
    upper = value.upper()
    return (
        upper in {"TRUE", "FALSE", "NOT GIVEN", "YES", "NO"}
        or bool(re.fullmatch(r"[A-Z]", upper))
        or bool(re.fullmatch(r"[IVXLCDM]{1,8}", upper))
    )


def _extract_answer_and_explanation(segment: str) -> tuple[str | None, str | None]:
    cleaned = _normalize_spaces(segment.strip(" -:–—"))
    if not cleaned:
        return None, None

    choice_match = re.match(
        r"(?i)^((?:[A-Z]|[ivxlcdm]{1,8}|TRUE|FALSE|NOT\s*GIVEN|YES|NO)"
        r"(?:\s*(?:,|/|\||;|&|\band\b)\s*"
        r"(?:[A-Z]|[ivxlcdm]{1,8}|TRUE|FALSE|NOT\s*GIVEN|YES|NO))*)\b(.*)$",
        cleaned,
    )
    if choice_match:
        answer = _normalize_answer_list(choice_match.group(1))
        remainder = _normalize_spaces(choice_match.group(2).strip(" -:–—"))
        return answer, remainder if len(remainder) >= 6 else None

    for delimiter in [" - ", " – ", " — ", " : "]:
        if delimiter in cleaned:
            left, right = cleaned.split(delimiter, 1)
            left = _normalize_spaces(left)
            right = _normalize_spaces(right)
            if left and right:
                if _is_answer_token(left):
                    return _normalize_answer_list(left), right
                if len(left) <= 80 and len(right) >= 8:
                    return left, right

    return cleaned, None


def _extract_answer_pairs_from_block(answer_block: str) -> tuple[dict[int, str], dict[int, str]]:
    answers: dict[int, str] = {}
    explanations: dict[int, str] = {}

    line_pair_pattern = re.compile(
        r"(?<!\d)(\d{1,3})\s*[.)\]:\-]?\s*"
        r"(.+?)(?=(?:\s+(?<!\d)\d{1,3}\s*[.)\]:\-]?\s*)|$)",
        re.IGNORECASE,
    )

    for raw_line in answer_block.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _is_trash_line(line):
            continue

        range_line_match = re.match(
            r"^\s*(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s+(.+)$",
            line,
            flags=re.IGNORECASE,
        )
        if range_line_match:
            start_q = int(range_line_match.group(1))
            end_q = int(range_line_match.group(2))
            tail = range_line_match.group(3)
            if 0 < start_q <= end_q <= 80:
                expected_count = end_q - start_q + 1
                tokens = [
                    _normalize_answer_token(token)
                    for token in re.split(r"[\s,;/|]+", tail)
                    if token.strip()
                ]
                valid_tokens = [token for token in tokens if _is_answer_token(token)]
                if len(valid_tokens) >= expected_count:
                    for offset in range(expected_count):
                        answers[start_q + offset] = valid_tokens[offset]
                    continue

        pairs = list(line_pair_pattern.finditer(line))
        if not pairs:
            continue

        for pair in pairs:
            q_num = int(pair.group(1))
            if q_num <= 0 or q_num > 80:
                continue

            answer_raw, explanation = _extract_answer_and_explanation(pair.group(2))
            if not answer_raw:
                continue

            answers[q_num] = answer_raw
            if explanation:
                explanations[q_num] = explanation

    return answers, explanations


def _extract_answer_key(raw_text: str) -> tuple[dict[int, str], dict[int, str], str]:
    answer_section_patterns = [
        r"(?i)(?:^|\n)\s*(?:ANSWER\s*KEY|ANSWER\s*KEYS?|ANSWERS?\s*:?)\s*\n([\s\S]+?)$",
        r"(?i)(?:^|\n)\s*(?:KEY|ĐÁP\s*ÁN|ANSWER\s+SHEET)\s*:?\s*\n([\s\S]+?)$",
        r"(?i)(?:^|\n)\s*SOLUTIONS?\s*:?\s*\n([\s\S]+?)$",
    ]

    for pattern in answer_section_patterns:
        match = re.search(pattern, raw_text)
        if not match:
            continue

        answer_block = match.group(1)
        answers, explanations = _extract_answer_pairs_from_block(answer_block)
        if len(answers) >= 3:
            return answers, explanations, raw_text[: match.start()].strip()

    return {}, {}, raw_text


def _split_into_passage_sections(raw_text: str) -> list[str]:
    pattern = r"(?=(?:READING\s+)?PASSAGE\s+\d)"
    parts = re.split(pattern, raw_text, flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 200]

    if len(parts) > 1:
        return parts

    pattern2 = r"(?=Part\s+\d|Section\s+[A-Z\d])"
    parts2 = re.split(pattern2, raw_text, flags=re.IGNORECASE)
    parts2 = [p.strip() for p in parts2 if p.strip() and len(p.strip()) > 200]

    if len(parts2) > 1:
        return parts2

    return [raw_text]


def _split_passage_from_questions(section_text: str) -> tuple[str, str]:
    q_match = re.search(r"(?im)^\s*Questions?\s+\d+\s*(?:[-–]|to)\s*\d+", section_text)
    if q_match:
        return section_text[: q_match.start()].strip(), section_text[q_match.start() :].strip()

    return section_text.strip(), ""


def _detect_question_type(instruction: str) -> str:
    low = instruction.lower()

    if "true" in low and "false" in low and "not given" in low:
        return "TRUE_FALSE_NG"
    if "yes" in low and "no" in low and "not given" in low:
        return "YNNG"

    if "heading" in low and ("match" in low or "choose" in low or "list" in low):
        return "MATCHING_HEADING"
    if "match" in low and "feature" in low:
        return "MATCHING_FEATURES"
    if "match" in low and "information" in low:
        return "MATCHING_INFO"
    if "match" in low and "paragraph" in low:
        return "MATCHING_HEADING"

    if "summary" in low and ("complete" in low or "fill" in low):
        return "SUMMARY_COMPLETION"
    if "table" in low and "complete" in low:
        return "TABLE_COMPLETION"
    if "flow" in low and "chart" in low:
        return "FLOWCHART_COMPLETION"
    if "diagram" in low and ("label" in low or "complete" in low):
        return "DIAGRAM_LABELING"
    if "map" in low and ("label" in low or "plan" in low):
        return "DIAGRAM_LABELING"

    if "short answer" in low:
        return "SHORT_ANSWER"

    if "choose" in low and "letter" in low and any(token in low for token in ["two", "three", "four", "five"]):
        return "MCQ_MULTIPLE"
    if "multiple answers" in low:
        return "MCQ_MULTIPLE"

    if "complete" in low or "fill" in low or "no more than" in low:
        return "SENTENCE_COMPLETION"
    if "one word" in low or "two words" in low or "three words" in low:
        return "SENTENCE_COMPLETION"

    if "choose" in low or "correct letter" in low or "multiple" in low:
        return "MULTIPLE_CHOICE"

    return "MULTIPLE_CHOICE"


def _is_question_line_start(line: str, start_q: int, end_q: int) -> bool:
    match = re.match(r"^\s*(\d{1,3})\s*[.)]?\s+", line)
    if not match:
        return False
    q_num = int(match.group(1))
    return start_q <= q_num <= end_q


def _extract_labeled_options(text: str, label_pattern: str) -> list[ParsedOption]:
    if not text.strip():
        return []

    pattern = re.compile(
        rf"(?:^|\n)\s*({label_pattern})\s*(?:[.)\-:]\s*|\s+)"
        rf"(.+?)(?=(?:\n\s*(?:{label_pattern})\s*(?:[.)\-:]\s*|\s+))|\Z)",
        re.IGNORECASE | re.DOTALL,
    )

    matches = list(pattern.finditer(text))
    if len(matches) < 2:
        return []

    options: list[ParsedOption] = []
    for idx, match in enumerate(matches):
        label = _normalize_spaces(match.group(1)).upper()
        option_text = _normalize_spaces(match.group(2))
        if option_text:
            options.append(ParsedOption(text=option_text, label=label, order_index=idx))
    return options


def _extract_inline_letter_options(text: str) -> tuple[str, list[ParsedOption]]:
    normalized = text.replace("\r", "")
    marker_pattern = re.compile(
        r"(?:(?<=^)|(?<=[\s,;:]))([A-I])(?:\s*[.)])?\s+(?=[A-Za-z])",
        re.IGNORECASE,
    )
    markers = list(marker_pattern.finditer(normalized))
    if len(markers) < 2:
        return _normalize_spaces(text), []

    stem = _normalize_spaces(normalized[: markers[0].start()])
    options: list[ParsedOption] = []

    for idx, marker in enumerate(markers):
        option_end = markers[idx + 1].start() if idx + 1 < len(markers) else len(normalized)
        option_text = _normalize_spaces(normalized[marker.end() : option_end])
        if option_text:
            options.append(
                ParsedOption(
                    text=option_text,
                    label=marker.group(1).upper(),
                    order_index=idx,
                )
            )

    if len(options) < 2:
        return _normalize_spaces(text), []

    return stem, options


def _extract_shared_options(instruction_text: str, q_type: str) -> list[ParsedOption]:
    if q_type not in {"MATCHING_HEADING", "MATCHING_FEATURES", "MATCHING_INFO", "DIAGRAM_LABELING"}:
        return []

    roman_options = _extract_labeled_options(instruction_text, r"[ivxlcdm]{1,8}")
    if len(roman_options) >= 3:
        return roman_options

    letter_options = _extract_labeled_options(instruction_text, r"[A-I]")
    if len(letter_options) >= 3:
        return letter_options

    return []


def _parse_question_sections(
    question_text: str, answers: dict[int, str], explanations: dict[int, str]
) -> list[ParsedQuestionGroup]:
    groups: list[ParsedQuestionGroup] = []

    header_pattern = r"(Questions?\s+\d+\s*(?:[-–]|to)\s*\d+)"
    parts = re.split(header_pattern, question_text, flags=re.IGNORECASE)

    i = 0
    while i < len(parts):
        if not re.match(r"(?i)Questions?\s+\d+", parts[i]):
            i += 1
            continue

        header = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2

        range_match = re.search(r"(\d+)\s*(?:[-–]|to)\s*(\d+)", header, flags=re.IGNORECASE)
        if not range_match:
            continue

        start_q = int(range_match.group(1))
        end_q = int(range_match.group(2))

        lines = [line for line in body.strip().split("\n")]
        instruction_lines: list[str] = []
        q_body_start = 0

        for j, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            if _is_question_line_start(stripped, start_q, end_q):
                q_body_start = j
                break

            if _is_passage_content_trash(stripped):
                q_body_start = j + 1
                continue

            instruction_lines.append(stripped)
            q_body_start = j + 1

        instruction_text = "\n".join(instruction_lines)
        instruction = _normalize_spaces(instruction_text)
        q_type = _detect_question_type(instruction)
        shared_options = _extract_shared_options(instruction_text, q_type)

        remaining = "\n".join(lines[q_body_start:])
        questions = _extract_individual_questions(
            remaining,
            start_q,
            end_q,
            q_type,
            answers,
            explanations,
            shared_options=shared_options,
        )

        if questions:
            groups.append(
                ParsedQuestionGroup(
                    instruction=instruction,
                    question_type=q_type,
                    start_q=start_q,
                    end_q=end_q,
                    questions=questions,
                )
            )

    return groups


def _extract_individual_questions(
    text: str,
    start_q: int,
    end_q: int,
    q_type: str,
    answers: dict[int, str],
    explanations: dict[int, str],
    shared_options: list[ParsedOption] | None = None,
) -> list[ParsedQuestion]:
    questions: list[ParsedQuestion] = []
    shared_options = shared_options or []

    pattern = r"(?:^|\n)\s*(\d{1,3})\s*[.)]?\s+"
    splits = re.split(pattern, text)

    idx = 1
    while idx < len(splits) - 1:
        try:
            q_num = int(splits[idx])
        except ValueError:
            idx += 2
            continue

        if not (start_q <= q_num <= end_q):
            idx += 2
            continue

        q_content_raw = splits[idx + 1].strip()
        if _is_trash_line(q_content_raw) or len(q_content_raw) < 2:
            idx += 2
            continue

        options: list[ParsedOption] = []
        clean_content = q_content_raw

        if q_type in {
            "MULTIPLE_CHOICE",
            "MCQ",
            "MCQ_MULTIPLE",
            "MATCHING_HEADING",
            "MATCHING_FEATURES",
            "MATCHING_INFO",
            "DIAGRAM_LABELING",
        }:
            block_options = _extract_labeled_options(q_content_raw, r"[A-I]")
            if len(block_options) >= 2:
                first_match = re.search(r"(?im)^\s*[A-I]\s*(?:[.)\-:]\s*|\s+)", q_content_raw)
                if first_match:
                    clean_content = q_content_raw[: first_match.start()].strip()
                options = block_options
            else:
                inline_content, inline_options = _extract_inline_letter_options(q_content_raw)
                if inline_options:
                    clean_content = inline_content
                    options = inline_options

        if not options and shared_options and q_type in {"MATCHING_HEADING", "MATCHING_FEATURES", "MATCHING_INFO", "DIAGRAM_LABELING"}:
            options = [ParsedOption(text=o.text, label=o.label, order_index=o.order_index) for o in shared_options]

        if q_type == "TRUE_FALSE_NG":
            options = [
                ParsedOption(text="TRUE", label="TRUE", order_index=0),
                ParsedOption(text="FALSE", label="FALSE", order_index=1),
                ParsedOption(text="NOT GIVEN", label="NOT GIVEN", order_index=2),
            ]

        if q_type == "YNNG":
            options = [
                ParsedOption(text="YES", label="YES", order_index=0),
                ParsedOption(text="NO", label="NO", order_index=1),
                ParsedOption(text="NOT GIVEN", label="NOT GIVEN", order_index=2),
            ]

        clean_content = _normalize_spaces(clean_content)
        if not clean_content:
            idx += 2
            continue

        correct = answers.get(q_num)
        explanation = explanations.get(q_num)

        questions.append(
            ParsedQuestion(
                number=q_num,
                content=clean_content,
                question_type=q_type,
                options=options,
                correct_answer=correct,
                explanation=explanation,
            )
        )

        idx += 2

    return questions
