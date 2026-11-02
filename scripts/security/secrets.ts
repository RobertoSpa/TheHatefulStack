import { type Outcome } from '../gates.ts'
import { trackedFiles } from '../git.ts'
import { execute } from '../io.ts'
import { type Policy } from './policyChecks.ts'
import { gitleaksProblems, secretFileProblems } from './secretsChecks.ts'
import assert from 'node:assert'

export const checkSecrets = (policy: Policy): Outcome => {
  assert(Array.isArray(policy.secrets.filename_patterns))
  assert(policy.secrets.filename_patterns.length > 0)

  const problems = [
    ...secretFileProblems(policy.secrets.filename_patterns, trackedFiles()),
    ...gitleaksProblems(
      execute('gitleaks', [
        'git',
        '--no-banner',
        '--redact',
        '--report-format',
        'json',
        '--report-path',
        '-',
        '.',
      ]),
    ),
  ]

  assert(problems.every((problem) => problem.length > 0))

  return { notes: [], problems }
}
