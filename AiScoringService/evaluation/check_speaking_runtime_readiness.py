from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from runtime_utils import get_python_module_status  # noqa: E402
from settings import (  # noqa: E402
    GEMINI_API_KEY,
    LANGUAGETOOL_ENABLED,
    LANGUAGETOOL_LANGUAGE,
    LANGUAGETOOL_TIMEOUT_SECONDS,
    LANGUAGETOOL_URL,
    SPEAKING_PRONUNCIATION_STRICT,
)
from speaking.audio_activity import get_speaking_audio_tool_status  # noqa: E402
from speaking.pronunciation import get_speaking_pronunciation_tool_status  # noqa: E402
from speaking.pronunciation_runtime import (  # noqa: E402
    pronunciation_requires_allosaurus,
    pronunciation_requires_praat,
)


BASE_REQUIRED_MODULES = (
    "faster_whisper",
    "av",
    "silero_vad",
    "wordfreq",
    "lexicalrichness",
)

OPTIONAL_MODULES = (
    "whisperx",
    "pyannote.audio",
)


def check_languagetool() -> dict[str, object]:
    if not LANGUAGETOOL_ENABLED:
        return {
            "enabled": False,
            "ready": False,
            "required": False,
            "url": LANGUAGETOOL_URL,
            "language": LANGUAGETOOL_LANGUAGE,
            "error": "LanguageTool is disabled.",
        }
    if not LANGUAGETOOL_URL:
        return {
            "enabled": True,
            "ready": False,
            "required": True,
            "url": LANGUAGETOOL_URL,
            "language": LANGUAGETOOL_LANGUAGE,
            "error": "LanguageTool URL is not configured.",
        }

    payload = urlencode({
        "text": "This are a short grammar readiness check.",
        "language": LANGUAGETOOL_LANGUAGE,
    }).encode("utf-8")
    request = Request(
        LANGUAGETOOL_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=LANGUAGETOOL_TIMEOUT_SECONDS) as response:
            raw = response.read()
        data = json.loads(raw.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as ex:
        return {
            "enabled": True,
            "ready": False,
            "required": True,
            "url": LANGUAGETOOL_URL,
            "language": LANGUAGETOOL_LANGUAGE,
            "error": f"{type(ex).__name__}: {ex}",
        }

    matches = data.get("matches") if isinstance(data, dict) else None
    return {
        "enabled": True,
        "ready": isinstance(matches, list),
        "required": True,
        "url": LANGUAGETOOL_URL,
        "language": LANGUAGETOOL_LANGUAGE,
        "match_count": len(matches) if isinstance(matches, list) else None,
        "error": None if isinstance(matches, list) else "LanguageTool returned an invalid response.",
    }


def collect_readiness_report() -> dict[str, object]:
    required_module_names = list(BASE_REQUIRED_MODULES)
    if SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_praat():
        required_module_names.append("parselmouth")
    if SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_allosaurus():
        required_module_names.append("allosaurus")

    required_modules = {
        module_name: get_python_module_status(module_name)
        for module_name in required_module_names
    }
    optional_modules = {
        module_name: get_python_module_status(module_name)
        for module_name in OPTIONAL_MODULES
    }
    audio_status = get_speaking_audio_tool_status()
    pronunciation_status = get_speaking_pronunciation_tool_status()
    languagetool_status = check_languagetool()

    failures: list[str] = []
    warnings: list[str] = []

    for module_name, status in required_modules.items():
        if not status["available"]:
            failures.append(f"Missing required Python module: {module_name} ({status['error']})")

    if not audio_status.get("silero_vad_ready"):
        failures.append("Silero VAD is required but not ready.")

    if audio_status.get("local_full_interview_diarization_enabled") and not audio_status.get("speaker_diarization_ready"):
        warnings.append(
            "Local full-interview diarization is enabled but not ready. "
            "Submit scoring is unaffected; configure SPEAKING_PYANNOTE_TOKEN/HF_TOKEN only for local examiner+candidate audio processing."
        )

    if SPEAKING_PRONUNCIATION_STRICT and not pronunciation_status.get("required_ready"):
        failures.append("Strict pronunciation engines are required but not ready.")

    if languagetool_status.get("required") and not languagetool_status.get("ready"):
        failures.append(
            "LanguageTool is enabled but not reachable. "
            f"Run .\\run_languagetool.ps1 from AiScoringService, then retry. Error: {languagetool_status.get('error')}"
        )

    if not GEMINI_API_KEY:
        warnings.append("GEMINI_API_KEY is not configured; scoring will use deterministic rubrics without LLM refinement.")

    for module_name, status in optional_modules.items():
        if not status["available"]:
            warnings.append(f"Optional module is not installed: {module_name}.")

    return {
        "phase": "speaking-runtime-readiness-v1",
        "ready": not failures,
        "strict_pronunciation": SPEAKING_PRONUNCIATION_STRICT,
        "required_modules": required_modules,
        "optional_modules": optional_modules,
        "audio": audio_status,
        "pronunciation": pronunciation_status,
        "languagetool": languagetool_status,
        "gemini_configured": bool(GEMINI_API_KEY),
        "failures": failures,
        "warnings": warnings,
    }


def print_human_summary(report: dict[str, object]) -> None:
    ready = bool(report["ready"])
    print(f"Speaking runtime readiness: {'READY' if ready else 'NOT READY'}")

    failures = report.get("failures")
    if isinstance(failures, list) and failures:
        print("\nFailures:")
        for failure in failures:
            print(f"- {failure}")

    warnings = report.get("warnings")
    if isinstance(warnings, list) and warnings:
        print("\nWarnings:")
        for warning in warnings:
            print(f"- {warning}")

    pronunciation = report.get("pronunciation")
    if isinstance(pronunciation, dict):
        mfa_error = pronunciation.get("mfa_binary_error")
        if mfa_error:
            print("\nMFA detail:")
            print(f"- {mfa_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check IELTS Speaking runtime readiness for phase-1 scoring.")
    parser.add_argument("--json", action="store_true", help="Print full JSON report.")
    args = parser.parse_args()

    report = collect_readiness_report()
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_human_summary(report)
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
