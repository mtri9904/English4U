# Speaking scoring engine requirements

Speaking pronunciation scoring runs in strict mode by default. For ratable audio,
the service must have real pronunciation evidence instead of silently falling
back to ASR proxy scoring.

The default engine stack is:

- Praat/Parselmouth for pitch and intonation evidence.
- Montreal Forced Aligner for expected word/phone timing.
- Allosaurus for actual phone recognition.
- Silero VAD for speech activity, pause, and speech-ratio evidence when
  available.

## Production engine policy

Speaking scoring must use the strongest configured evidence stack. Do not
silently fall back from a stronger engine to a weaker proxy. In production:

- ASR should use the latest validated `faster-whisper` release and the strongest
  Whisper-family model the deployment hardware can run reliably.
- Speech activity should use Silero VAD.
- Lexical evidence should use local `wordfreq` and `lexicalrichness` metrics.
- Grammar evidence should use local LanguageTool plus the in-process complexity
  metrics.
- Fluency, Lexical Resource, and Grammar deterministic anchors should use the
  strongest local evidence available before Gemini refinement: Silero/VAD pause
  stats, lexicalrichness MTLD/HDD, wordfreq sophistication, LanguageTool error
  density, and grammar complexity signals.
- Pronunciation should use Praat/Parselmouth, MFA, and Allosaurus together.
  Phase 1 of the pronunciation upgrade adds a GOP-style acoustic score that
  blends MFA phone timing, Allosaurus phone-match evidence, and prosody. This is
  explicitly reported as `acoustic_pronunciation_score`; it is not claimed as a
  true Kaldi GOP likelihood until a dedicated GOP extractor is added.
  Phase 2 exposes component anchors as `segmental_score`, `prosody_score`, and
  `intelligibility_score` so band rules can cap/adjust the Pronunciation score
  based on the weak component instead of treating pronunciation as one opaque
  number.
- If any required engine is missing or unhealthy, readiness must fail and
  scoring should return a clear 503 instead of downgrading quality.

## Session-level calibration

Single-answer rubrics remain capped when the answer is too short or lacks
evidence. Final IELTS-style Speaking session scoring then aggregates all prompt
rubrics by part, with stronger weights for Part 2 and Part 3.

When a session has ratable evidence for Part 1, Part 2, and Part 3, at least 250
transcript words, and fewer than 25% no-response prompts, the deterministic
session anchor applies a coverage bonus. This prevents a complete interview from
being under-scored just because several Part 1 answers are naturally short.

Gemini remains the LLM refiner. It is not replacing the local scoring stack. The
refiner is clamped to the deterministic anchor:

- Incomplete or weak-coverage sessions: maximum +/- 0.5 band.
- Complete sessions: maximum +/- 1.0 band.
- Strong complete sessions with 650+ words and no no-response prompts: maximum
  +/- 1.5 bands.

Version check on 2026-04-30:

| Tool | Current upstream/latest checked | Local status |
| --- | --- | --- |
| faster-whisper | 1.2.1 latest GitHub release | local 1.2.1 ready |
| Montreal Forced Aligner | 3.3.9 latest GitHub release | project-local 3.3.9 ready via `.runtime` micromamba env |
| praat-parselmouth | 0.4.7 latest PyPI release | local 0.4.7 ready |
| wordfreq | 3.1.1 latest PyPI release | local 3.1.1 ready |
| lexicalrichness | 0.5.1 latest PyPI release | local 0.5.1 ready |
| LanguageTool | 6.7/latest Docker image observed locally; ZIP releases moved to snapshots after 6.6 | local Docker server 6.7 ready |
| WhisperX | 3.8.5 latest PyPI release | local 3.8.5 ready |
| pyannote.audio | 4.0.4 latest PyPI release | local 4.0.4 ready for local full-interview diarization after token/model access is configured |

Sources: SYSTRAN/faster-whisper releases, Montreal Forced Aligner releases,
praat-parselmouth PyPI, LanguageTool release notes/forum, and pyannote.audio
releases.

## Environment

```env
WHISPER_MODEL_SIZE=large-v3
LISTENING_TRANSCRIPT_WHISPER_MODEL_SIZE=base
SPEAKING_PRONUNCIATION_ENGINE=mfa_praat_allosaurus
SPEAKING_PRONUNCIATION_STRICT=true
SPEAKING_ENABLE_PRAAT=true
SPEAKING_ENABLE_MFA=true
SPEAKING_MFA_BINARY=C:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4skills\.runtime\mamba-root\envs\mfa\Scripts\mfa.exe
SPEAKING_MFA_ROOT_DIR=C:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4skills\.runtime\mfa
SPEAKING_MFA_DICTIONARY_PATH=english_mfa
SPEAKING_MFA_ACOUSTIC_MODEL_PATH=english_mfa
SPEAKING_ENABLE_ALLOSAURUS=true
SPEAKING_ALLOSAURUS_MODEL=eng2102
SPEAKING_ALLOSAURUS_LANG=eng
SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS=90
SPEAKING_PITCH_FLOOR_HZ=75
SPEAKING_PITCH_CEILING_HZ=500
SPEAKING_PHONE_MATCH_THRESHOLD=0.45
SPEAKING_ENABLE_SILERO_VAD=true
SPEAKING_SILERO_THRESHOLD=0.5
SPEAKING_SILERO_MIN_SPEECH_MS=250
SPEAKING_SILERO_MIN_SILENCE_MS=180
SPEAKING_VAD_MERGE_GAP_SECONDS=0.2
HF_HOME=C:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4skills\.runtime\huggingface
SPEAKING_PYANNOTE_MODEL=pyannote/speaker-diarization-community-1
# SPEAKING_PYANNOTE_TOKEN=<free Hugging Face token after accepting model terms>
```

Set `SPEAKING_PRONUNCIATION_STRICT=false` only for local debugging. Production
IELTS-style scoring should keep it true so missing audio-backed engines stop
scoring instead of producing a weaker pronunciation band. The production
contract is fail-fast: the service should use the best configured engine stack,
or refuse to score until that stack is ready.

## Phase 1 readiness check

Before running baseline scoring or calibration, run the local runtime gate:

```powershell
.\venv\Scripts\python.exe -B evaluation\check_speaking_runtime_readiness.py
```

For a full machine-readable report:

```powershell
.\venv\Scripts\python.exe -B evaluation\check_speaking_runtime_readiness.py --json
```

The checker validates required Python modules, Silero VAD, strict pronunciation
engines, the local LanguageTool endpoint, Gemini configuration, and optional
WhisperX/pyannote local diarization candidates. It exits non-zero when a
required submit-scoring dependency is missing or unhealthy. Local diarization
readiness is reported as a warning only because student web submissions are
candidate-only audio and do not require speaker separation.

## LanguageTool local server

The scoring service expects LanguageTool at:

```env
LANGUAGETOOL_URL=http://localhost:8081/v2/check
```

Start the local LanguageTool service with Docker:

```powershell
.\run_languagetool.ps1
```

Or run Compose directly:

```powershell
docker compose -f docker-compose.languagetool.yml up -d
```

The compose file maps host port `8081` to the LanguageTool server port `8081`.
If port `8081` is taken, set `LANGUAGETOOL_HOST_PORT` and update
`LANGUAGETOOL_URL` to match.

## Praat pitch evidence

Install the Python wrapper in the same Python environment that runs the service:

```powershell
pip install praat-parselmouth
```

When available, scoring evidence includes pitch mean, pitch range, and an
intonation variation score. The Pronunciation confidence can increase because
intonation is now audio-backed instead of inferred from ASR timing only.

## Lexical Resource evidence

Lexical Resource uses local, free Python packages:

```powershell
pip install wordfreq lexicalrichness
```

`wordfreq` provides Zipf frequency estimates so the service can distinguish
mostly common words from controlled lower-frequency content words.
`lexicalrichness` adds diversity metrics such as MTLD and HDD. The resulting
evidence includes lexical density, type-token ratio, advanced/rare/common word
ratios, repeated content-word ratio, and a lexical sophistication score.

These metrics are required by the readiness checker. Gemini remains enabled as
the LLM refiner, but it now receives stronger local lexical evidence.

## Montreal Forced Aligner

MFA requires the `mfa` CLI plus English dictionary/acoustic models. With the MFA
CLI installed, download the English model and dictionary:

```powershell
mfa model download acoustic english_mfa
mfa model download dictionary english_mfa
```

The service creates a temporary one-utterance corpus, runs MFA, parses TextGrid
word and phone tiers, and stores expected phone timing rows in phoneme analysis.
It also derives `phone_timing_score` and `phone_timing_issue_ratio` from the
aligned phone durations. These feed the phase-1 GOP-style
`acoustic_pronunciation_score`.

On Windows/Python venv installs, MFA can import but fail at runtime with
`ModuleNotFoundError: No module named '_kalpy'`. `kalpy` is not distributed as a
normal pip package for this environment, so the reliable production path is a
Conda/Mamba MFA environment or another MFA binary path configured via
`SPEAKING_MFA_BINARY`. Do not downgrade to a weaker pronunciation path for
production scoring; keep strict mode failing until MFA is usable.

This Windows machine uses a project-local micromamba MFA environment:

```env
SPEAKING_MFA_BINARY=C:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4skills\.runtime\mamba-root\envs\mfa\Scripts\mfa.exe
SPEAKING_MFA_ROOT_DIR=C:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4skills\.runtime\mfa
```

The service prepends that conda environment's `Library\bin`, `Library\usr\bin`,
and `Scripts` folders before launching MFA, so `mfa.exe version` can load
`kalpy`/Kaldi DLLs correctly from the environment. `MFA_ROOT_DIR` is also set
for MFA subprocesses, so the English MFA acoustic model and dictionary are read
from `.runtime\mfa` instead of `~/Documents/MFA`.

## Allosaurus actual phones

Allosaurus is installed with pip and the English-specific model is downloaded:

```powershell
pip install allosaurus
python -m allosaurus.bin.download_model -m eng2102
```

The service compares Allosaurus phone timestamps with the expected MFA phone
windows and uses the resulting phone match score as Pronunciation evidence.
When MFA, Allosaurus, and Praat evidence are available, the scoring payload also
includes `acoustic_pronunciation_score` and `acoustic_pronunciation_source` so
Pronunciation bands can use a single acoustic anchor in addition to the detailed
issue list.
The payload also includes:

- `segmental_score`: MFA phone timing plus Allosaurus phone-match evidence.
- `prosody_score`: rhythm, stress, intonation, and chunking control.
- `intelligibility_score`: ASR clarity, low-confidence word ratio, and speech
  activity signals.

## Silero VAD speech activity

Silero VAD is optional but recommended. When installed, Fluency and
Pronunciation evidence uses VAD-backed speech ratio and pause statistics instead
of relying only on Whisper word gaps.

```powershell
pip install silero-vad
```

The `/health` endpoint reports `speaking_audio.silero_vad_ready`. If Silero is
not installed, disabled, or broken, audio-backed Speaking scoring stops with a
503 instead of silently falling back to weaker ASR word-gap evidence.

The service decodes audio with its existing PyAV path before calling Silero, so
it does not rely on torchaudio's optional audio I/O backend at runtime.

## Local full-interview diarization

Student web submissions are treated as candidate-only audio, so `/api/ai/score-speaking`
does not call speaker diarization and does not require a Hugging Face token.

For local IELTS full-interview audio that contains examiner + candidate,
pyannote.audio is available through the evaluation tooling. It uses pyannote's
`pyannote/speaker-diarization-community-1` model and stores model cache under
the project-local `.runtime/huggingface` folder by default.

```env
SPEAKING_PYANNOTE_MODEL=pyannote/speaker-diarization-community-1
SPEAKING_PYANNOTE_TOKEN=<free Hugging Face token>
```

The pyannote model runs locally after the model is downloaded/cached, but first
use requires accepting the Hugging Face model terms and providing a free token.
The token is used only to authenticate model download/access; the scoring code
does not upload student audio to Hugging Face.

Run diarization on local full-interview audio referenced by
`evaluation/youtube_silver_samples.jsonl`:

```powershell
.\venv\Scripts\python.exe -B evaluation\diarize_speaking_full_audio.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --num-speakers 2 `
  --skip-existing
```

Generated files:

- `evaluation/reports/full_diarization/<sample_id>.json`: pyannote segments for
  one local full-interview audio file.
- `evaluation/reports/full_diarization/full_diarization.index.csv`: one row per
  processed audio with speaker count and candidate-speaker guess.
- `evaluation/reports/full_diarization/speaker_turns.review.csv`: editable
  speaker-turn review sheet for examiner/candidate separation.

After diarization, build candidate-only segment proposals from the full ASR
transcript plus pyannote speaker turns:

```powershell
.\venv\Scripts\python.exe -B evaluation\build_candidate_segments_from_diarization.py `
  --metadata evaluation\youtube_silver_samples.jsonl
```

This writes:

- `evaluation/reports/diarized_candidate_segments/candidate_turns.diarized.review.csv`
- `evaluation/reports/diarized_candidate_segments/candidate_segments.diarized.proposed.jsonl`
- `evaluation/reports/diarized_candidate_segments/candidate_segments.diarized.index.csv`

Then promote reviewed proposals into metadata and cut candidate-only WAV
segments:

```powershell
.\venv\Scripts\python.exe -B evaluation\build_speaking_metadata_from_segments.py `
  --metadata evaluation\youtube_silver_samples.jsonl `
  --segments evaluation\reports\diarized_candidate_segments\candidate_segments.diarized.proposed.jsonl `
  --output evaluation\reports\diarized_candidate_segments\youtube_silver_samples.diarized_segments.jsonl

.\venv\Scripts\python.exe -B evaluation\run_speaking_baseline.py `
  --metadata evaluation\reports\diarized_candidate_segments\youtube_silver_samples.diarized_segments.jsonl `
  --cut-only `
  --segments-root evaluation\segments\diarized_candidate_segments
```

The current scoring path keeps Gemini as the LLM refiner. Diarization is used
before scoring to help prepare reviewed candidate-only segments from full
interviews; those cut candidate segments are then submitted to the normal
candidate-only scoring endpoint.

## Pronunciation component audit

For calibration, use the local Pronunciation audit after candidate-only WAV
segments have been cut. This runs the same strict local Pronunciation stack
(MFA phone timing, Allosaurus phone match, and Praat prosody) directly on the
cut WAVs and full-transcript word timestamps. It does not call Gemini and it
does not affect student submit scoring.

```powershell
.\venv\Scripts\python.exe -B evaluation\audit_speaking_pronunciation.py `
  --metadata evaluation\reports\diarized_candidate_segments\youtube_silver_samples.diarized_segments.jsonl `
  --segments-root evaluation\segments\diarized_candidate_segments `
  --sample-id ielts_blog_joanne_band8_5 `
  --segment-limit 1
```

The audit writes:

- `evaluation/reports/pronunciation_audit/pronunciation_audit.csv`
- `evaluation/reports/pronunciation_audit/pronunciation_audit.details.jsonl`
- `evaluation/reports/pronunciation_audit/pronunciation_audit.summary.json`

Use this to inspect whether high-band and low-band samples separate cleanly on
`segmental_score`, `prosody_score`, `intelligibility_score`, and
`acoustic_pronunciation_score` before changing any scoring weights.
