#!/usr/bin/env python3
"""Tests of threeLawsGate.FAILED_RUN. Run: python3 .claude/hooks/threeLawsGate_test.py

Each line below is copied from a transcript. A transcript line is one JSON
object, so a newline inside a tool result is the two characters backslash n.
"""

import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import threeLawsGate  # noqa: E402
from threeLawsGate import FAILED_RUN, scan  # noqa: E402

RED = [
    ("Vitest summary", "Tests  1 failed | 4 passed (5)"),
    ("Vitest per-file", "FAIL  src/app/main.test.tsx > shows the name"),
    ("Playwright summary", "  1 failed\\n    e2e/siteName.e2e.ts:3:1 › shows the name"),
    ("Playwright summary, real newline", "  1 failed\n    e2e/siteName.e2e.ts:3:1"),
    ("tsc error", "src/app/main.tsx(7,26): error TS2877: x"),
    ("ESLint summary", "\\n✖ 1 problem (1 error, 0 warnings)\\n"),
    ("ESLint summary, plural", "\\n✖ 2 problems (2 errors, 0 warnings)\\n"),
    ("no-go line of a pipeline", "$ node scripts/bundle.ts policy\\nno-go policy\\n       note:"),
]

GREEN = [
    ("Vitest all pass", "Tests  5 passed (5)"),
    ("Playwright all pass", "  3 passed (2.1s)"),
    ("tsc clean", "$ tsc --noEmit\\n"),
    ("ESLint warnings only", "\\n✖ 2 problems (0 errors, 2 warnings)\\n"),
    ("go line of a pipeline", "$ node scripts/bundle.ts policy\\ngo     policy\\n"),
    ("prose about the no-go line", "and each no-go line names its rule."),
    ("timestamp before failed", "2026-09-07 23:37:14 failed: pnpm check"),
]


class FailedRunTest(unittest.TestCase):
    def test_red_output_matches(self) -> None:
        assert len(RED) == 8

        for name, line in RED:
            with self.subTest(name):
                self.assertIsNotNone(FAILED_RUN.search(line), line)

    def test_green_output_does_not_match(self) -> None:
        assert len(GREEN) == 7

        for name, line in GREEN:
            with self.subTest(name):
                self.assertIsNone(FAILED_RUN.search(line), line)


SCANNED = [
    ("user chat text", 0, {"type": "user", "message": {"content": "the CI log says Tests 3 failed"}}),
    (
        "assistant text block",
        0,
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "FAIL  src/app/main.test.tsx"}]}},
    ),
    (
        "tool result string",
        1,
        {"type": "user", "message": {"content": [{"type": "tool_result", "content": "Tests  1 failed | 4 passed (5)"}]}},
    ),
    (
        "tool result text blocks",
        1,
        {
            "type": "user",
            "message": {
                "content": [{"type": "tool_result", "content": [{"type": "text", "text": "  1 failed\n    e2e/a.e2e.ts:3:1"}]}]
            },
        },
    ),
    (
        "tool result that passed",
        0,
        {"type": "user", "message": {"content": [{"type": "tool_result", "content": "Tests  5 passed (5)"}]}},
    ),
    ("line that is a list", 0, ["tool_result", "tool_use"]),
    ("message that is null", 0, {"type": "user", "message": None, "note": ["tool_result", "tool_use"]}),
]


class ScanTest(unittest.TestCase):
    def test_only_a_tool_result_counts_as_a_failing_run(self) -> None:
        assert len(SCANNED) == 7

        for name, failed_at, entry in SCANNED:
            with self.subTest(name), tempfile.TemporaryDirectory() as directory:
                transcript = Path(directory) / "transcript.jsonl"
                transcript.write_text(json.dumps(entry) + "\n")

                self.assertEqual(scan(transcript), (0, failed_at))


def decision_of(stdin_text: str) -> dict:
    stdout = io.StringIO()

    with patch.object(sys, "stdin", io.StringIO(stdin_text)), patch.object(sys, "stdout", stdout):
        exit_code = threeLawsGate.main()

    assert exit_code == 0

    return json.loads(stdout.getvalue())["hookSpecificOutput"]


class NoAnswerTest(unittest.TestCase):
    def test_payload_that_is_not_json_denies(self) -> None:
        output = decision_of("not json")

        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn("payload is not JSON", output["permissionDecisionReason"])

    def test_transcript_path_that_names_no_file_denies(self) -> None:
        payload = {
            "tool_name": "Write",
            "tool_input": {"file_path": "src/app/main.tsx"},
            "transcript_path": "/nonexistent/transcript.jsonl",
        }

        output = decision_of(json.dumps(payload))

        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn("/nonexistent/transcript.jsonl", output["permissionDecisionReason"])

    def test_transcript_with_no_read_permission_denies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / "transcript.jsonl"
            transcript.write_text("{}\n")
            transcript.chmod(0)
            payload = {
                "tool_name": "Edit",
                "tool_input": {"file_path": "src/app/main.tsx"},
                "transcript_path": str(transcript),
            }

            output = decision_of(json.dumps(payload))

        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn(str(transcript), output["permissionDecisionReason"])

    def test_json_that_is_not_a_usable_object_denies(self) -> None:
        cases = [
            ("a list", "[]", "the payload is a JSON list"),
            ("null", "null", "the payload is a JSON NoneType"),
            ("a string tool_input", '{"tool_name": "Write", "tool_input": "x"}', "tool_input is not an object"),
            ("a number file_path", '{"tool_name": "Write", "tool_input": {"file_path": 5}}', "file_path is not a string"),
            (
                "a number transcript_path",
                '{"tool_name": "Write", "tool_input": {"file_path": "src/a.ts"}, "transcript_path": 5}',
                "transcript_path is not a string",
            ),
        ]
        assert len(cases) == 5

        for name, stdin_text, cause in cases:
            with self.subTest(name):
                output = decision_of(stdin_text)

                self.assertEqual(output["permissionDecision"], "deny")
                self.assertIn(cause, output["permissionDecisionReason"])


if __name__ == "__main__":
    unittest.main()
