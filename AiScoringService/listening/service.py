from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from collections.abc import Callable
from urllib.parse import urlparse
from urllib.request import urlopen

from faster_whisper.transcribe import Segment

from listening.alignment import (
    detect_question_range_scopes,
    detect_section_scopes,
    find_scope_for_question,
    find_section_scope_for_question,
    get_question_part_number,
    split_listening_transcript_into_parts,
)
from listening.local_alignment import (
    build_alignment_candidate_windows,
    collapse_alignment_to_anchor_segments,
    fill_map_labelling_gaps,
    get_alignment_answer_candidates,
    get_alignment_evidence_tokens,
    optimize_alignment_sequences,
    reconcile_alignment_gaps_and_duplicates,
    select_fallback_alignment_candidate,
)
from schemas import (
    ListeningAlignmentQuestion,
    ListeningTranscriptAlignmentRequest,
    ListeningTranscriptAlignmentResponse,
    ListeningTranscriptQuestionAlignment,
    ListeningTranscriptRequest,
    ListeningTranscriptResponse,
    ListeningTranscriptSegment,
)

logger = logging.getLogger(__name__)

TranscribeAudioFile = Callable[..., tuple[list[Segment], str]]


def download_audio_url_to_tempfile(audio_url: str) -> str:
    parsed = urlparse(audio_url)
    suffix = os.path.splitext(parsed.path or "")[1] or ".mp3"

    with urlopen(audio_url) as response:
        content = response.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        return tmp.name


async def build_listening_transcript_response(
    request: ListeningTranscriptRequest,
    *,
    transcribe_audio_file: TranscribeAudioFile,
) -> ListeningTranscriptResponse:
    audio_url = request.audio_url.strip()
    if not audio_url:
        raise ValueError("audio_url is required.")

    try:
        tmp_path = await asyncio.to_thread(download_audio_url_to_tempfile, audio_url)
    except Exception as ex:  # pragma: no cover
        logger.exception("Failed to download listening audio from %s", audio_url)
        raise ValueError(f"Could not download audio from URL: {ex}") from ex

    try:
        normalized_segments, transcript_text = await asyncio.to_thread(
            transcribe_audio_file,
            tmp_path,
            language=(request.language or "en").strip() or "en",
        )
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not normalized_segments:
        raise ValueError("Could not transcribe audio.")

    return ListeningTranscriptResponse(
        segments=[
            ListeningTranscriptSegment(
                start_time=round(segment.start, 2),
                end_time=round(segment.end, 2) if segment.end is not None else None,
                text=segment.text.strip(),
            )
            for segment in normalized_segments
        ],
        transcript_text=transcript_text,
    )


async def align_listening_transcript_part(
    part_number: int,
    transcript_segments: list[ListeningTranscriptSegment],
    questions: list[ListeningAlignmentQuestion],
) -> list[ListeningTranscriptQuestionAlignment]:
    if not transcript_segments or not questions:
        return []

    logger.info(
        "Aligning IELTS listening part %s with %s transcript segments and %s questions.",
        part_number,
        len(transcript_segments),
        len(questions),
    )

    question_scopes = detect_question_range_scopes(transcript_segments)
    section_scopes = detect_section_scopes(transcript_segments)
    candidate_map_by_question: dict[int, dict[int, dict]] = {}
    candidate_lists_by_question: dict[int, list[dict]] = {}
    direct_alignments: list[ListeningTranscriptQuestionAlignment] = []
    pending_batch: list[tuple[ListeningAlignmentQuestion, list[dict]]] = []

    for question in sorted(questions, key=lambda item: item.question_number):
        allowed_segment_range = (
            find_scope_for_question(question.question_number, question_scopes)
            or find_section_scope_for_question(question.question_number, section_scopes)
            or (0, len(transcript_segments) - 1)
        )
        candidates = build_alignment_candidate_windows(
            transcript_segments,
            question,
            allowed_segment_range=allowed_segment_range,
        )
        candidate_lists_by_question[question.question_number] = candidates
        if not candidates:
            direct_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=[],
                    confidence="low",
                )
            )
            continue

        candidate_map_by_question[question.question_number] = {
            candidate["candidate_id"]: candidate
            for candidate in candidates
        }

        if len(candidates) == 1 and candidates[0]["score"] >= 12:
            direct_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=candidates[0]["segment_indexes"],
                    confidence="high",
                )
            )
            continue

        pending_batch.append((question, candidates))

    batch_alignments: list[ListeningTranscriptQuestionAlignment] = []
    if pending_batch:
        for question, candidates in pending_batch:
            fallback_candidate, fallback_confidence = select_fallback_alignment_candidate(
                candidates,
                requires_direct_evidence=bool(
                    get_alignment_answer_candidates(question) or get_alignment_evidence_tokens(question)
                ),
            )
            batch_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=fallback_candidate["segment_indexes"] if fallback_candidate else [],
                    confidence=fallback_confidence,
                )
            )

    all_alignments = [
        *direct_alignments,
        *batch_alignments,
    ]
    alignments_by_question = {
        alignment.question_number: alignment
        for alignment in all_alignments
    }
    fill_map_labelling_gaps(
        questions,
        alignments_by_question,
        transcript_segments,
        question_scopes,
        section_scopes,
    )
    reconcile_alignment_gaps_and_duplicates(
        questions,
        alignments_by_question,
        candidate_lists_by_question,
        question_scopes,
        section_scopes,
    )
    optimize_alignment_sequences(
        questions,
        alignments_by_question,
        candidate_lists_by_question,
        question_scopes,
        section_scopes,
    )
    collapse_alignment_to_anchor_segments(
        questions,
        alignments_by_question,
        transcript_segments,
    )

    part_alignments = list(alignments_by_question.values())
    part_alignments.sort(key=lambda alignment: alignment.question_number)
    return part_alignments


async def build_listening_alignment_response(
    request: ListeningTranscriptAlignmentRequest,
) -> ListeningTranscriptAlignmentResponse:
    transcript_segments = [
        segment for segment in request.transcript_segments
        if segment.text and segment.text.strip()
    ]
    if not transcript_segments:
        raise ValueError("transcript_segments are required.")

    questions = [
        question for question in request.questions
        if question.question_number > 0
    ]
    if not questions:
        raise ValueError("questions are required.")

    transcript_parts = split_listening_transcript_into_parts(transcript_segments)

    questions_by_part: dict[int, list[ListeningAlignmentQuestion]] = {
        1: [],
        2: [],
        3: [],
        4: [],
    }
    for question in sorted(questions, key=lambda item: item.question_number):
        questions_by_part.setdefault(get_question_part_number(question.question_number), []).append(question)

    part_jobs: list[tuple[dict, asyncio.Task]] = []
    for transcript_part in transcript_parts:
        part_questions = questions_by_part.get(transcript_part["part_number"], [])
        if not part_questions:
            continue

        task = asyncio.create_task(
            align_listening_transcript_part(
                transcript_part["part_number"],
                transcript_part["segments"],
                part_questions,
            )
        )
        part_jobs.append((transcript_part, task))

    all_alignments: list[ListeningTranscriptQuestionAlignment] = []
    for transcript_part, task in part_jobs:
        part_alignments = await task
        global_start_index = transcript_part["global_start_index"]
        for alignment in part_alignments:
            all_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=alignment.question_number,
                    segment_indexes=[
                        global_start_index + segment_index
                        for segment_index in alignment.segment_indexes
                    ],
                    confidence=alignment.confidence,
                )
            )

    all_alignments.sort(key=lambda alignment: alignment.question_number)
    return ListeningTranscriptAlignmentResponse(alignments=all_alignments)
