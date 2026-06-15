# Speaking evaluation phase 1

Phase 1 creates the measurement layer for IELTS-style Speaking scoring. It does
not download YouTube content. It stores source links, labels, manual timestamps,
and optional local audio references when the project has permission to process
the media.

## Dataset levels

- `bronze`: source link only, no reliable band label. Use for pipeline smoke
  tests, ASR, diarization, and segmentation checks.
- `silver`: source link plus claimed overall band or teacher/channel feedback.
  Use for rough regression checks and finding large scoring errors.
- `gold_candidate`: source link plus criterion-level scores from an evaluation
  report or examiner-style feedback. Use for calibration candidates after manual
  review confirms the source and timestamps.
- `gold`: locally reviewed sample with criterion-level scores accepted by the
  project. Use for calibration and final evaluation.

## What happens from a link

1. Store the source page or YouTube URL in `youtube_silver_samples.jsonl`.
2. Confirm whether the source exposes only an overall band or all four criteria.
3. Add candidate-only segments manually or from diarization output.
4. If you have permission to process the media, place the audio path in
   `local_audio_path`.
5. Run the scoring pipeline on candidate-only audio/transcript.
6. Compare predicted criterion bands with labels using `evaluate_speaking_predictions.py`.

## Local audio placement

Put downloaded audio files under:

```text
AiScoringService/evaluation/audio/
```

Recommended filenames match `sample_id`, for example:

```text
AiScoringService/evaluation/audio/ielts_blog_aleks_band7.mp3
AiScoringService/evaluation/audio/ielts_blog_magda_band7_5.mp3
```

Then update the matching JSONL row:

```json
"local_audio_path": "evaluation/audio/ielts_blog_aleks_band7.mp3"
```

Raw audio, cut segments, and generated reports are ignored by git. Metadata and
scripts stay versioned; large or copyrighted media stays local.

## Commands

Validate metadata:

```powershell
.\venv\Scripts\python.exe -B evaluation\validate_speaking_metadata.py evaluation\youtube_silver_samples.jsonl
```

Check which samples are ready for scoring:

```powershell
.\venv\Scripts\python.exe -B evaluation\check_scoring_readiness.py evaluation\youtube_silver_samples.jsonl
```

Create full ASR transcripts for local audio:

```powershell
.\venv\Scripts\python.exe -B evaluation\transcribe_speaking_audio.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --skip-existing
```

Generated transcript files:

- `evaluation/reports/full_transcripts/<sample_id>.json`: full transcript,
  Whisper segments, and word timestamps for one audio.
- `evaluation/reports/full_transcripts/full_transcripts.index.csv`: one row
  per audio with duration, word count, and draft turn count.
- `evaluation/reports/full_transcripts/candidate_turns.full_audio.review.csv`:
  draft candidate turns extracted from the full audio. Review this file before
  copying timestamps to metadata.
- `evaluation/reports/full_transcripts/candidate_segments.scoring.proposed.jsonl`:
  metadata-shaped scoring segment suggestions with intro/ID-check turns filtered
  out. This is still draft until reviewed.

Optionally diarize local full-interview audio that contains both examiner and
candidate voices. This is a local evaluation/preparation step only; student web
submission scoring does not use diarization because those recordings are
candidate-only.

```powershell
.\venv\Scripts\python.exe -B evaluation\diarize_speaking_full_audio.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --num-speakers 2 `
  --skip-existing
```

Generated diarization files:

- `evaluation/reports/full_diarization/<sample_id>.json`: pyannote speaker
  segments for a full interview.
- `evaluation/reports/full_diarization/full_diarization.index.csv`: one row per
  audio with speaker count and candidate-speaker guess.
- `evaluation/reports/full_diarization/speaker_turns.review.csv`: editable
  examiner/candidate speaker-turn review sheet.

Build candidate-only segment proposals from the full transcript plus pyannote
speaker turns:

```powershell
.\venv\Scripts\python.exe -B evaluation\build_candidate_segments_from_diarization.py `
  --metadata evaluation\youtube_silver_samples.jsonl
```

Generated diarized segment files:

- `evaluation/reports/diarized_candidate_segments/candidate_turns.diarized.review.csv`:
  editable candidate turn review sheet.
- `evaluation/reports/diarized_candidate_segments/candidate_segments.diarized.proposed.jsonl`:
  metadata-shaped candidate-only segment proposals.
- `evaluation/reports/diarized_candidate_segments/candidate_segments.diarized.index.csv`:
  per-sample counts and candidate-speaker guess summary.

Promote reviewed diarized proposals into metadata:

```powershell
.\venv\Scripts\python.exe -B evaluation\build_speaking_metadata_from_segments.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --segments evaluation\reports\diarized_candidate_segments\candidate_segments.diarized.proposed.jsonl `
  --output evaluation\reports\diarized_candidate_segments\youtube_silver_samples.diarized_segments.jsonl
```

Then cut candidate-only WAV segments from that metadata:

```powershell
.\venv\Scripts\python.exe -B evaluation\run_speaking_baseline.py `
  --metadata evaluation\reports\diarized_candidate_segments\youtube_silver_samples.diarized_segments.jsonl `
  --cut-only `
  --segments-root evaluation\segments\diarized_candidate_segments
```

Audit local Pronunciation component scores for the cut candidate-only WAV
segments without calling the scoring API or Gemini:

```powershell
.\venv\Scripts\python.exe -B evaluation\audit_speaking_pronunciation.py `
  --metadata evaluation\reports\diarized_candidate_segments\youtube_silver_samples.diarized_segments.jsonl `
  --segments-root evaluation\segments\diarized_candidate_segments `
  --sample-id ielts_blog_joanne_band8_5 `
  --segment-limit 1
```

Generated pronunciation audit files:

- `evaluation/reports/pronunciation_audit/pronunciation_audit.csv`: one row per
  candidate segment with `segmental_score`, `prosody_score`,
  `intelligibility_score`, `acoustic_pronunciation_score`, phone timing, phone
  match, warnings, and top issue snippets.
- `evaluation/reports/pronunciation_audit/pronunciation_audit.details.jsonl`:
  machine-readable detail rows.
- `evaluation/reports/pronunciation_audit/pronunciation_audit.summary.json`:
  aggregate averages/min/max values and missing-tool/error counts.

This audit uses the same local Pronunciation stack as submit scoring
(MFA/Praat/Allosaurus in strict mode). It fails or records an error when strong
evidence cannot be produced; it does not downgrade to weaker pronunciation
evidence.

Build a metadata draft from proposed or reviewed candidate segments:

```powershell
.\venv\Scripts\python.exe -B evaluation\build_speaking_metadata_from_segments.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --segments evaluation\reports\full_transcripts\candidate_segments.scoring.proposed.jsonl `
  --output evaluation\reports\full_transcripts\youtube_silver_samples.scoring_segments.draft.jsonl `
  --allow-draft
```

Use `--allow-draft` only for local experiments. For calibration/evaluation,
review the segment timestamps first and run the command without `--allow-draft`.
If you edit `candidate_turns.full_audio.review.csv`, pass it with
`--review-csv` so corrected timestamps and `candidate_only` decisions are used.

For a first machine review pass, generate an auto-reviewed CSV:

```powershell
.\venv\Scripts\python.exe -B evaluation\auto_review_candidate_turns.py `
  --input evaluation\reports\full_transcripts\candidate_turns.full_audio.review.csv `
  --output evaluation\reports\full_transcripts\candidate_turns.full_audio.auto_reviewed.csv
```

Then build metadata from the auto-reviewed file without `--allow-draft`:

```powershell
.\venv\Scripts\python.exe -B evaluation\build_speaking_metadata_from_segments.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --review-csv evaluation\reports\full_transcripts\candidate_turns.full_audio.auto_reviewed.csv `
  --output evaluation\reports\full_transcripts\youtube_silver_samples.auto_reviewed_segments.jsonl
```

Generate reconstructed Speaking test prompts from the full transcripts:

```powershell
.\venv\Scripts\python.exe -B evaluation\generate_speaking_tests_from_transcripts.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --transcript-dir evaluation\reports\full_transcripts `
  --output-dir evaluation\reports\generated_tests
```

This creates one Markdown test paper per audio plus
`speaking_tests.reconstructed.jsonl`. These are reconstructed from ASR and should
be verified against the source video/audio before being treated as official.

Preview the baseline run plan:

```powershell
.\venv\Scripts\python.exe -B evaluation\run_speaking_baseline.py --dry-run
```

Cut candidate-only WAV segments without scoring:

```powershell
.\venv\Scripts\python.exe -B evaluation\run_speaking_baseline.py --cut-only
```

Run baseline scoring against a running AiScoringService:

```powershell
.\venv\Scripts\python.exe -B evaluation\run_speaking_baseline.py `
  --base-url http://127.0.0.1:8000
```

The runner uses PyAV by default, so `ffmpeg` is not required for cutting. If you
want to force command-line ffmpeg, pass `--cut-engine ffmpeg`.

Start the scoring service in a separate terminal before the full baseline run:

```powershell
cd AiScoringService
$env:SPEAKING_PRONUNCIATION_STRICT='false'
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Strict pronunciation can stay true only if Praat, MFA, and Allosaurus are
installed and ready. For a local baseline smoke test, strict false is acceptable
because the purpose is to measure current behavior and missing evidence.

Optional but recommended for phase 1 scoring quality:

```powershell
.\venv\Scripts\pip.exe install silero-vad
```

When `silero-vad` is installed and `SPEAKING_ENABLE_SILERO_VAD=true`, the
service uses VAD-backed speech ratio and pause counts for Fluency and
Pronunciation. Audio-backed Speaking scoring fails fast if Silero is missing or
broken; `/health` shows `speaking_audio.silero_vad_ready=false` so the issue is
visible before scoring.

Evaluate predictions once the scoring pipeline exports them:

```powershell
.\venv\Scripts\python.exe -B evaluation\evaluate_speaking_predictions.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --predictions evaluation\predictions.example.jsonl
```

## Phase 1.1 segment audit

Phase 1.1 checks whether each scoring segment is really candidate-only. It uses
the baseline detail report when available, flags likely examiner contamination,
and creates editable review files before metadata is promoted to `gold`.

Run the audit after `predictions.baseline.details.jsonl` exists:

```powershell
.\venv\Scripts\python.exe -B evaluation\audit_speaking_segments.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --details evaluation\reports\predictions.baseline.details.jsonl
```

Generated files:

- `evaluation/reports/segment_audit/segment_audit.summary.json`: machine-readable
  count of samples, missing segments, risk levels, and draft candidate turns.
- `evaluation/reports/segment_audit/segment_audit.md`: readable review report.
- `evaluation/reports/segment_audit/segment_audit.csv`: one row per current
  segment with risk flags.
- `evaluation/reports/segment_audit/segment_review_template.csv`: editable file
  for corrected start/end timestamps and reviewer notes.
- `evaluation/reports/segment_audit/candidate_turns.draft.jsonl`: draft
  candidate-only turns inferred from ASR word timestamps. Treat these as
  suggestions, not ground truth.
- `evaluation/reports/segment_audit/candidate_segments.proposed.jsonl`: draft
  metadata-shaped candidate segments grouped by sample. Copy from this file only
  after review.
- `evaluation/reports/segment_audit/missing_segments.csv`: samples that still
  need candidate segment timestamps.

Gate for re-running scoring: high-risk segments should be reviewed, missing
segments should be filled, and only reviewed candidate-only timestamps should be
copied back into `youtube_silver_samples.jsonl`.

## Prediction JSONL format

```json
{"sample_id":"ielts_blog_aleks_band7","predicted_overall_band":7.0,"predicted_criterion_scores":{"Fluency and Coherence":7.0,"Lexical Resource":7.0,"Grammatical Range and Accuracy":7.0,"Pronunciation":8.0}}
```
