from __future__ import annotations

import argparse
from collections import Counter

from speaking_eval_common import load_jsonl, validate_metadata_row


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Speaking evaluation JSONL metadata.")
    parser.add_argument("metadata", help="Path to metadata JSONL file.")
    args = parser.parse_args()

    rows = load_jsonl(args.metadata)
    errors: list[str] = []
    seen_ids: set[str] = set()
    duplicates: set[str] = set()

    for row in rows:
        sample_id = str(row.get("sample_id", ""))
        if sample_id in seen_ids:
            duplicates.add(sample_id)
        seen_ids.add(sample_id)
        errors.extend(validate_metadata_row(row))

    for sample_id in sorted(duplicates):
        errors.append(f"duplicate sample_id: {sample_id}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    levels = Counter(str(row.get("dataset_level")) for row in rows)
    qualities = Counter(str(row.get("label_quality")) for row in rows)
    with_criteria = sum(1 for row in rows if row.get("claimed_criterion_scores"))
    with_segments = sum(1 for row in rows if row.get("candidate_segments"))

    print(f"OK: {len(rows)} samples")
    print("dataset_level:", dict(sorted(levels.items())))
    print("label_quality:", dict(sorted(qualities.items())))
    print(f"criterion_scores: {with_criteria}/{len(rows)}")
    print(f"candidate_segments: {with_segments}/{len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

