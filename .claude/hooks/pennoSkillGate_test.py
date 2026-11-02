#!/usr/bin/env python3
"""Tests of pennoSkillGate. Run: python3 .claude/hooks/pennoSkillGate_test.py"""

import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import pennoSkillGate  # noqa: E402


def decision_of(stdin_text: str) -> dict:
    stdout = io.StringIO()

    with patch.object(sys, "stdin", io.StringIO(stdin_text)), patch.object(sys, "stdout", stdout):
        exit_code = pennoSkillGate.main()

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
            "tool_input": {"file_path": "src/app/main.test.tsx"},
            "transcript_path": "/nonexistent/transcript.jsonl",
        }

        output = decision_of(json.dumps(payload))

        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn("/nonexistent/transcript.jsonl", output["permissionDecisionReason"])

    def test_transcript_with_no_read_permission_denies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / "transcript.jsonl"
            transcript.write_text('{"skill": "penno"}\n')
            transcript.chmod(0)
            payload = {
                "tool_name": "Write",
                "tool_input": {"file_path": "src/app/main.test.tsx"},
                "transcript_path": str(transcript),
            }

            output = decision_of(json.dumps(payload))

        self.assertEqual(output["permissionDecision"], "deny")
        self.assertIn(str(transcript), output["permissionDecisionReason"])

    def test_readable_transcript_with_the_skill_allows(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / "transcript.jsonl"
            transcript.write_text('{"skill": "penno"}\n')
            payload = {
                "tool_name": "Write",
                "tool_input": {"file_path": "src/app/main.test.tsx"},
                "transcript_path": str(transcript),
            }
            stdout = io.StringIO()

            with patch.object(sys, "stdin", io.StringIO(json.dumps(payload))), patch.object(sys, "stdout", stdout):
                exit_code = pennoSkillGate.main()

        self.assertEqual(exit_code, 0)
        self.assertEqual(stdout.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
