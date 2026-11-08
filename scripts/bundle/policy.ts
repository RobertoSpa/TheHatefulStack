import {
  type Deviation,
  deviationProblems,
  readDeviations,
} from '../deviations.ts'
import { gateProblems, plainLine, workflowProblems } from '../gateChecks.ts'
import { type Outcome } from '../gates.ts'
import { changedFiles, onMain } from '../git.ts'
import { exists, folders, readText, readYaml, today } from '../io.ts'
import { POLICY_PATHS, readPolicy } from '../policies.ts'
import { parseRules, unparsedProblems } from '../rules.ts'
import { workflowScheduleProblems } from '../schedule.ts'
import {
  policyDirectionProblems,
  policyOnlyProblems,
  stageDirectionProblems,
} from './directionChecks.ts'
import {
  extensionProblems,
  fileRuleProblems,
  integerProblems,
  manifestProblems,
  type PackageManifest,
  type ResolvedVite,
  routeRecordProblems,
  viteProblems,
} from './policyChecks.ts'
import { type Policy, RULES_PATH } from './shared.ts'
import assert from 'node:assert'
import { resolveConfig } from 'vite'
import { parse as parseYaml } from 'yaml'

const WORKFLOW_PATH = '.github/workflows/bundle.yml'
const GATE_NAMES = ['policy', 'size']
const PAGES_PATH = 'src/pages'

const resiliencePathsOf = (): string[] => {
  const { routes } = readPolicy<{ gates: string[]; routes: { file: string } }>(
    POLICY_PATHS.resilience,
  )
  const records = readYaml<Array<{ path: string }> | null>(routes.file) ?? []

  assert(Array.isArray(records))
  assert(records.every((record) => typeof record.path === 'string'))

  return records.map((record) => record.path)
}

const resolvedViteOf = async (): Promise<ResolvedVite> => {
  const config = await resolveConfig(
    { mode: 'production' },
    'build',
    'production',
    'production',
  )
  const { build } = config

  assert(build !== undefined)

  return {
    assetsInlineLimit: String(build.assetsInlineLimit),
    manifest: String(build.manifest),
    modulePreloadPolyfill: String(
      build.modulePreload !== false && build.modulePreload.polyfill,
    ),
    onLog: String(typeof build.rolldownOptions.onLog === 'function'),
    sourcemap: String(build.sourcemap),
    target: String(build.target),
  }
}

const baseProblems = (policy: Policy, deviations: Deviation[]): string[] => {
  assert(policy.version >= 1)

  const {
    ref,
    texts: [text],
  } = onMain([POLICY_PATHS.bundle])

  if (ref === undefined) {
    return ['git has no main and no origin/main to compare with. Rule FAIL-01.']
  }

  if (text === undefined) {
    return []
  }

  const base = parseYaml(text) as Policy

  return [
    ...policyOnlyProblems(changedFiles(ref), policy, base),
    ...policyDirectionProblems(policy, base, deviations),
    ...stageDirectionProblems(policy.routes, base.routes, policy.stage.order),
  ]
}

export const checkPolicy = async (policy: Policy): Promise<Outcome> => {
  assert(policy.gates.length > 0)

  const rulesText = readText(RULES_PATH)
  const rules = parseRules(rulesText)
  const deviations = readDeviations(policy.deviation.file)
  const manifest = JSON.parse(readText('package.json')) as PackageManifest
  const problems = [
    ...unparsedProblems(rulesText, rules, 'DOC-01'),
    ...gateProblems(policy.gates, GATE_NAMES, () => 'BSOT-02', plainLine),
    ...integerProblems(policy),
    ...extensionProblems(policy.files),
    ...fileRuleProblems(policy.files),
    ...manifestProblems(manifest, policy),
    ...routeRecordProblems(policy, folders(PAGES_PATH), resiliencePathsOf()),
    ...viteProblems(await resolvedViteOf(), policy),
    ...(exists(WORKFLOW_PATH)
      ? [
          ...workflowProblems(
            readText(WORKFLOW_PATH),
            'bundle',
            { continueOnError: 'FAIL-02', step: 'BSOT-02' },
            plainLine,
          ),
          ...workflowScheduleProblems(
            policy.schedule,
            WORKFLOW_PATH,
            'BSOT-01',
          ),
        ]
      : [`${WORKFLOW_PATH} is missing. Rule BSOT-02.`]),
    ...deviationProblems(deviations, {
      ids: { expiry: 'BDEV-01', fields: 'BDEV-01', mandatory: 'BDEV-01' },
      maxDays: policy.deviation.max_days,
      rules,
      todayIso: today(),
    }),
    ...baseProblems(policy, deviations),
  ]

  assert(rules.length > 0)

  return {
    notes: [
      `${rules.length} rules read`,
      `${deviations.length} deviations read`,
    ],
    problems,
  }
}
