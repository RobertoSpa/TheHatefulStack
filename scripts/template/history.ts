import assert from 'node:assert'

export type Commit = { date: string; sha: string; subject: string }

const SHA_LENGTH = 40
const SHORT_SHA_LENGTH = 12
const PULL_REQUEST_SUBJECTS = [/\(#\d+\)$/u, /^Merge pull request #\d+ /u]

// Commits come newest first, as git log gives them.
export const changesOf = (commits: Commit[]): string[] => {
  assert(commits.every((commit) => commit.sha.length === SHA_LENGTH))

  const changes = commits
    .filter(({ subject }) =>
      PULL_REQUEST_SUBJECTS.some((pattern) => pattern.test(subject)),
    )
    .map(({ sha, subject }) => `${sha.slice(0, SHORT_SHA_LENGTH)} ${subject}`)

  assert(changes.length <= commits.length)

  return changes
}

export const templateCommitAt = (
  commits: Commit[],
  createdAt: string,
): string | undefined => {
  const createdMs = Date.parse(createdAt)

  assert(Number.isFinite(createdMs), `not a date: ${createdAt}`)
  assert(commits.every((commit) => Number.isFinite(Date.parse(commit.date))))

  const newest = commits.find((commit) => Date.parse(commit.date) <= createdMs)

  assert(newest === undefined || newest.sha.length === SHA_LENGTH)

  return newest?.sha
}
