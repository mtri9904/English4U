from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys

from fastapi import HTTPException

from runtime_utils import get_python_module_status
from settings import (
    SPEAKING_ALLOSAURUS_LANG,
    SPEAKING_ALLOSAURUS_MODEL,
    SPEAKING_ENABLE_ALLOSAURUS,
    SPEAKING_ENABLE_MFA,
    SPEAKING_ENABLE_PRAAT,
    SPEAKING_MFA_ACOUSTIC_MODEL_PATH,
    SPEAKING_MFA_BINARY,
    SPEAKING_MFA_DICTIONARY_PATH,
    SPEAKING_MFA_ROOT_DIR,
    SPEAKING_PRONUNCIATION_ENGINE,
    SPEAKING_PRONUNCIATION_STRICT,
)

SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))


def configured_tool_reference(value: str) -> bool:
    if not value:
        return False
    if os.path.exists(value):
        return True
    return not any(separator in value for separator in ("/", "\\"))


def check_mfa_named_model(
    mfa_binary_path: str | None,
    model_type: str,
    model_name: str,
) -> tuple[bool, str | None]:
    if not model_name:
        return False, f"MFA {model_type} model is not configured."
    if os.path.exists(model_name):
        return True, None
    if any(separator in model_name for separator in ("/", "\\")):
        return False, f"MFA {model_type} model path does not exist: {model_name}"
    if not mfa_binary_path:
        return False, "MFA binary was not found."
    try:
        completed = subprocess.run(
            [mfa_binary_path, "model", "list", model_type],
            check=False,
            capture_output=True,
            text=True,
            env=build_mfa_subprocess_env(mfa_binary_path),
            timeout=20,
        )
    except Exception as ex:
        return False, f"{type(ex).__name__}: {ex}"
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown error").strip()
        detail = re.sub(r"\s+", " ", detail)
        if len(detail) > 700:
            detail = f"{detail[:320]} ... {detail[-320:]}"
        return False, detail
    return model_name in completed.stdout, None if model_name in completed.stdout else (
        f"MFA {model_type} model is not installed under MFA_ROOT_DIR: {model_name}"
    )


def resolve_mfa_binary_path() -> str | None:
    configured = SPEAKING_MFA_BINARY
    resolved = shutil.which(configured)
    if resolved:
        return resolved
    if configured and os.path.exists(configured):
        return configured

    candidates = [
        os.path.join(os.path.dirname(sys.executable), "mfa.exe"),
        os.path.join(SERVICE_ROOT, "venv", "Scripts", "mfa.exe"),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return None


def check_mfa_binary_usable(mfa_binary_path: str | None) -> tuple[bool, str | None]:
    if not mfa_binary_path:
        return False, "MFA binary was not found."
    try:
        completed = subprocess.run(
            [mfa_binary_path, "version"],
            check=False,
            capture_output=True,
            text=True,
            env=build_mfa_subprocess_env(mfa_binary_path),
            timeout=20,
        )
    except Exception as ex:
        return False, f"{type(ex).__name__}: {ex}"
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown error").strip()
        detail = re.sub(r"\s+", " ", detail)
        if len(detail) > 700:
            detail = f"{detail[:320]} ... {detail[-320:]}"
        return False, detail
    return True, None


def is_mfa_binary_usable(mfa_binary_path: str | None) -> bool:
    usable, _ = check_mfa_binary_usable(mfa_binary_path)
    return usable


def build_mfa_subprocess_env(mfa_binary_path: str | None) -> dict[str, str]:
    env = os.environ.copy()
    if SPEAKING_MFA_ROOT_DIR:
        env["MFA_ROOT_DIR"] = os.path.abspath(SPEAKING_MFA_ROOT_DIR)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    if not mfa_binary_path:
        return env

    normalized_path = os.path.abspath(mfa_binary_path)
    scripts_dir = os.path.dirname(normalized_path)
    prefix_dir = os.path.dirname(scripts_dir) if os.path.basename(scripts_dir).lower() == "scripts" else None
    if prefix_dir is None:
        return env

    path_entries = [
        prefix_dir,
        os.path.join(prefix_dir, "Library", "bin"),
        os.path.join(prefix_dir, "Library", "usr", "bin"),
        scripts_dir,
    ]
    env["PATH"] = os.pathsep.join(path_entries + [env.get("PATH", "")])
    return env


def pronunciation_engine_matches(*engine_names: str) -> bool:
    configured = SPEAKING_PRONUNCIATION_ENGINE
    configured_tokens = {
        token for token in re.split(r"[^a-z0-9]+", configured.lower()) if token
    }
    normalized_names = {name.lower() for name in engine_names}
    return configured in {"auto", "all"} or any(
        name in configured or name in configured_tokens
        for name in normalized_names
    )


def pronunciation_requires_praat() -> bool:
    return pronunciation_engine_matches("praat", "parselmouth")


def pronunciation_requires_mfa() -> bool:
    return pronunciation_engine_matches("mfa", "montreal_forced_aligner")


def pronunciation_requires_allosaurus() -> bool:
    return pronunciation_engine_matches("allosaurus", "actual_phone", "phone_recognizer")


def get_speaking_pronunciation_tool_status() -> dict[str, object]:
    mfa_binary_path = resolve_mfa_binary_path()
    mfa_binary_usable, mfa_binary_error = check_mfa_binary_usable(mfa_binary_path)
    mfa_dictionary_configured, mfa_dictionary_error = check_mfa_named_model(
        mfa_binary_path,
        "dictionary",
        SPEAKING_MFA_DICTIONARY_PATH,
    )
    mfa_acoustic_model_configured, mfa_acoustic_model_error = check_mfa_named_model(
        mfa_binary_path,
        "acoustic",
        SPEAKING_MFA_ACOUSTIC_MODEL_PATH,
    )
    parselmouth_status = get_python_module_status("parselmouth")
    allosaurus_status = get_python_module_status("allosaurus")
    parselmouth_available = bool(parselmouth_status["available"])
    allosaurus_available = bool(allosaurus_status["available"])
    requires_praat = pronunciation_requires_praat()
    requires_mfa = pronunciation_requires_mfa()
    requires_allosaurus = pronunciation_requires_allosaurus()
    mfa_ready = bool(
        SPEAKING_ENABLE_MFA
        and mfa_binary_path
        and mfa_binary_usable
        and mfa_dictionary_configured
        and mfa_acoustic_model_configured
    )
    return {
        "engine_mode": SPEAKING_PRONUNCIATION_ENGINE,
        "strict": SPEAKING_PRONUNCIATION_STRICT,
        "praat_enabled": SPEAKING_ENABLE_PRAAT,
        "parselmouth_available": parselmouth_available,
        "mfa_enabled": SPEAKING_ENABLE_MFA,
        "mfa_binary_found": mfa_binary_path is not None,
        "mfa_binary_path": mfa_binary_path,
        "mfa_binary_usable": mfa_binary_usable,
        "mfa_binary_error": mfa_binary_error,
        "mfa_root_dir": SPEAKING_MFA_ROOT_DIR,
        "mfa_dictionary_configured": mfa_dictionary_configured,
        "mfa_dictionary_error": mfa_dictionary_error,
        "mfa_acoustic_model_configured": mfa_acoustic_model_configured,
        "mfa_acoustic_model_error": mfa_acoustic_model_error,
        "mfa_ready": mfa_ready,
        "allosaurus_enabled": SPEAKING_ENABLE_ALLOSAURUS,
        "allosaurus_available": allosaurus_available,
        "parselmouth_error": parselmouth_status["error"],
        "allosaurus_error": allosaurus_status["error"],
        "allosaurus_model": SPEAKING_ALLOSAURUS_MODEL,
        "allosaurus_language": SPEAKING_ALLOSAURUS_LANG,
        "required_engines": {
            "praat": requires_praat,
            "mfa": requires_mfa,
            "allosaurus": requires_allosaurus,
        },
        "required_ready": bool(
            (not requires_praat or (SPEAKING_ENABLE_PRAAT and parselmouth_available))
            and (not requires_mfa or mfa_ready)
            and (not requires_allosaurus or (SPEAKING_ENABLE_ALLOSAURUS and allosaurus_available))
        ),
    }


def should_attempt_praat_pitch(audio_path: str | None) -> bool:
    return bool(
        audio_path
        and SPEAKING_ENABLE_PRAAT
        and pronunciation_engine_matches("praat", "parselmouth", "mfa", "mfa_praat")
    )


def should_attempt_mfa_alignment(audio_path: str | None, transcript: str | None) -> bool:
    if not audio_path or not transcript or not transcript.strip():
        return False
    requested_mfa = pronunciation_engine_matches("mfa", "montreal_forced_aligner", "mfa_praat")
    return bool(requested_mfa and SPEAKING_ENABLE_MFA)


def should_attempt_allosaurus_phone_recognition(audio_path: str | None) -> bool:
    return bool(
        audio_path
        and SPEAKING_ENABLE_ALLOSAURUS
        and pronunciation_engine_matches("allosaurus", "actual_phone", "phone_recognizer")
    )


def raise_strict_pronunciation_error(errors: list[str]) -> None:
    if not errors:
        return
    status = get_speaking_pronunciation_tool_status()
    engines_ready = bool(status.get("required_ready"))
    raise HTTPException(
        status_code=422 if engines_ready else 503,
        detail={
            "message": (
                "Speaking pronunciation scoring is strict and this audio could not produce all required pronunciation evidence."
                if engines_ready
                else "Speaking pronunciation scoring is strict and required pronunciation engines are not ready."
            ),
            "errors": errors,
            "status": status,
        },
    )
