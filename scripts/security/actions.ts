import { type Outcome } from '../gates.ts'
import { execute, readYaml } from '../io.ts'
import {
  actionlintProblems,
  actionsWorkflowProblems,
  pinactProblems,
  type Workflow,
  zizmorProblems,
} from './actionsChecks.ts'
import { type Policy } from './policyChecks.ts'
import assert from 'node:assert'
import { readdirSync } from 'node:fs'

const WORKFLOWS_DIR = '.github/workflows'
const WORKFLOWS_MAX = 50

export const checkActions = (policy: Policy): Outcome => {
  assert(policy.actions.owners_allowed.length > 0)
  assert(policy.actions.zizmor_persona.length > 0)

  const names = readdirSync(WORKFLOWS_DIR).filter((name) =>
    name.endsWith('.yml'),
  )

  assert(names.length <= WORKFLOWS_MAX)

  const problems = names.flatMap((name) =>
    actionsWorkflowProblems(
      policy.actions,
      name,
      readYaml<Workflow>(`${WORKFLOWS_DIR}/${name}`),
    ),
  )

  problems.push(
    ...pinactProblems(
      execute('pinact', ['run', '--check', '--format', 'sarif']),
    ),
    ...actionlintProblems(execute('actionlint', ['-format', '{{json .}}'])),
    ...zizmorProblems(
      execute('zizmor', [
        '--persona',
        policy.actions.zizmor_persona,
        '--format',
        'json',
        '--no-progress',
        WORKFLOWS_DIR,
      ]),
    ),
  )

  return { notes: [], problems }
}
