#!/usr/bin/env python3
"""PreToolUse hook: refuse a write to src/ until a test failed after the last one.

The first law says that no production code is written before a failing test.
The transcript is the only proof available to a hook. A write to a source file
under src/ is allowed when the transcript shows a failing test run later than
the last source write. A test file is never gated, because writing the failing
test is the step that this gate asks for.

The agent chooses which test to run, so this gate is partial. It stops the
common sequence in which the code is written first and the test second.

Exit 0 = allowed or not a gated write. Exit 0 with a deny payload = blocked.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

LOG = Path.home() / ".local" / "state" / "script-logs" / "three-laws-gate.log"
LOG_LINES_MAX = 2000
TRANSCRIPT_BYTES_MAX = 64 * 1024 * 1024

SOURCE = re.compile(r"(?:^|/)src/.*\.tsx?$")
TEST = re.compile(r"\.(?:test|spec)\.tsx?$|\.integration\.ts$")
WRITE_TOOLS = ("Write", "Edit", "NotebookEdit")

FAILED_RUN = re.compile(
    r"Tests\s+\d+ failed|\d+ failed \(\d+\)|FAIL\s+src/"
    r"|\d+ failed(?:\\n|\n) +\S+\.e2e\.[jt]s:"
    r"|error TS\d+:"
    r"|✖ \d+ problems? \([1-9]\d* errors?"
    r"|(?:\\n|\n)no-go +[a-z]+"
)
TOOL_USE = "tool_use"
TOOL_USE_MARK = '"tool_use"'
TOOL_RESULT = "tool_result"
TOOL_RESULT_MARK = '"tool_result"'

REASON = """Blocked: no test failed since the last write to src/.

Write the failing test first, run it, and let it fail for the reason that the
new code will fix. Then write the code.

Only sufficient test code to fail, then only sufficient production code to pass.
See .claude/skills/penno/SKILL.md"""

NO_ANSWER = """The gate read no answer, and no answer is no-go (docs/agents/security.md).
Correct the cause above. The log is ~/.local/state/script-logs/three-laws-gate.log."""


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


def is_gated(file_path: str) -> bool:
    if not file_path:
        return False

    if TEST.search(file_path):
        return False

    return SOURCE.search(file_path) is not None


def write_block_path(block: object) -> str:
    """The file_path of one write tool call in a transcript line, or "" for the rest."""
    assert isinstance(WRITE_TOOLS, tuple)
    assert len(WRITE_TOOLS) == 3

    if not isinstance(block, dict):
        return ""

    if block.get("type") != TOOL_USE:
        return ""

    if block.get("name") not in WRITE_TOOLS:
        return ""

    arguments = block.get("input")

    if not isinstance(arguments, dict):
        return ""

    return str(arguments.get("file_path", ""))


def wrote_gated_source(line: str) -> bool:
    """True when a write tool touched a gated src/ file on this transcript line.

    A Read, a Grep, and a quoted path in a message all carry a file_path too.
    Only a tool_use block named by WRITE_TOOLS counts as a write.
    """
    assert isinstance(line, str)
    assert TOOL_USE_MARK == '"tool_use"'

    if TOOL_USE_MARK not in line:
        return False

    return any(is_gated(write_block_path(block)) for block in content_blocks(line))


def content_blocks(line: str) -> list:
    """The message content blocks of one transcript line, or [] for any other shape."""
    assert isinstance(line, str)
    assert line != ""

    try:
        entry = json.loads(line)
    except json.JSONDecodeError:
        return []  # a truncated line proves nothing

    if not isinstance(entry, dict):
        return []

    message = entry.get("message")

    if not isinstance(message, dict):
        return []

    content = message.get("content")

    if not isinstance(content, list):
        return []

    return content


def result_block_text(block: object) -> str:
    """The output text of one tool_result block, or "" for the rest."""
    assert isinstance(TOOL_RESULT, str)
    assert TOOL_RESULT_MARK == f'"{TOOL_RESULT}"'

    if not isinstance(block, dict):
        return ""

    if block.get("type") != TOOL_RESULT:
        return ""

    output = block.get("content")

    if isinstance(output, str):
        return output

    if not isinstance(output, list):
        return ""

    return "\n".join(str(part.get("text", "")) for part in output if isinstance(part, dict))


def ran_failing_test(line: str) -> bool:
    """True when a tool result, and not chat text, on this line shows a failing run."""
    assert isinstance(line, str)
    assert isinstance(FAILED_RUN, re.Pattern)

    if TOOL_RESULT_MARK not in line:
        return False

    return any(FAILED_RUN.search(result_block_text(block)) for block in content_blocks(line))


def scan(path: Path) -> tuple[int, int]:
    """Line number of the last gated write, and of the last failing test run.

    ponytail: reads the whole transcript on every gated write. Read it backwards
    and stop at the first hit if a long session gets slow.
    """
    wrote_at = 0
    failed_at = 0
    read = 0

    with path.open(errors="replace") as transcript:
        for number, line in enumerate(transcript, start=1):
            read += len(line)

            if read > TRANSCRIPT_BYTES_MAX:
                log(f"{datetime.now().isoformat(timespec='seconds')} WARN transcript over budget")

                return 0, 1

            if ran_failing_test(line):
                failed_at = number

            if wrote_gated_source(line):
                wrote_at = number

    assert wrote_at >= 0
    assert failed_at >= 0

    return wrote_at, failed_at


def verdict(transcript_path: str) -> str:
    """The deny reason for a gated write, or "" when a test failed since the last one."""
    assert isinstance(transcript_path, str)
    assert REASON.startswith("Blocked: ")

    path = Path(transcript_path).expanduser()

    if not path.is_file():
        return no_answer(f"the transcript path {transcript_path!r} names no file")

    try:
        wrote_at, failed_at = scan(path)
    except OSError as error:
        return no_answer(f"the transcript {transcript_path!r} is unreadable: {error}")

    assert wrote_at >= 0
    assert failed_at >= 0

    return "" if failed_at > wrote_at else REASON


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

    if not is_gated(written):
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
