# Speaking rubric v3

This folder contains the phase-0 scoring contract for IELTS-style Speaking.
The JSON file is intentionally descriptive rather than model-specific: later
phases can change ASR, pronunciation, LLM, or calibration engines without
changing the examiner-facing rubric contract.

## Phase-0 guarantees

- Four IELTS-style criteria are fixed in a single machine-readable source.
- The LLM refiner is explicitly limited to transcript-backed criteria for a
  single answer; Pronunciation remains audio-backed.
- Band caps are represented as named rules so later calibration can audit them.
- Part expectations are centralized for Part 1, Part 2 long turn, Part 2
  follow-up, and Part 3 discussion.

## Files

- `rubric_v3.json`: rubric contract, cap rules, part expectations, and LLM
  refiner rules.
- `rubric_v3.py`: loader, validator, and prompt-note helpers.

## Next phase dependency

Phase 1 should create a golden speaking evaluation set and report how the
current deterministic scorer, LLM refiner, and final session aggregation compare
against human examiner bands.
