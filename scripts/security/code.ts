import { type Outcome } from '../gates.ts'
import { execute } from '../io.ts'
import { eslintProblems } from './codeChecks.ts'
import { type Policy } from './policyChecks.ts'
import assert from 'node:assert'

export const checkCode = (policy: Policy): Outcome => {
  assert(Array.isArray(policy.gates))
  assert(policy.gates.includes('code'))

  const problems = eslintProblems(
    execute('pnpm', [
      'exec',
      'eslint',
      '.',
      '--max-warnings',
      '0',
      '--format',
      'json',
    ]),
  )

  assert(problems.every((problem) => problem.length > 0))

  return { notes: [], problems }
}
