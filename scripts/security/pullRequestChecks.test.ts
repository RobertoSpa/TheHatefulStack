import {
  policyOnlyProblems,
  unsignedCommitProblems,
} from './pullRequestChecks.ts'
import { describe, expect, it } from 'vitest'

const SIGNED = 'a'.repeat(40)
const UNSIGNED = 'b'.repeat(40)

describe('unsignedCommitProblems', () => {
  it('accepts a pull request whose commits are all verified', () => {
    const commits = [
      { reason: 'valid', sha: SIGNED, verified: true },
      { reason: 'valid', sha: UNSIGNED, verified: true },
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
      { reason: 'valid', sha: SIGNED, verified: true },
      { reason, sha: UNSIGNED, verified: false },
    ]

    expect(unsignedCommitProblems(commits)).toStrictEqual([problem])
  })
})

describe('policyOnlyProblems', () => {
  it.each([
    ['security/policy.yaml', 'SOT-04'],
    ['a11y/policy.yaml', 'ASOT-04'],
    ['resilience/policy.yaml', 'RSOT-03'],
    ['timing/policy.yaml', 'TSOT-04'],
    ['exposure/policy.yaml', 'ESOT-04'],
  ])('refuses %s with a source file', (policy, rule) => {
    const changed = [policy, 'src/app/main.tsx']

    expect(policyOnlyProblems([policy], changed)).toStrictEqual([
      `${policy} changes with 1 other file. It is its own pull request. Rule ${rule}.`,
    ])
  })

  it('accepts a modified policy file that is the only change', () => {
    const changed = ['security/policy.yaml']

    expect(policyOnlyProblems(changed, changed)).toStrictEqual([])
  })

  it('accepts a new policy file that comes with other files', () => {
    const changed = ['timing/policy.yaml', 'timing/routes.yaml']

    expect(policyOnlyProblems([], changed)).toStrictEqual([])
  })

  it('accepts a source change with no policy file', () => {
    const changed = ['src/app/main.tsx', 'README.md']

    expect(policyOnlyProblems(['src/app/main.tsx'], changed)).toStrictEqual([])
  })

  it('leaves the bundle policy to pnpm bundle', () => {
    const changed = ['bundle/policy.yaml', 'src/app/main.tsx']

    expect(policyOnlyProblems(changed, changed)).toStrictEqual([])
  })

  it('refuses two policy files that change together', () => {
    const changed = ['a11y/policy.yaml', 'security/policy.yaml']

    expect(policyOnlyProblems(changed, changed)).toStrictEqual([
      'a11y/policy.yaml changes with 1 other file. It is its own pull request. Rule ASOT-04.',
      'security/policy.yaml changes with 1 other file. It is its own pull request. Rule SOT-04.',
    ])
  })
})
