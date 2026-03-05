import re
from dataclasses import dataclass, field


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
    OPTION_TYPES = {
        "MCQ", "MCQ_SINGLE", "MCQ_MULTIPLE", "MULTIPLE_CHOICE", "MULTIPLE_CHOICE_MULTI",
        "TFNG", "TRUE_FALSE_NG", "YNNG",
        "MATCHING_HEADING", "MATCHING_HEADINGS", "MATCHING_FEATURES", "MATCHING_INFO",
    }
    FILL_TYPES = {
        "SENTENCE_COMPLETION", "SUMMARY_COMPLETION", "TABLE_COMPLETION",
        "FLOWCHART_COMPLETION", "SHORT_ANSWER",
    }

    questions_data: list[dict] = []
    for group in passage.question_groups:
        for q in group.questions:
            q_type = q.question_type

            if q_type in OPTION_TYPES:
                options_data: list[dict] = []
                for opt in q.options:
                    is_correct = False
                    if q.correct_answer:
                        if q_type in ("MCQ", "MCQ_SINGLE", "MULTIPLE_CHOICE", "MATCHING_HEADING", "MATCHING_HEADINGS", "MATCHING_FEATURES", "MATCHING_INFO"):
                            is_correct = opt.label.upper() == q.correct_answer.strip().upper()
                        elif q_type in ("MCQ_MULTIPLE", "MULTIPLE_CHOICE_MULTI"):
                            answers = [a.strip().upper() for a in q.correct_answer.split(",")]
                            is_correct = opt.label.upper() in answers
                        elif q_type in ("TFNG", "TRUE_FALSE_NG", "YNNG"):
                            is_correct = (
                                opt.text.upper().replace(" ", "")
                                == q.correct_answer.upper().replace(" ", "")
                            )

                    options_data.append(
                        {"optionText": opt.text, "isCorrect": is_correct, "orderIndex": opt.order_index}
                    )

                questions_data.append({
                    "questionType": q_type,
                    "content": q.content,
                    "correctAnswer": None,
                    "explanation": q.explanation,
                    "points": 1.0,
                    "orderIndex": len(questions_data),
                    "options": options_data,
                })

            elif q_type in FILL_TYPES:
                content = q.content
                if q.correct_answer and "___" not in content:
                    content = content.replace(q.correct_answer, "___")

                questions_data.append({
                    "questionType": q_type,
                    "content": content,
                    "correctAnswer": q.correct_answer,
                    "explanation": q.explanation,
                    "points": 1.0,
                    "orderIndex": len(questions_data),
                    "options": [],
                })

            else:
                options_data = []
                for opt in q.options:
                    options_data.append(
                        {"optionText": opt.text, "isCorrect": opt.label.upper() == (q.correct_answer or "").strip().upper(), "orderIndex": opt.order_index}
                    )

                questions_data.append({
                    "questionType": q_type,
                    "content": q.content,
                    "correctAnswer": q.correct_answer if not q.options else None,
                    "explanation": q.explanation,
                    "points": 1.0,
                    "orderIndex": len(questions_data),
                    "options": options_data,
                })

    return {
        "title": passage.title,
        "content": passage.content,
        "audioUrl": None,
        "orderIndex": order_index,
        "questions": questions_data,
    }


def _extract_answer_key(raw_text: str) -> tuple[dict[int, str], dict[int, str], str]:
    answers: dict[int, str] = {}
    explanations: dict[int, str] = {}

    answer_section_patterns = [
        r"(?i)(?:ANSWER\s*KEY|ANSWER\s*KEYS?|ANSWERS?\s*:?)\s*\n([\s\S]+?)$",
        r"(?i)(?:KEY|ĐÁP\s*ÁN|ANSWER\s+SHEET)\s*:?\s*\n([\s\S]+?)$",
    ]

    text_without = raw_text

    for pattern in answer_section_patterns:
        match = re.search(pattern, raw_text)
        if not match:
            continue

        answer_block = match.group(1)

        for ans_match in re.finditer(
            r"(\d+)\s*[.):\s]+\s*"
            r"([A-Ga-gi-xi-x]|TRUE|FALSE|NOT\s*GIVEN|YES|NO"
            r"|[A-Za-z][\w\s',.\-]{0,60})",
            answer_block,
            re.IGNORECASE,
        ):
            num = int(ans_match.group(1))
            ans = ans_match.group(2).strip()
            ans = re.sub(r"\s+", " ", ans)
            if num <= 50:
                answers[num] = ans

        explanation_pattern = (
            r"(\d+)\s*[.):\s]+\s*"
            r"(?:[A-Ga-g]|TRUE|FALSE|NOT\s*GIVEN|YES|NO|[\w\s',.\-]+?)"
            r"\s*[-–—:]\s*(.+?)(?=\d+\s*[.):\s]|\Z)"
        )
        for exp_match in re.finditer(explanation_pattern, answer_block, re.IGNORECASE | re.DOTALL):
            num = int(exp_match.group(1))
            explanation_text = exp_match.group(2).strip()
            explanation_text = re.sub(r"\s+", " ", explanation_text)
            if num <= 50 and len(explanation_text) > 5:
                explanations[num] = explanation_text

        if len(answers) >= 5:
            text_without = raw_text[: match.start()].strip()
            break
        answers = {}
        explanations = {}

    return answers, explanations, text_without


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
    q_match = re.search(r"(?i)\n\s*Questions?\s+\d+\s*[-–to]+\s*\d+", section_text)
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

    if "complete" in low or "fill" in low or "no more than" in low:
        return "SENTENCE_COMPLETION"
    if "one word" in low or "two words" in low or "three words" in low:
        return "SENTENCE_COMPLETION"

    if "short answer" in low:
        return "SHORT_ANSWER"

    if "choose" in low or "correct letter" in low or "multiple" in low:
        return "MULTIPLE_CHOICE"

    return "MULTIPLE_CHOICE"


def _parse_question_sections(
    question_text: str, answers: dict[int, str], explanations: dict[int, str]
) -> list[ParsedQuestionGroup]:
    groups: list[ParsedQuestionGroup] = []

    header_pattern = r"(Questions?\s+\d+\s*[-–to]+\s*\d+)"
    parts = re.split(header_pattern, question_text, flags=re.IGNORECASE)

    i = 0
    while i < len(parts):
        if not re.match(r"(?i)Questions?\s+\d+", parts[i]):
            i += 1
            continue

        header = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2

        range_match = re.search(r"(\d+)\s*[-–to]+\s*(\d+)", header)
        if not range_match:
            continue

        start_q = int(range_match.group(1))
        end_q = int(range_match.group(2))

        lines = body.strip().split("\n")
        instruction_lines: list[str] = []
        q_body_start = 0

        for j, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            if re.match(r"^\d+\s", stripped):
                q_body_start = j
                break

            if _is_passage_content_trash(stripped):
                q_body_start = j + 1
                continue

            instruction_lines.append(stripped)
            q_body_start = j + 1

        instruction = " ".join(instruction_lines)
        q_type = _detect_question_type(instruction)

        remaining = "\n".join(lines[q_body_start:])
        questions = _extract_individual_questions(remaining, start_q, end_q, q_type, answers, explanations)

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
) -> list[ParsedQuestion]:
    questions: list[ParsedQuestion] = []

    pattern = r"(?:^|\n)\s*(\d+)\s+"
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

        if _is_trash_line(q_content_raw) or len(q_content_raw) < 3:
            idx += 2
            continue

        options: list[ParsedOption] = []
        clean_content = q_content_raw

        if q_type in ("MULTIPLE_CHOICE", "MCQ", "MATCHING_HEADING", "MATCHING_FEATURES", "MATCHING_INFO"):
            opt_matches = list(
                re.finditer(
                    r"(?:^|\n)\s*([A-E])\s*[.)]\s*(.+?)(?=\n\s*[A-E]\s*[.)]|\Z)",
                    q_content_raw,
                    re.DOTALL,
                )
            )
            if opt_matches:
                clean_content = q_content_raw[: opt_matches[0].start()].strip()
                for oi, om in enumerate(opt_matches):
                    opt_text = om.group(2).strip()
                    opt_text = re.sub(r"\s+", " ", opt_text)
                    if len(opt_text) > 0:
                        options.append(
                            ParsedOption(text=opt_text, label=om.group(1), order_index=oi)
                        )

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

        clean_content = re.sub(r"\s+", " ", clean_content).strip()

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
