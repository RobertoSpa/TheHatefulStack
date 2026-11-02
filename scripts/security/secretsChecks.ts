import { type Execution } from '../io.ts'
import { type RuleIds, ruleLine, toolProblems } from './toolChecks.ts'
import assert from 'node:assert'

type GitleaksFinding = {
  Commit: string
  File: string
  RuleID: string
  StartLine: number
}

const PATTERNS_MAX = 100
const COMMIT_CHARS = 12
const GITLEAKS_RULES: RuleIds = ['SEC-01']

const gitleaksLine = (finding: GitleaksFinding): string => {
  assert(finding.File.length > 0)
  assert(finding.StartLine > 0)

  const commit =
    finding.Commit.length > 0
      ? ` in commit ${finding.Commit.slice(0, COMMIT_CHARS)}`
      : ''

  return ruleLine(
    GITLEAKS_RULES,
    'gitleaks',
    `${finding.File}:${finding.StartLine} ${finding.RuleID}${commit}`,
  )
}

export const gitleaksProblems = (execution: Execution): string[] =>
  toolProblems<GitleaksFinding[]>('gitleaks', execution, (findings) =>
    findings.map(gitleaksLine),
  )

const patternToRegExp = (pattern: string): RegExp => {
  assert(pattern.length > 0)
  assert(!pattern.includes('/'))

  const escaped = pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`)

  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`, 'u')
}

export const secretFileProblems = (
  patterns: string[],
  tracked: string[],
): string[] => {
  assert(patterns.length <= PATTERNS_MAX)
  assert(Array.isArray(tracked))

  const matchers = patterns.map((pattern) => ({
    pattern,
    regExp: patternToRegExp(pattern),
  }))
  const problems: string[] = []

  for (const path of tracked) {
    const base = path.split('/').at(-1) ?? ''
    const hit = matchers.find(({ regExp }) => regExp.test(base))

    if (hit !== undefined) {
      problems.push(
        `${path} matches the secret pattern ${hit.pattern}. Rule SEC-03.`,
      )
    }
  }

  assert(problems.length <= tracked.length)

  return problems
}
