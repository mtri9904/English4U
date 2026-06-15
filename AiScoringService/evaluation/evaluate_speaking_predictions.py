from __future__ import annotations

import argparse
from statistics import mean

from speaking_eval_common import (
    SPEAKING_CRITERIA,
    load_jsonl,
    overall_from_criteria,
    validate_metadata_row,
)


def band_error(label: float, prediction: float) -> float:
    return abs(float(label) - float(prediction))


def format_metric(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def collect_metric(errors: list[float]) -> tuple[float | None, float | None]:
    if not errors:
        return None, None
    adjacent = sum(1 for error in errors if error <= 0.5) / len(errors)
    return mean(errors), adjacent


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate Speaking predictions against metadata labels.")
    parser.add_argument("--metadata", required=True, help="Path to Speaking metadata JSONL.")
    parser.add_argument("--predictions", required=True, help="Path to prediction JSONL.")
    args = parser.parse_args()

    metadata_rows = load_jsonl(args.metadata)
    metadata_errors = [error for row in metadata_rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    metadata_by_id = {row["sample_id"]: row for row in metadata_rows}
    predictions = load_jsonl(args.predictions)

    overall_errors: list[float] = []
    criterion_errors: dict[str, list[float]] = {criteria: [] for criteria in SPEAKING_CRITERIA}
    missing_labels: list[str] = []
    unknown_predictions: list[str] = []

    for prediction in predictions:
        sample_id = prediction.get("sample_id")
        if sample_id not in metadata_by_id:
            unknown_predictions.append(str(sample_id))
            continue

        label = metadata_by_id[sample_id]
        predicted_overall = prediction.get("predicted_overall_band")
        predicted_criteria = prediction.get("predicted_criterion_scores")

        if label.get("claimed_overall_band") is not None and predicted_overall is not None:
            overall_errors.append(band_error(float(label["claimed_overall_band"]), float(predicted_overall)))
        elif label.get("claimed_criterion_scores") and predicted_criteria:
            expected_overall = overall_from_criteria(label["claimed_criterion_scores"])
            predicted_overall_from_criteria = overall_from_criteria(predicted_criteria)
            overall_errors.append(band_error(expected_overall, predicted_overall_from_criteria))
        else:
            missing_labels.append(str(sample_id))

        if label.get("claimed_criterion_scores") and isinstance(predicted_criteria, dict):
            for criteria in SPEAKING_CRITERIA:
                if criteria in predicted_criteria:
                    criterion_errors[criteria].append(
                        band_error(float(label["claimed_criterion_scores"][criteria]), float(predicted_criteria[criteria]))
                    )

    overall_mae, overall_adjacent = collect_metric(overall_errors)
    print(f"samples_evaluated_overall={len(overall_errors)}")
    print(f"overall_mae={format_metric(overall_mae)}")
    print(f"overall_adjacent_accuracy_0_5={format_metric(overall_adjacent)}")

    for criteria in SPEAKING_CRITERIA:
        mae, adjacent = collect_metric(criterion_errors[criteria])
        print(f"{criteria}: count={len(criterion_errors[criteria])}, mae={format_metric(mae)}, adjacent_0_5={format_metric(adjacent)}")

    if unknown_predictions:
        print(f"unknown_predictions={','.join(sorted(unknown_predictions))}")
    if missing_labels:
        print(f"missing_labels={','.join(sorted(missing_labels))}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

