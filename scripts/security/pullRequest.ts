import { baseRef, changedFiles, modifiedFiles } from '../git.ts'
import { execute, parseJson } from '../io.ts'
import {
  type CommitVerification,
  policyOnlyProblems,
  unsignedCommitProblems,
} from './pullRequestChecks.ts'
import assert from 'node:assert'

// The CI runner holds no public key of the signer, so GitHub reads the signature.
const COMMITS_JQ =
  '.[] | {sha, verified: .commit.verification.verified, reason: .commit.verification.reason}'

const main = (argv: string[]): number => {
  const [repository, number] = argv

  assert(
    repository?.includes('/'),
    'usage: pullRequest.ts <owner/repo> <number>',
  )
  assert(
    /^\d+$/u.test(number ?? ''),
    'usage: pullRequest.ts <owner/repo> <number>',
  )

  const ref = baseRef()

  if (ref === undefined) {
    console.error(
      'pull request: no origin/main and no main. Fetch the base branch.',
    )

    return 1
  }

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
    ...policyOnlyProblems(modifiedFiles(ref), changedFiles(ref)),
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
