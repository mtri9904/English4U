from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

from speaking_eval_common import load_jsonl


PART2_PROMPT_OVERRIDES = {
    "ielts_blog_arun_band6": "Describe a restaurant you like.",
    "ielts_blog_rafael_band8": "Describe a restaurant you like.",
    "ielts_blog_joanne_band8_5": "Describe your favorite restaurant.",
    "ielts_blog_aleks_band7": "Describe a successful businessman or businesswoman that you know.",
    "ielts_blog_magda_band7_5": "Describe a person you admire.",
    "ielts_blog_murat_band7_5": "Describe a memorable journey that you once took.",
    "ielts_blog_nabial_band8": "Describe a film that you enjoyed.",
    "ross_youtube_band6_5_2022_10_29": "Describe a time you received a call from someone you did not know.",
    "ross_youtube_band6_5_2021_08_14": "Describe a happy childhood event.",
    "ross_youtube_band8_2021_04_03": "Describe a hobby you enjoy doing.",
}

PART2_BULLETS = {
    "restaurant": [
        "where the restaurant is",
        "what kind of food it serves",
        "when you first went there",
        "and explain why you like it",
    ],
    "business": [
        "who this person is",
        "what business they do",
        "how you know this person",
        "and explain why you think they are successful",
    ],
    "person": [
        "who this person is",
        "how you know this person",
        "what this person does",
        "and explain why you admire this person",
    ],
    "journey": [
        "where you went",
        "who you went with",
        "what happened on the journey",
        "and explain why it was memorable",
    ],
    "film": [
        "what the film was",
        "when and where you watched it",
        "what it was about",
        "and explain why you enjoyed it",
    ],
    "call": [
        "when you received the call",
        "who called you",
        "what the call was about",
        "and explain how you felt about it",
    ],
    "childhood": [
        "what happened",
        "when and where it happened",
        "who was with you",
        "and explain why it was a happy event",
    ],
    "hobby": [
        "what the hobby is",
        "what materials or equipment you need",
        "when you started doing it",
        "and explain why you enjoy it",
    ],
}

QUESTION_PATTERN = re.compile(
    r"\b("
    r"(?:Can|Could|Would|Do|Did|What|Why|How|Where|When|Is|Are|Have|Has|Who)"
    r"[^?]{4,180}\?"
    r")",
    re.IGNORECASE,
)

QUESTION_START_PATTERN = re.compile(
    r"\b("
    r"What|Why|How|Where|When|Who|Describe|"
    r"Can you|Could you|Would you|Do you|Did you|"
    r"Is|Are|Have|Has"
    r")\b",
    re.IGNORECASE,
)

DESCRIBE_PATTERN = re.compile(r"\bDescribe [^.?!]{8,160}[.?!]?", re.IGNORECASE)

PART2_CUE_PATTERNS = [
    re.compile(r"(?:your topic is|so here is a topic,?|i would like you to)\s+(describe [^.?!]{8,180})", re.IGNORECASE),
    re.compile(r"(describe [^.?!]{8,180})\s+(?:okay|you have one minute|so there you are|it's your cue card)", re.IGNORECASE),
]

TEST_END_MARKERS = [
    "that's the end of the speaking test",
    "this is the end of the speaking test",
    "that's the end of the test",
    "this is the end of the test",
    "do you want to know what band score",
    "just before i share your band score",
    "we'll go through your band score",
]

PART2_MARKERS = [
    "let's move on to the next part",
    "now in part two",
    "now i'm going to give you a topic",
    "i'm now going to give you a topic",
    "in the second part",
    "now in the second part",
    "right so i'm now going to give you a topic",
    "all right, now i'm going to give you a topic",
]

PART3_MARKERS = [
    "let's move on to the next section",
    "let's go to part three",
    "now in this part",
    "we've been talking",
    "we have been talking",
    "i'd now like to ask you some questions related",
    "now i'd like to ask you some questions related",
    "i want to ask you some questions related",
]

FIRST_PART_MARKERS = [
    "first part of the exam",
    "first part of the test",
    "this first part",
    "part of the exam i will ask you some personal questions",
]

DROP_PROMPT_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"can i have your card",
        r"have your card",
        r"band score",
        r"performance today",
        r"do you want to know",
        r"can i see your identification",
        r"may i see",
    ]
]


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def read_json(path: Path) -> dict[str, Any]:
    row = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(row, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return row


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def clean_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def lower_find(text: str, markers: list[str], start: int = 0) -> int | None:
    lowered = text.lower()
    found = [lowered.find(marker, start) for marker in markers]
    valid = [index for index in found if index >= 0]
    return min(valid) if valid else None


def section_texts(transcript: str) -> dict[str, str]:
    text = clean_space(transcript)
    part2_start = lower_find(text, PART2_MARKERS)
    part3_start = lower_find(text, PART3_MARKERS, part2_start or 0)
    test_end = lower_find(text, TEST_END_MARKERS, part3_start or 0)
    first_part_start = lower_find(text, FIRST_PART_MARKERS)

    if part2_start is None:
        part2_start = len(text)
    if part3_start is None:
        part3_start = len(text)
    if test_end is None:
        test_end = len(text)
    if first_part_start is None:
        first_part_start = 0

    return {
        "part1": text[first_part_start:part2_start],
        "part2": text[part2_start:part3_start],
        "part3": text[part3_start:test_end],
    }


def normalise_question(question: str) -> str:
    cleaned = clean_space(question)
    starts = list(QUESTION_START_PATTERN.finditer(cleaned))
    if starts:
        first = starts[0].group(1).lower()
        prefer_first = (
            starts[0].start() <= 25
            and first in {"can you", "could you", "would you", "do you", "did you", "what", "why", "how", "describe"}
        )
        chosen = starts[0] if prefer_first or len(starts) == 1 else starts[-1]
        cleaned = cleaned[chosen.start() :]
    cleaned = re.sub(r"^(Okay|Right|Great|Good|Wonderful|Fabulous|Thank you)[,. ]+", "", cleaned, flags=re.IGNORECASE)
    lowered = cleaned.lower()
    replacements = [
        ("house or a pond", "house or an apartment"),
        ("things you like to do weekends", "things you like to do at weekends"),
        ("women like shopping or the men", "women like shopping more than men"),
        ("do you use the internet?", "How often do you use the internet?"),
        ("is live music popular in your country", "Is live music popular in your country"),
        ("is your favorite celebrity", "Who is your favorite celebrity"),
        ("have learned is your country changing rapidly", "Is your country changing rapidly"),
        ("have changes in technology", "In what ways have changes in technology"),
        ("what ways have changes in technology", "In what ways have changes in technology"),
        ("in in what ways", "In what ways"),
        ("is it to encourage children to take up hobbies", "How important is it to encourage children to take up hobbies"),
        ("are some of the things you like to do", "What are some of the things you like to do"),
        ("are some of the things that families do", "What are some of the things that families do"),
        ("are common in your culture", "What hobbies are common in your culture"),
    ]
    for source, target in replacements:
        if source in lowered:
            pattern = re.compile(re.escape(source), re.IGNORECASE)
            cleaned = pattern.sub(target, cleaned)
            lowered = cleaned.lower()
    cleaned = cleaned[0].upper() + cleaned[1:] if cleaned else cleaned
    return cleaned


def dedupe(items: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = re.sub(r"[^a-z0-9]+", " ", item.lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def extract_questions(section: str, *, include_describe: bool = False) -> list[str]:
    raw_matches: list[tuple[int, str]] = [(match.start(), match.group(1)) for match in QUESTION_PATTERN.finditer(section)]
    if include_describe:
        raw_matches.extend((match.start(), match.group(0)) for match in DESCRIBE_PATTERN.finditer(section))
    questions = []
    for _, raw_question in sorted(raw_matches, key=lambda item: item[0]):
        question = normalise_question(raw_question)
        if len(question.split()) < 4:
            continue
        if any(pattern.search(question) for pattern in DROP_PROMPT_PATTERNS):
            continue
        questions.append(question)
    return dedupe(questions)


def extract_part2_prompt(sample_id: str, part2_text: str, metadata_prompt: str | None) -> tuple[str, str]:
    if metadata_prompt:
        return metadata_prompt, "metadata"
    if sample_id in PART2_PROMPT_OVERRIDES:
        return PART2_PROMPT_OVERRIDES[sample_id], "override_from_transcript_answer"
    for pattern in PART2_CUE_PATTERNS:
        match = pattern.search(part2_text)
        if match:
            prompt = normalise_question(match.group(1).rstrip("."))
            if not prompt.endswith("."):
                prompt += "."
            return prompt, "transcript_regex"
    return "Describe the topic discussed in Part 2.", "fallback"


def cue_card_bullets(prompt: str) -> list[str]:
    lowered = prompt.lower()
    for key, bullets in PART2_BULLETS.items():
        if key in lowered:
            return bullets
    return [
        "what it is",
        "when it happened or when you do it",
        "who was involved",
        "and explain why it is important to you",
    ]


def turn_prompt_fallback(turns: list[dict[str, str]], part_number: int) -> list[str]:
    prompts: list[str] = []
    for turn in turns:
        try:
            if int(turn.get("part_number") or 0) != part_number:
                continue
        except ValueError:
            continue
        prompt = turn.get("prompt_guess") or ""
        questions = extract_questions(prompt, include_describe=(part_number == 1))
        prompts.extend(questions)
    return dedupe(prompts)


def sample_turns_by_id(review_csv_path: Path) -> dict[str, list[dict[str, str]]]:
    if not review_csv_path.exists():
        return {}
    with review_csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows_by_sample: dict[str, list[dict[str, str]]] = {}
        for row in reader:
            sample_id = row.get("sample_id")
            if sample_id:
                rows_by_sample.setdefault(sample_id, []).append(dict(row))
        return rows_by_sample


def build_test(
    *,
    sample: dict[str, Any],
    transcript_row: dict[str, Any],
    turns: list[dict[str, str]],
) -> dict[str, Any]:
    sample_id = str(sample["sample_id"])
    transcript = str(transcript_row.get("transcript_text") or "")
    sections = section_texts(transcript)
    part1_questions = extract_questions(sections["part1"], include_describe=True)
    part3_questions = extract_questions(sections["part3"])

    if len(part1_questions) < 3:
        part1_questions = turn_prompt_fallback(turns, 1)
    if len(part3_questions) < 2:
        part3_questions = turn_prompt_fallback(turns, 3)

    metadata_part2_prompt = None
    for segment in sample.get("candidate_segments") or []:
        if segment.get("part_number") == 2 and segment.get("prompt"):
            metadata_part2_prompt = str(segment["prompt"])
            break
    part2_prompt, part2_source = extract_part2_prompt(sample_id, sections["part2"], metadata_part2_prompt)

    return {
        "sample_id": sample_id,
        "source_page_url": sample.get("source_page_url"),
        "claimed_overall_band": sample.get("claimed_overall_band"),
        "candidate_profile": sample.get("candidate_profile") or {},
        "reconstruction_source": "full_transcript_asr",
        "reconstruction_warning": "Reconstructed from ASR transcript; verify against the original video/audio before treating as official.",
        "parts": {
            "part1": {
                "title": "Part 1 - Introduction and Interview",
                "questions": [{"order": index + 1, "prompt": prompt} for index, prompt in enumerate(part1_questions)],
            },
            "part2": {
                "title": "Part 2 - Long Turn",
                "cue_card": {
                    "prompt": part2_prompt,
                    "bullets": cue_card_bullets(part2_prompt),
                    "source": part2_source,
                },
            },
            "part3": {
                "title": "Part 3 - Discussion",
                "questions": [{"order": index + 1, "prompt": prompt} for index, prompt in enumerate(part3_questions)],
            },
        },
    }


def write_markdown(path: Path, test: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"# Reconstructed Speaking Test - {test['sample_id']}",
        "",
        f"- Source: {test.get('source_page_url')}",
        f"- Claimed overall band: {test.get('claimed_overall_band')}",
        f"- Warning: {test.get('reconstruction_warning')}",
        "",
        "## Part 1",
        "",
    ]
    for question in test["parts"]["part1"]["questions"]:
        lines.append(f"{question['order']}. {question['prompt']}")

    cue = test["parts"]["part2"]["cue_card"]
    lines.extend(["", "## Part 2", "", cue["prompt"], "", "You should say:"])
    for bullet in cue["bullets"]:
        lines.append(f"- {bullet}")

    lines.extend(["", "## Part 3", ""])
    for question in test["parts"]["part3"]["questions"]:
        lines.append(f"{question['order']}. {question['prompt']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate reconstructed IELTS Speaking test prompts from full transcripts.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--transcript-dir", default="evaluation/reports/full_transcripts")
    parser.add_argument("--review-csv", default="evaluation/reports/full_transcripts/candidate_turns.full_audio.review.csv")
    parser.add_argument("--output-dir", default="evaluation/reports/generated_tests")
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    transcript_dir = (service_root / args.transcript_dir) if not Path(args.transcript_dir).is_absolute() else Path(args.transcript_dir)
    review_csv_path = (service_root / args.review_csv) if not Path(args.review_csv).is_absolute() else Path(args.review_csv)
    output_dir = (service_root / args.output_dir) if not Path(args.output_dir).is_absolute() else Path(args.output_dir)

    samples = load_jsonl(metadata_path)
    turns_by_sample = sample_turns_by_id(review_csv_path)
    tests: list[dict[str, Any]] = []
    index_rows: list[dict[str, Any]] = []

    for sample in samples:
        sample_id = str(sample["sample_id"])
        transcript_path = transcript_dir / f"{sample_id}.json"
        if not transcript_path.exists():
            print(f"SKIP {sample_id}: missing transcript {transcript_path}")
            continue
        transcript_row = read_json(transcript_path)
        test = build_test(sample=sample, transcript_row=transcript_row, turns=turns_by_sample.get(sample_id, []))
        tests.append(test)
        write_markdown(output_dir / f"{sample_id}.md", test)
        index_rows.append(
            {
                "sample_id": sample_id,
                "part1_questions": len(test["parts"]["part1"]["questions"]),
                "part2_prompt": test["parts"]["part2"]["cue_card"]["prompt"],
                "part2_source": test["parts"]["part2"]["cue_card"]["source"],
                "part3_questions": len(test["parts"]["part3"]["questions"]),
                "markdown_path": str((output_dir / f"{sample_id}.md").relative_to(service_root)),
            }
        )

    write_jsonl(output_dir / "speaking_tests.reconstructed.jsonl", tests)
    write_csv(
        output_dir / "speaking_tests.index.csv",
        index_rows,
        ["sample_id", "part1_questions", "part2_prompt", "part2_source", "part3_questions", "markdown_path"],
    )
    print(f"generated_tests={len(tests)}")
    print(f"wrote_output_dir={output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
