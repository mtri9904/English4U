from __future__ import annotations

import logging

from gemini_utils import generate_structured_content_with_gemini_async
from schemas import RubricScore, StructuredSpeakingGeminiResult
from settings import GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES
from speaking.band_utils import clamp_band, round_band_half
from speaking.rubric_v3 import (
    get_llm_refiner_criteria,
    get_part_guidance_note,
    speaking_refiner_prompt_notes,
)

logger = logging.getLogger(__name__)

SPEAKING_GEMINI_RUBRICS = get_llm_refiner_criteria()


def build_speaking_gemini_prompt(
    transcript: str,
    *,
    question_prompt: str | None,
    part_number: int | None,
    prompt_type: str | None,
    features: dict[str, float | int | None],
    rule_rubric_bands: dict[str, float],
) -> str:
    part_context = get_part_guidance_note(part_number, prompt_type)
    
    metric_lines = [
        f"- Word count: {int(features['word_count'] or 0)} words",
        f"- Words per minute (Speech Rate): {features['words_per_minute'] if features['words_per_minute'] is not None else 'n/a'}",
        f"- Pause ratio: {round(float(features['pause_ratio'] or 0.0) * 100, 1)}%",
        f"- Speech ratio: {round(float(features['speech_ratio'] or 0.0) * 100, 1)}%",
        f"- Silero VAD available: {'yes' if int(features.get('vad_engine_available') or 0) == 1 else 'no'}",
        f"- Filler ratio: {round(float(features['filler_ratio'] or 0.0) * 100, 1)}%",
        f"- Connector count (Logical link words): {int(features['connector_count'] or 0)}",
        f"- Unique word ratio (Vocabulary variety): {round(float(features['unique_ratio'] or 0.0) * 100, 1)}%",
        f"- Lexical sophistication score: {features.get('lexical_sophistication_score') if features.get('lexical_sophistication_score') is not None else 'n/a'}",
        f"- Advanced/rare/common content-word ratios: {round(float(features.get('lexical_advanced_word_ratio') or 0.0) * 100, 1)}% advanced / {round(float(features.get('lexical_rare_word_ratio') or 0.0) * 100, 1)}% rare / {round(float(features.get('lexical_common_word_ratio') or 0.0) * 100, 1)}% common",
        f"- Lexical MTLD/HDD: {features.get('lexical_mtld') if features.get('lexical_mtld') is not None else 'n/a'} / {features.get('lexical_hdd') if features.get('lexical_hdd') is not None else 'n/a'}",
        f"- Average words per sentence unit: {round(float(features['avg_words_per_sentence'] or 0.0), 1)}",
        f"- LanguageTool grammar available: {'yes' if int(features.get('grammar_engine_available') or 0) == 1 else 'no'}",
        f"- LanguageTool grammar errors count: {int(features.get('grammar_error_count') or 0)}",
        f"- LanguageTool weighted error density: {float(features.get('grammar_error_density_per_100_words') or 0.0):.2f} errors per 100 words",
        f"- Grammar complexity score: {features.get('grammar_complexity_score') if features.get('grammar_complexity_score') is not None else 'n/a'}",
        f"- Subordinate clause markers count (Complex structures): {int(features.get('grammar_subordinate_clause_count') or 0)}",
        f"- Tense/modal variety markers: {int(features.get('grammar_tense_marker_variety') or 0)} tense groups, {int(features.get('grammar_modal_verb_count') or 0)} modals",
    ]
    metrics_block = "\n".join(metric_lines)
    topic_block = question_prompt.strip() if question_prompt and question_prompt.strip() else "No explicit prompt provided."

    return f"""You are a professional IELTS Speaking examiner with over 20 years of experience.
Your task is to evaluate this candidate's spoken response and assign band scores strictly following the official IELTS descriptors for 3 criteria ONLY: Fluency and Coherence (FC), Lexical Resource (LR), and Grammatical Range and Accuracy (GRA).
Do NOT score Pronunciation.

---
## YOUR GRADING PHILOSOPHY:
- **Band 8.0 - 9.0 (Very Good to Expert):** Speaks very fluently with only rare hesitation. Vocabulary is natural, rich, and appropriate. Grammar uses diverse complex structures with only rare minor slips (often ASR-induced).
- **Band 7.0 - 7.5 (Good):** Flow is good and natural. Vocabulary shows a wide range and good paraphrasing. Grammar successfully uses complex structures despite occasional errors.
- **Band 6.0 - 6.5 (Competent):** Willing to speak at length but has noticeable fillers. Vocabulary is sufficient. Grammar has a mix of simple and complex sentences.
- **Band 5.5 and below (Modest or lower):** Heavy hesitation, very limited vocabulary, or severe persistent grammatical breakdowns.

---
## REALISTIC EVALUATION PRINCIPLES:

1. **Open-Minded & Non-Mechanical Evaluation:**
   - **Do not penalize natural fillers:** Fillers like "uh", "um", "well", "you know" are completely natural when speakers are formulating thoughts. ONLY penalize under FC if fillers are excessively frequent to the point of breaking coherence or flow.
   - **Do not over-penalize minor repetitions:** Minor repetitions are common. If the candidate demonstrates good paraphrasing ability or uses varied terms later, ignore minor repetitions.

2. **Core Focuses by Criteria:**
   - **Lexical Resource (LR):** Prioritize natural collocations and idiomatic expressions. Do not over-reward candidates who throw in "big/complex" vocabulary words in an unnatural or forced context. Natural flow and appropriateness are key.
   - **Coherence (FC):** Focus on logical link of ideas. If the candidate answers the question directly and provides supporting arguments (especially in Part 3), award high marks for coherence.
   - **Grammatical Range (GRA):** Evaluate based on structural diversity (complex sentences, relative clauses, conditional clauses) rather than counting tiny grammatical slips. Focus on range first.

---
## IELTS Speaking Band Descriptor Summary

### Fluency and Coherence (FC)
- **Band 9:** Speaks fluently with only rare repetition or self-correction. Fully coherent with appropriate, natural use of cohesive devices.
- **Band 8:** Fluent with only occasional hesitation. Coherence sustained with only rare inappropriate use of cohesive devices.
- **Band 7:** Speaks at length without noticeable effort. Some hesitation but no loss of coherence. Appropriate use of discourse markers.
- **Band 6:** Willing to speak at length but may lose coherence at times. Uses a range of connectives/discourse markers but not always appropriately.
- **Band 5:** Usually maintains flow but uses repetition and self-correction. Over-relies on limited discourse markers.
- **Band 4:** Unable to speak at length without noticeable pauses. Limited use of discourse markers. Coherence is often missing.

### Lexical Resource (LR)
- **Band 9:** Full flexibility and precise use of vocabulary. Natural and sophisticated paraphrasing.
- **Band 8:** Fluent and flexible use of vocabulary. Occasional inaccuracies in word choice. Rare issues with paraphrasing.
- **Band 7:** Uses vocabulary with some flexibility and precision. Uses less common and idiomatic vocabulary with occasional inaccuracies.
- **Band 6:** Has a wide enough vocabulary to discuss topics at length with some paraphrasing. Occasional errors in word choice.
- **Band 5:** Manages to convey basic meaning but with limited range. Makes noticeable errors in word choice.
- **Band 4:** Limited vocabulary. May make many errors in word choice.

### Grammatical Range and Accuracy (GRA)
- **Band 9:** Uses a wide range of structures naturally and appropriately. Rare minor errors occur only as slips.
- **Band 8:** Wide range of structures, flexibly. Most sentences are error-free. Occasional slips.
- **Band 7:** Uses a range of complex structures with some flexibility. Frequently produces error-free sentences, though some errors persist.
- **Band 6:** Mix of simple and complex structures. Some accurate sentences but errors persist, especially in complex forms.
- **Band 5:** Produces basic sentence forms reasonably well. Limited range of complex structures with frequent errors.
- **Band 4:** Can produce basic sentence forms but grammatical errors are frequent and may impede communication.

---
## Part-Specific Guidance

{part_context}

**CRITICAL Part Calibration Rules:**
- **Part 1:** Candidates are expected to answer in a natural conversational style with shorter responses (typically 20–60 words per answer). Short but fluent and relevant answers here are normal and should NOT be penalized. An examiner would NOT downgrade a candidate for conciseness if the answer is fully relevant and delivered fluently. Part 1 answers rarely exceed 70 words from even Band 9 candidates.
- **Part 2:** Candidate should speak for 1–2 minutes. Word count and development are critical here.
- **Part 3:** Candidate should speak at length with discussion, opinions, and reasoning. Longer, more elaborate answers expected.

---
## How to Use the Provided Metrics

Use these objective signals to support your assessment, but DO NOT apply them as rigid mechanical cutoffs. They are supporting evidence, not rules:

**Fluency & Coherence signals:**
- WPM (Words Per Minute): IELTS candidates typically speak at 90–160 WPM. Lower WPM might indicate hesitation, but many articulate non-native speakers naturally speak slower. Alone, WPM does not determine band.
- Pause ratio: High pause ratios may indicate hesitation, but brief natural pauses for thinking are acceptable even at Band 7+.
- Filler ratio: Occasional fillers ('uh', 'well', 'you know') are normal. Only penalize FC if fillers are so frequent they disrupt coherence.
- Connector count: More connectors generally indicate better coherence, but quality of usage matters more than quantity.

**Lexical Resource signals:**
- Unique word ratio and MTLD: Higher values suggest richer vocabulary. But even Band 8 candidates naturally repeat content words when staying on topic.
- Advanced/rare word ratios: Presence of less-common vocabulary supports higher LR bands, but it is not mandatory for Band 7 if the candidate demonstrates range and appropriateness.

**Grammatical Range and Accuracy signals:**
- LanguageTool error count/density: **IMPORTANT - LanguageTool is a written-language grammar checker and frequently flags spoken constructions as errors (e.g., natural spoken phrasing, informal structures, ellipsis). Apply a generous discount: in spoken IELTS, a density of 4–8 errors/100 words may still correspond to Band 7 if the transcript shows clear complex structure and mostly accurate sentences. Only genuinely impeding grammatical errors should lower the band.**
- Subordinate clause markers: More complex structures support higher GRA bands.
- Sentence unit length: Longer, varied sentence units indicate structural complexity.

---
## Important Examiner Rules
- Bands must be IELTS half-bands (0, 0.5, 1.0, 1.5, ... up to 9.0).
- Be calibrated and fair. You are aiming to match what a trained human IELTS examiner would give.
- ASR compensation: The transcript is auto-generated. Obvious transcription errors (garbled words, wrong phonetic substitutions) should be ignored. Evaluate the candidate's likely intended speech.
- Spoken language compensation: Do NOT penalize natural spoken language properties (self-corrections, fillers, false starts) as if they were written grammar errors.
- Read the full transcript carefully before scoring. The transcript is your primary evidence.
- Keep all comments and improvement suggestions concise and written in Vietnamese.

---
Speaking Context:
- Interview part: {part_number if part_number is not None else "unknown"}
- Question/topic: {topic_block}

Observed Objective Signals (supporting evidence only):
{metrics_block}

Candidate Transcript:
\"\"\"
{transcript.strip()}
\"\"\"

Return ONLY valid JSON in this exact format. 
IMPORTANT: The band scores in the JSON example below are ONLY placeholders (e.g. 8.0, 8.5). You MUST calculate and assign the actual band scores based on your independent evaluation of the transcript. Do NOT simply copy the template numbers.

{{
  "rubrics": [
    {{
      "criteria": "Fluency and Coherence",
      "band": 8.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }},
    {{
      "criteria": "Lexical Resource",
      "band": 8.5,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }},
    {{
      "criteria": "Grammatical Range and Accuracy",
      "band": 8.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }}
  ]
}}"""


def normalize_speaking_gemini_result(
    result: StructuredSpeakingGeminiResult,
) -> dict[str, RubricScore]:
    normalized: dict[str, RubricScore] = {}

    for rubric in result.rubrics:
        matched_criteria = next(
            (
                criteria
                for criteria in SPEAKING_GEMINI_RUBRICS
                if criteria.lower() == rubric.criteria.strip().lower()
            ),
            None,
        )
        if matched_criteria is None or matched_criteria in normalized:
            continue

        normalized[matched_criteria] = RubricScore(
            criteria=matched_criteria,
            band=round_band_half(clamp_band(rubric.band)),
            comment=rubric.comment.strip() or "Gemini chưa trả nhận xét đủ rõ cho tiêu chí này.",
            improvements=rubric.improvements.strip() or "Cần luyện thêm tiêu chí này với câu trả lời tự nhiên hơn.",
        )

    return normalized


async def maybe_get_speaking_gemini_rubrics(
    transcript: str,
    *,
    question_prompt: str | None,
    answer_id: str,
    part_number: int | None,
    prompt_type: str | None,
    features: dict[str, float | int | None],
    rule_rubric_bands: dict[str, float],
    gemini_client: object | None,
) -> dict[str, RubricScore]:
    if gemini_client is None or int(features["word_count"] or 0) < 8:
        return {}

    try:
        result = await generate_structured_content_with_gemini_async(
            gemini_client,
            prompt=build_speaking_gemini_prompt(
                transcript,
                question_prompt=question_prompt,
                part_number=part_number,
                prompt_type=prompt_type,
                features=features,
                rule_rubric_bands=rule_rubric_bands,
            ),
            system_instruction=(
                "You are an IELTS Speaking examiner assistant. "
                "Return only valid JSON matching the requested schema."
            ),
            response_schema=StructuredSpeakingGeminiResult,
            model_candidates=GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES,
            error_context="speaking scoring",
            max_output_tokens=1200,
        )
        return normalize_speaking_gemini_result(result)
    except Exception:  # pragma: no cover
        logger.exception("Gemini speaking rubric refinement failed for answer %s.", answer_id)
        return {}
