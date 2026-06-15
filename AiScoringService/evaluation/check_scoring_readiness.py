from __future__ import annotations

import argparse
from pathlib import Path

from speaking_eval_common import load_jsonl, validate_metadata_row


def resolve_audio_path(service_root: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return service_root / path


def main() -> int:
    parser = argparse.ArgumentParser(description="Check which Speaking samples are ready for baseline scoring.")
    parser.add_argument("metadata", help="Path to Speaking metadata JSONL file.")
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()
    rows = load_jsonl(metadata_path)

    metadata_errors = [error for row in rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    ready: list[str] = []
    not_ready: list[tuple[str, list[str]]] = []
    evaluation_ready: list[str] = []

    for row in rows:
        sample_id = str(row["sample_id"])
        missing: list[str] = []
        audio_path = resolve_audio_path(service_root, row.get("local_audio_path"))

        if audio_path is None:
            missing.append("local_audio_path")
        elif not audio_path.exists():
            missing.append(f"audio_missing:{audio_path}")

        if not row.get("candidate_segments"):
            missing.append("candidate_segments")

        if not row.get("claimed_overall_band") and not row.get("claimed_criterion_scores"):
            missing.append("label")

        if row.get("claimed_criterion_scores"):
            evaluation_ready.append(sample_id)

        if missing:
            not_ready.append((sample_id, missing))
        else:
            ready.append(sample_id)

    print(f"samples={len(rows)}")
    print(f"ready_for_scoring={len(ready)}")
    for sample_id in ready:
        print(f"READY {sample_id}")

    print(f"not_ready={len(not_ready)}")
    for sample_id, missing in not_ready:
        print(f"WAIT {sample_id}: {', '.join(missing)}")

    print(f"criterion_label_ready={len(evaluation_ready)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
