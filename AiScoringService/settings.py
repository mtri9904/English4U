from __future__ import annotations

import os

from dotenv import load_dotenv


load_dotenv()

SERVICE_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SERVICE_ROOT)

if "SPACE_ID" in os.environ:
    DEFAULT_HF_HOME = "/tmp/huggingface"
    DEFAULT_SPEAKING_MFA_ROOT_DIR = "/tmp/mfa"
else:
    DEFAULT_HF_HOME = os.path.join(PROJECT_ROOT, ".runtime", "huggingface")
    DEFAULT_SPEAKING_MFA_ROOT_DIR = os.path.join(PROJECT_ROOT, ".runtime", "mfa")

os.environ.setdefault("HF_HOME", DEFAULT_HF_HOME)
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", os.path.join(DEFAULT_HF_HOME, "hub"))


def parse_env_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def parse_env_float(name: str, default: float, *, minimum: float | None = None) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except ValueError:
        return default
    if minimum is not None:
        value = max(minimum, value)
    return value


def parse_env_int(name: str, default: int | None = None, *, minimum: int | None = None) -> int | None:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    if minimum is not None:
        value = max(minimum, value)
    return value


def parse_env_list(name: str, default: str = "") -> list[str]:
    return [
        item.strip()
        for item in os.getenv(name, default).split(",")
        if item.strip()
    ]


def unique_model_candidates(*models: str) -> list[str]:
    return list(dict.fromkeys(model for model in models if model))


WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "large-v3").strip() or "large-v3"
LISTENING_TRANSCRIPT_WHISPER_MODEL_SIZE = (
    os.getenv("LISTENING_TRANSCRIPT_WHISPER_MODEL_SIZE", "base").strip() or "base"
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_SCORING_MODEL = os.getenv("GEMINI_SCORING_MODEL", "gemini-2.5-flash-lite").strip()
GEMINI_SCORING_FALLBACK_MODELS = parse_env_list(
    "GEMINI_SCORING_FALLBACK_MODELS",
    "gemini-2.5-flash",
)
GEMINI_SCORING_MODEL_CANDIDATES = unique_model_candidates(
    GEMINI_SCORING_MODEL,
    *GEMINI_SCORING_FALLBACK_MODELS,
)

GEMINI_SPEAKING_TTS_MODEL = os.getenv("GEMINI_SPEAKING_TTS_MODEL", "gemini-3.1-flash-tts").strip()
GEMINI_SPEAKING_TTS_FALLBACK_MODELS = parse_env_list(
    "GEMINI_SPEAKING_TTS_FALLBACK_MODELS",
    "gemini-2.5-flash-tts,gemini-2.5-pro-tts",
)
GEMINI_SPEAKING_TTS_MODEL_CANDIDATES = unique_model_candidates(
    GEMINI_SPEAKING_TTS_MODEL,
    *GEMINI_SPEAKING_TTS_FALLBACK_MODELS,
)
GEMINI_SPEAKING_TTS_VOICE = os.getenv("GEMINI_SPEAKING_TTS_VOICE", "Iapetus").strip() or "Iapetus"

GEMINI_SPEAKING_SCORING_MODEL = os.getenv("GEMINI_SPEAKING_SCORING_MODEL", "gemini-2.5-flash-lite").strip()
GEMINI_SPEAKING_SCORING_FALLBACK_MODELS = parse_env_list(
    "GEMINI_SPEAKING_SCORING_FALLBACK_MODELS",
    "gemini-2.5-flash",
)
GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES = unique_model_candidates(
    GEMINI_SPEAKING_SCORING_MODEL,
    *GEMINI_SPEAKING_SCORING_FALLBACK_MODELS,
)



LANGUAGETOOL_ENABLED = parse_env_bool("LANGUAGETOOL_ENABLED", True)
LANGUAGETOOL_URL = os.getenv("LANGUAGETOOL_URL", "http://localhost:8081/v2/check").strip()
LANGUAGETOOL_LANGUAGE = os.getenv("LANGUAGETOOL_LANGUAGE", "en-US").strip() or "en-US"
LANGUAGETOOL_TIMEOUT_SECONDS = parse_env_float("LANGUAGETOOL_TIMEOUT_SECONDS", 5.0, minimum=0.2)
LANGUAGETOOL_UNAVAILABLE_COOLDOWN_SECONDS = 60.0

SPEAKING_ENABLE_SILERO_VAD = parse_env_bool("SPEAKING_ENABLE_SILERO_VAD", True)
SPEAKING_SILERO_THRESHOLD = parse_env_float("SPEAKING_SILERO_THRESHOLD", 0.5, minimum=0.01)
SPEAKING_SILERO_MIN_SPEECH_MS = parse_env_float("SPEAKING_SILERO_MIN_SPEECH_MS", 250.0, minimum=50.0)
SPEAKING_SILERO_MIN_SILENCE_MS = parse_env_float("SPEAKING_SILERO_MIN_SILENCE_MS", 180.0, minimum=50.0)
SPEAKING_VAD_MERGE_GAP_SECONDS = parse_env_float("SPEAKING_VAD_MERGE_GAP_SECONDS", 0.2, minimum=0.0)
SPEAKING_ENABLE_SPEAKER_DIARIZATION = parse_env_bool("SPEAKING_ENABLE_SPEAKER_DIARIZATION", False)
SPEAKING_PYANNOTE_MODEL = os.getenv(
    "SPEAKING_PYANNOTE_MODEL",
    "pyannote/speaker-diarization-community-1",
).strip() or "pyannote/speaker-diarization-community-1"
SPEAKING_PYANNOTE_TOKEN = (
    os.getenv("SPEAKING_PYANNOTE_TOKEN")
    or os.getenv("HUGGINGFACE_TOKEN")
    or os.getenv("HF_TOKEN")
    or ""
).strip()
SPEAKING_PYANNOTE_MIN_SPEAKERS = parse_env_int("SPEAKING_PYANNOTE_MIN_SPEAKERS", None, minimum=1)
SPEAKING_PYANNOTE_MAX_SPEAKERS = parse_env_int("SPEAKING_PYANNOTE_MAX_SPEAKERS", None, minimum=1)

SPEAKING_PRONUNCIATION_ENGINE = (
    os.getenv("SPEAKING_PRONUNCIATION_ENGINE", "mfa_praat_allosaurus").strip().lower()
    or "mfa_praat_allosaurus"
)
SPEAKING_PRONUNCIATION_STRICT = parse_env_bool("SPEAKING_PRONUNCIATION_STRICT", True)
SPEAKING_ENABLE_PRAAT = parse_env_bool("SPEAKING_ENABLE_PRAAT", True)
SPEAKING_ENABLE_MFA = parse_env_bool("SPEAKING_ENABLE_MFA", True)
DEFAULT_SPEAKING_MFA_BINARY = os.path.join(
    PROJECT_ROOT,
    ".runtime",
    "mamba-root",
    "envs",
    "mfa",
    "Scripts",
    "mfa.exe",
)

SPEAKING_MFA_BINARY = (
    os.getenv("SPEAKING_MFA_BINARY", DEFAULT_SPEAKING_MFA_BINARY).strip()
    or DEFAULT_SPEAKING_MFA_BINARY
)
SPEAKING_MFA_ROOT_DIR = (
    os.getenv("SPEAKING_MFA_ROOT_DIR", DEFAULT_SPEAKING_MFA_ROOT_DIR).strip()
    or DEFAULT_SPEAKING_MFA_ROOT_DIR
)
SPEAKING_MFA_DICTIONARY_PATH = os.getenv("SPEAKING_MFA_DICTIONARY_PATH", "english_mfa").strip()
SPEAKING_MFA_ACOUSTIC_MODEL_PATH = os.getenv("SPEAKING_MFA_ACOUSTIC_MODEL_PATH", "english_mfa").strip()
SPEAKING_ENABLE_ALLOSAURUS = parse_env_bool("SPEAKING_ENABLE_ALLOSAURUS", True)
SPEAKING_ALLOSAURUS_MODEL = os.getenv("SPEAKING_ALLOSAURUS_MODEL", "eng2102").strip() or "eng2102"
SPEAKING_ALLOSAURUS_LANG = os.getenv("SPEAKING_ALLOSAURUS_LANG", "eng").strip() or "eng"
SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS = parse_env_float(
    "SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS",
    90.0,
    minimum=5.0,
)
SPEAKING_PITCH_FLOOR_HZ = parse_env_float("SPEAKING_PITCH_FLOOR_HZ", 75.0, minimum=20.0)
SPEAKING_PITCH_CEILING_HZ = parse_env_float("SPEAKING_PITCH_CEILING_HZ", 500.0, minimum=80.0)
SPEAKING_PHONE_MATCH_THRESHOLD = parse_env_float("SPEAKING_PHONE_MATCH_THRESHOLD", 0.45, minimum=0.0)
