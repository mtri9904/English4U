from __future__ import annotations

import math


def clamp_band(value: float) -> float:
    return max(0.0, min(9.0, value))


def round_band_half(value: float) -> float:
    return math.floor(clamp_band(value) * 2 + 0.5 + 1e-9) / 2


def clamp_speaking_band_to_rule_window(
    rule_band: float,
    gemini_band: float,
    *,
    max_adjustment: float = 1.0,
) -> float:
    lower_bound = clamp_band(rule_band - max_adjustment)
    upper_bound = clamp_band(rule_band + max_adjustment)
    return round_band_half(min(upper_bound, max(lower_bound, gemini_band)))
