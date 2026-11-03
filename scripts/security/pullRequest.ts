import { diffFiles } from '../git.ts'
import { execute, parseJson } from '../io.ts'
import {
  type CommitVerification,
  policyIsolationProblems,
  unsignedCommitProblems,
} from './pullRequestChecks.ts'
import assert from 'node:assert'

const USAGE = 'usage: pullRequest.ts <owner/repo> <number> <base sha>'

// The CI runner holds no public key of the signer, so GitHub reads the signature.
const COMMITS_JQ =
  '.[] | {sha, verified: (.commit.verification.verified // false), reason: (.commit.verification.reason // "no verification data")}'

const main = (argv: string[]): number => {
  const [repository, number, base] = argv

  assert(repository?.includes('/'), USAGE)
  assert(/^\d+$/u.test(number ?? ''), USAGE)
  assert(/^[0-9a-f]{40}$/u.test(base ?? ''), USAGE)

  const listed = execute('gh', [
    'api',
    '--paginate',
    `repos/${repository}/pulls/${number}/commits`,
    '--jq',
    COMMITS_JQ,
  ])

  if (listed.status !== 0) {
    console.error(`pull request: gh api failed. ${listed.output.trim()}`)

    return 1
  }

  const commits = listed.stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const commit = parseJson<CommitVerification>(line)

      assert(
        commit !== undefined,
        `gh api gave a line that is not JSON: ${line}`,
      )
      assert(typeof commit.verified === 'boolean')

      return commit
    })

  assert(commits.length > 0, 'a pull request has one commit or more')

  const problems = [
    ...unsignedCommitProblems(commits),
    ...policyIsolationProblems(
      diffFiles(base, ['--no-renames', '--diff-filter=a']),
      diffFiles(base, ['--no-renames']),
    ),
  ]

  for (const problem of problems) {
    console.error(`pull request: ${problem}`)
  }

  console.log(
    `pull request: ${commits.length} commits, ${problems.length} problems`,
  )

  return problems.length === 0 ? 0 : 1
}

process.exitCode = main(process.argv.slice(2))
