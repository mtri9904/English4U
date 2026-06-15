from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from runtime_utils import get_python_module_status, is_python_module_available  # noqa: E402


class RuntimeUtilsTests(unittest.TestCase):
    def test_existing_module_is_available(self) -> None:
        status = get_python_module_status("json")

        self.assertTrue(status["available"])
        self.assertIsNone(status["error"])
        self.assertTrue(is_python_module_available("json"))

    def test_missing_module_returns_false_without_raising(self) -> None:
        status = get_python_module_status("definitely_missing_codex_module")

        self.assertFalse(status["available"])
        self.assertIsNone(status["error"])
        self.assertFalse(is_python_module_available("definitely_missing_codex_module"))

    def test_missing_parent_package_returns_error_without_raising(self) -> None:
        status = get_python_module_status("definitely_missing_parent.child")

        self.assertFalse(status["available"])
        self.assertIsInstance(status["error"], str)


if __name__ == "__main__":
    unittest.main()
