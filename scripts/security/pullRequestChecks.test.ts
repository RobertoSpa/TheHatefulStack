import {
  policyIsolationProblems,
  unsignedCommitProblems,
} from './pullRequestChecks.ts'
import { describe, expect, it } from 'vitest'

const FIRST = 'a'.repeat(40)
const SECOND = 'b'.repeat(40)

describe('unsignedCommitProblems', () => {
  it('accepts a pull request whose commits are all verified', () => {
    const commits = [
      { reason: 'valid', sha: FIRST, verified: true },
      { reason: 'valid', sha: SECOND, verified: true },
    ]

    expect(unsignedCommitProblems(commits)).toStrictEqual([])
  })

  it.each([
    ['unsigned', 'commit bbbbbbbbbbbb is not signed (unsigned). Rule REPO-03.'],
    [
      'unknown_key',
      'commit bbbbbbbbbbbb is not signed (unknown_key). Rule REPO-03.',
    ],
  ])('refuses one commit that GitHub reads as %s', (reason, problem) => {
    const commits = [
      { reason: 'valid', sha: FIRST, verified: true },
      { reason, sha: SECOND, verified: false },
    ]

    expect(unsignedCommitProblems(commits)).toStrictEqual([problem])
  })

  it('accepts 249 verified commits', () => {
    const commits = Array.from({ length: 249 }, () => ({
      reason: 'valid',
      sha: FIRST,
      verified: true,
    }))

    expect(unsignedCommitProblems(commits)).toStrictEqual([])
  })

  it('refuses 250 commits, because GitHub lists no more', () => {
    const commits = Array.from({ length: 250 }, () => ({
      reason: 'valid',
      sha: FIRST,
      verified: true,
    }))

    expect(unsignedCommitProblems(commits)).toStrictEqual([
      'the pull request has 250 commits, and GitHub lists no more. Split the pull request. Rule REPO-03.',
    ])
  })
})

describe('policyIsolationProblems', () => {
  it.each([
    ['security/policy.yaml', 'SOT-04'],
    ['a11y/policy.yaml', 'ASOT-04'],
    ['resilience/policy.yaml', 'RSOT-03'],
    ['timing/policy.yaml', 'TSOT-04'],
    ['exposure/policy.yaml', 'ESOT-04'],
  ])('refuses %s with a source file', (policy, rule) => {
    const changed = [policy, 'src/app/main.tsx']

    expect(policyIsolationProblems([policy], changed)).toStrictEqual([
      `${policy} changes with 1 other file. It is its own pull request. Rule ${rule}.`,
    ])
  })

  it('accepts a policy file on the base that is the only change', () => {
    const changed = ['security/policy.yaml']

    expect(policyIsolationProblems(changed, changed)).toStrictEqual([])
  })

  it('accepts a new policy file that comes with other files', () => {
    const changed = ['timing/policy.yaml', 'timing/routes.yaml']

    expect(policyIsolationProblems([], changed)).toStrictEqual([])
  })

  it('accepts a source change with no policy file', () => {
    const changed = ['src/app/main.tsx', 'README.md']

    expect(
      policyIsolationProblems(['src/app/main.tsx'], changed),
    ).toStrictEqual([])
  })

  it('leaves the bundle policy to pnpm bundle', () => {
    const changed = ['bundle/policy.yaml', 'src/app/main.tsx']

    expect(policyIsolationProblems(changed, changed)).toStrictEqual([])
  })

  it('refuses two policy files that change together', () => {
    const changed = ['a11y/policy.yaml', 'security/policy.yaml']

    expect(policyIsolationProblems(changed, changed)).toStrictEqual([
      'a11y/policy.yaml changes with 1 other file. It is its own pull request. Rule ASOT-04.',
      'security/policy.yaml changes with 1 other file. It is its own pull request. Rule SOT-04.',
    ])
  })
})
