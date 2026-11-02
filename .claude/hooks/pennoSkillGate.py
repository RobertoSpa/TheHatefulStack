#!/usr/bin/env python3
"""PreToolUse hook: refuse a write to a test file until the penno skill loads.

The lint rules and the other hooks refuse an incorrect test. None of them
teaches the shape of a correct one. This gate is the counterpart: it costs one
round trip and it puts the rules in context before the first test of a task.

The proof is the transcript, which only grows. One scan that finds the skill
holds for the whole session. Nothing is written after a denial, because a mark
that a denial clears lets the identical retry through.

Exit 0 = allowed or not a test write. Exit 0 with a deny payload = blocked.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

LOG = Path.home() / ".local" / "state" / "script-logs" / "penno-skill-gate.log"
LOG_LINES_MAX = 2000
TRANSCRIPT_BYTES_MAX = 64 * 1024 * 1024

TEST = re.compile(r"\.(?:test|spec)\.tsx?$|\.integration\.ts$")
WRITE_TOOLS = ("Write", "Edit", "NotebookEdit")
LOADED = re.compile(r'"skill"\s*:\s*"penno"')

REASON = """Blocked: the penno skill is not loaded in this session.

Call Skill(penno) now. Then write the test against Penno's five axioms:
behavior and not structure, infrastructure alone touches the world, a green
test shows something, the failing test comes first, a test is read alone.

This is a gate, not a formality. The identical call is blocked again."""

NO_ANSWER = """The gate read no answer, and no answer is no-go (docs/agents/security.md).
Correct the cause above. The log is ~/.local/state/script-logs/penno-skill-gate.log."""


def log(message: str) -> None:
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a") as handle:
            handle.write(message.rstrip() + "\n")
        lines = LOG.read_text().splitlines()
        if len(lines) > LOG_LINES_MAX:
            LOG.write_text("\n".join(lines[-LOG_LINES_MAX:]) + "\n")
    except OSError:
        pass  # logging must never break the hook


def skill_is_in_transcript(path: Path) -> bool:
    assert path.is_file()

    read = 0

    with path.open(errors="replace") as transcript:
        for line in transcript:
            read += len(line)

            if read > TRANSCRIPT_BYTES_MAX:
                log(f"{datetime.now().isoformat(timespec='seconds')} WARN transcript over budget")

                return True  # a transcript this long outlived the gate

            if LOADED.search(line):
                return True

    assert read >= 0

    return False


def verdict(transcript_path: str) -> str:
    """The deny reason for a test write, or "" when the transcript shows the skill."""
    assert isinstance(transcript_path, str)
    assert REASON.startswith("Blocked: ")

    path = Path(transcript_path).expanduser()

    if not path.is_file():
        return no_answer(f"the transcript path {transcript_path!r} names no file")

    try:
        loaded = skill_is_in_transcript(path)
    except OSError as error:
        return no_answer(f"the transcript {transcript_path!r} is unreadable: {error}")

    assert isinstance(loaded, bool)

    return "" if loaded else REASON


def payload_problem(payload: object) -> str:
    """The cause when the payload has no shape that the gate can read, or ""."""
    if not isinstance(payload, dict):
        return f"the payload is a JSON {type(payload).__name__}, not an object"

    tool_input = payload.get("tool_input", {})

    if not isinstance(tool_input, dict):
        return "the payload field tool_input is not an object"

    if not isinstance(tool_input.get("file_path", ""), str):
        return "the payload field file_path is not a string"

    if not isinstance(payload.get("transcript_path", ""), str):
        return "the payload field transcript_path is not a string"

    return ""


def no_answer(cause: str) -> str:
    assert cause
    assert "\n" not in cause

    return f"Blocked: {cause}.\n\n{NO_ANSWER}"


def deny(reason: str) -> None:
    assert reason.startswith("Blocked: ")
    assert len(reason) > len("Blocked: ")

    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
    )


def main() -> int:
    stamp = datetime.now().isoformat(timespec="seconds")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        log(f"{stamp} BLOCK payload is not JSON: {error}")
        deny(no_answer(f"the payload is not JSON: {error}"))

        return 0

    problem = payload_problem(payload)

    if problem != "":
        log(f"{stamp} BLOCK {problem}")
        deny(no_answer(problem))

        return 0

    if payload.get("tool_name", "") not in WRITE_TOOLS:
        return 0

    written = payload.get("tool_input", {}).get("file_path", "")

    if not TEST.search(written):
        return 0

    reason = verdict(payload.get("transcript_path", ""))

    if reason == "":
        log(f"{stamp} PASS {written}")

        return 0

    log(f"{stamp} BLOCK {written}: {reason.splitlines()[0]} payload keys: {sorted(payload)}")
    deny(reason)

    return 0


if __name__ == "__main__":
    sys.exit(main())
