import { POLICY_PATHS } from '../policies.ts'
import assert from 'node:assert'

export type CommitVerification = {
  reason: string
  sha: string
  verified: boolean
}

// The GitHub API lists 250 commits of a pull request and no more.
const COMMITS_MAX = 250
const FILES_MAX = 100_000
const SHA_CHARS = 12

// Rule BSOT-03 permits five changes next to the bundle policy, so pnpm bundle tests it.
const POLICY_ONLY_RULES: Record<string, string> = {
  [POLICY_PATHS.a11y]: 'ASOT-04',
  [POLICY_PATHS.exposure]: 'ESOT-04',
  [POLICY_PATHS.resilience]: 'RSOT-03',
  [POLICY_PATHS.security]: 'SOT-04',
  [POLICY_PATHS.timing]: 'TSOT-04',
}

export const unsignedCommitProblems = (
  commits: CommitVerification[],
): string[] => {
  assert(commits.length <= COMMITS_MAX)

  if (commits.length === COMMITS_MAX) {
    return [
      `the pull request has ${COMMITS_MAX} commits, and GitHub lists no more. Split the pull request. Rule REPO-03.`,
    ]
  }

  const problems = commits
    .filter((commit) => !commit.verified)
    .map(
      (commit) =>
        `commit ${commit.sha.slice(0, SHA_CHARS)} is not signed (${commit.reason}). Rule REPO-03.`,
    )

  assert(problems.length <= commits.length)

  return problems
}

// A new policy file is not a change of a limit, so only a file that is on the base counts.
export const policyIsolationProblems = (
  existing: string[],
  changed: string[],
): string[] => {
  assert(changed.length <= FILES_MAX)
  assert(existing.every((path) => changed.includes(path)))

  const others = changed.length - 1
  const problems = Object.entries(POLICY_ONLY_RULES)
    .filter(([path]) => existing.includes(path) && others > 0)
    .map(
      ([path, rule]) =>
        `${path} changes with ${others} other file${others === 1 ? '' : 's'}. It is its own pull request. Rule ${rule}.`,
    )
    .toSorted()

  assert(problems.length <= Object.keys(POLICY_ONLY_RULES).length)

  return problems
}
