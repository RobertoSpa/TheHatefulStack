import { type Execution, parseJson, tail } from '../io.ts'
import assert from 'node:assert'

export type RuleIds = readonly [string, ...string[]]

const RULE_ID = /^[A-Z]{2,5}-\d{2}$/u

export const ruleLine = (
  ids: RuleIds,
  tool: string,
  detail: string,
): string => {
  assert(ids.every((id) => RULE_ID.test(id)))
  assert(tool.length > 0)
  assert(detail.length > 0)

  return `${ids.join(' ')} ${tool}: ${detail.replaceAll(/\s+/gu, ' ').trim()}`
}

// A failed run with no finding in its JSON is a tool error, and the line names no rule.
export const toolProblems = <T>(
  tool: string,
  execution: Execution,
  findings: (report: T) => string[],
): string[] => {
  assert(tool.length > 0)
  assert(Number.isInteger(execution.status))

  if (execution.status === 0) {
    return []
  }

  const report = parseJson<T>(execution.stdout)
  const lines = report === undefined ? [] : findings(report)

  assert(lines.every((line) => line.length > 0))

  return lines.length > 0
    ? lines
    : [`${tool} failed`, ...tail(execution.output)]
}
