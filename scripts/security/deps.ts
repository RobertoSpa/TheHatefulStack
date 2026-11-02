import { type Outcome } from '../gates.ts'
import { execute, type Execution, readText, readYaml } from '../io.ts'
import {
  type DependencyRecord,
  knipProblems,
  osvProblems,
  type PackageJson,
  pinProblems,
  recordProblems,
} from './depsChecks.ts'
import { type Policy } from './policyChecks.ts'
import assert from 'node:assert'

const PACKAGE_PATH = 'package.json'
const LOCKFILE_PATH = 'pnpm-lock.yaml'

const osvExecution = (policy: Policy): Execution => {
  assert(policy.dependency.licenses_allowed.length > 0)

  return execute('osv-scanner', [
    'scan',
    'source',
    '--format',
    'json',
    '--lockfile',
    LOCKFILE_PATH,
    `--licenses=${policy.dependency.licenses_allowed.join(',')}`,
  ])
}

export const checkDeps = (policy: Policy): Outcome => {
  assert(policy.dependency.records.length > 0)
  assert(policy.dependency.min_lines_replaced > 0)

  const packageJson = JSON.parse(readText(PACKAGE_PATH)) as PackageJson
  const records = readYaml<DependencyRecord[]>(policy.dependency.records)
  const problems = [
    ...recordProblems(policy.dependency, packageJson, records),
    ...pinProblems(packageJson),
    ...knipProblems(
      execute('pnpm', [
        'exec',
        'knip',
        '--no-progress',
        '--exclude',
        'cycles',
        '--reporter',
        'json',
      ]),
    ),
    ...osvProblems(osvExecution(policy)),
  ]

  assert(Array.isArray(records))

  return { notes: [], problems }
}
