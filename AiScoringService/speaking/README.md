# Speaking package map

This package holds the Speaking-specific scoring building blocks that should not live in `main.py`.

- `audio_evidence.py`: audio normalization, audio quality checks, Silero VAD speech activity, pause statistics, and audio tool status.
- `rubric_v3.py`: typed accessors and prompt helpers for the Speaking rubric contract.
- `rubric_v3.json`: the editable rubric source used by the scoring/refiner prompts.
- `SPEAKING_RUBRIC_V3.md`: human-readable notes for the current rubric version.

Keep new Speaking-only helpers here unless they are FastAPI route wiring. API request/response contracts live in `schemas.py`; `main.py` should stay focused on endpoint orchestration and cross-skill service setup.
