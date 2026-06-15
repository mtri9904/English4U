from __future__ import annotations

import importlib.util


def get_python_module_status(module_name: str) -> dict[str, object]:
    try:
        spec = importlib.util.find_spec(module_name)
    except Exception as ex:
        return {
            "module": module_name,
            "available": False,
            "error": f"{type(ex).__name__}: {ex}",
        }

    return {
        "module": module_name,
        "available": spec is not None,
        "error": None,
    }


def is_python_module_available(module_name: str) -> bool:
    return bool(get_python_module_status(module_name)["available"])
    