import { type Execution } from '../io.ts'
import { type RuleIds, ruleLine, toolProblems } from './toolChecks.ts'
import assert from 'node:assert'

export type DependencyPolicy = {
  allow_builds: string[]
  min_lines_replaced: number
  trust_policy_exclude: string[]
}

export type DependencyRecord = {
  build?: string
  cause?: string
  lines?: number
  name: string
  since?: string
  trust?: string
  without?: string
}

export type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const RECORDS_FILE = 'security/dependencies.yaml'
// One version is a full semantic version, with an optional prerelease tag.
const CORE_VERSION = /^\d+\.\d+\.\d+$/u
const PRERELEASE = /^[\w.]+$/u

const isOneVersion = (version: string): boolean => {
  assert(typeof version === 'string')

  const [core, ...rest] = version.split('-')
  const prerelease = rest.join('-')

  assert(core !== undefined)

  return (
    CORE_VERSION.test(core) &&
    (rest.length === 0 || PRERELEASE.test(prerelease))
  )
}

const runtimeRecordProblems = (
  policy: DependencyPolicy,
  record: DependencyRecord,
): string[] => {
  assert(record.name.length > 0)
  assert(policy.min_lines_replaced > 0)

  if (record.cause === undefined) {
    return [`${record.name} record has no cause. Rule DEP-01.`]
  }

  if (record.without === undefined) {
    return [`${record.name} record has no without. Rule DEP-01.`]
  }

  if (record.lines === undefined) {
    return [`${record.name} record has no lines. Rule DEP-01.`]
  }

  if (record.lines < policy.min_lines_replaced) {
    return [
      `${record.name} replaces ${record.lines} lines, policy wants ${policy.min_lines_replaced} or more. Rule DEP-02.`,
    ]
  }

  return []
}

const dependencyProblems = (
  policy: DependencyPolicy,
  packageJson: PackageJson,
  byName: Map<string, DependencyRecord>,
): string[] => {
  assert(byName instanceof Map)
  assert(policy.min_lines_replaced > 0)

  const runtime = Object.keys(packageJson.dependencies ?? {})
  const development = Object.keys(packageJson.devDependencies ?? {})
  const problems: string[] = []

  for (const name of [...runtime, ...development]) {
    const record = byName.get(name)

    if (record === undefined) {
      problems.push(`${name} has no record in ${RECORDS_FILE}. Rule DEP-01.`)
    } else if (runtime.includes(name)) {
      problems.push(...runtimeRecordProblems(policy, record))
    } else if (record.cause === undefined) {
      problems.push(`${name} record has no cause. Rule DEP-01.`)
    }
  }

  assert(problems.length <= runtime.length + development.length)

  return problems
}

const listProblems = (
  names: string[],
  byName: Map<string, DependencyRecord>,
  field: 'build' | 'trust',
  list: string,
): string[] => {
  assert(Array.isArray(names))
  assert(field.length > 0)

  return names
    .filter((name) => byName.get(name)?.[field] === undefined)
    .map((name) => `${name} is in ${list} with no ${field} record`)
}

const staleRecordProblems = (
  packageJson: PackageJson,
  records: DependencyRecord[],
): string[] => {
  assert(Array.isArray(records))
  assert(typeof packageJson === 'object')

  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ])

  return records
    .filter((record) => record.build === undefined)
    .filter((record) => record.trust === undefined)
    .filter((record) => !declared.has(record.name))
    .map((record) => `${record.name} has a record and is not a dependency`)
}

export const recordProblems = (
  policy: DependencyPolicy,
  packageJson: PackageJson,
  records: DependencyRecord[],
): string[] => {
  assert(Array.isArray(records))
  assert(Array.isArray(policy.allow_builds))

  const byName = new Map(records.map((record) => [record.name, record]))

  assert(byName.size === records.length, 'two records share a name')

  const problems = [
    ...dependencyProblems(policy, packageJson, byName),
    ...listProblems(policy.allow_builds, byName, 'build', 'allow_builds'),
    ...listProblems(
      policy.trust_policy_exclude,
      byName,
      'trust',
      'trust_policy_exclude',
    ),
    ...staleRecordProblems(packageJson, records),
  ]

  assert(problems.every((problem) => problem.length > 0))

  return problems
}

export const pinProblems = (packageJson: PackageJson): string[] => {
  assert(typeof packageJson === 'object')

  const entries = [
    ...Object.entries(packageJson.dependencies ?? {}),
    ...Object.entries(packageJson.devDependencies ?? {}),
  ]
  const problems = entries
    .filter(([, version]) => !isOneVersion(version))
    .map(
      ([name, version]) =>
        `${name} is ${version}, not one version. Rule DEP-15.`,
    )

  assert(problems.length <= entries.length)

  return problems
}

type KnipItem = { name: string }

type KnipRow = {
  [issueClass: string]: Array<KnipItem | KnipItem[]> | string | undefined
  file: string
}

type OsvPackage = {
  groups?: Array<{ ids: string[] }>
  license_violations?: string[]
  package: { name: string; version: string }
}

type OsvReport = { results?: Array<{ packages: OsvPackage[] }> }

const OSV_NO_PACKAGES_STATUS = 128
const OSV_LICENSE_RULES: RuleIds = ['DEP-10']
const OSV_VULNERABILITY_RULES: RuleIds = ['DEP-11']
const KNIP_DEPENDENCY_RULES: RuleIds = ['DEP-14']
const KNIP_CODE_RULES: RuleIds = ['CODE-07']
const KNIP_RULES = new Map<string, RuleIds>([
  ['binaries', KNIP_DEPENDENCY_RULES],
  ['catalog', KNIP_DEPENDENCY_RULES],
  ['catalogReferences', KNIP_DEPENDENCY_RULES],
  ['dependencies', KNIP_DEPENDENCY_RULES],
  ['devDependencies', KNIP_DEPENDENCY_RULES],
  ['duplicates', KNIP_CODE_RULES],
  ['enumMembers', KNIP_CODE_RULES],
  ['exports', KNIP_CODE_RULES],
  ['files', KNIP_CODE_RULES],
  ['namespaceMembers', KNIP_CODE_RULES],
  ['nsExports', KNIP_CODE_RULES],
  ['nsTypes', KNIP_CODE_RULES],
  ['optionalPeerDependencies', KNIP_DEPENDENCY_RULES],
  ['types', KNIP_CODE_RULES],
  ['unlisted', KNIP_DEPENDENCY_RULES],
  ['unresolved', KNIP_DEPENDENCY_RULES],
])

const osvPackageLines = (entry: OsvPackage): string[] => {
  assert(entry.package.name.length > 0)
  assert(entry.package.version.length > 0)

  const name = `${entry.package.name}@${entry.package.version}`
  const advisories = (entry.groups ?? []).map((group) => group.ids[0] ?? '')
  const licenses = entry.license_violations ?? []
  const lines: string[] = []

  assert(advisories.every((advisory) => advisory.length > 0))

  if (advisories.length > 0) {
    lines.push(
      ruleLine(
        OSV_VULNERABILITY_RULES,
        'osv-scanner',
        `${name} ${advisories.join(', ')}`,
      ),
    )
  }

  if (licenses.length > 0) {
    lines.push(
      ruleLine(
        OSV_LICENSE_RULES,
        'osv-scanner',
        `${name} license ${licenses.join(', ')}`,
      ),
    )
  }

  return lines
}

export const osvProblems = (execution: Execution): string[] =>
  execution.status === OSV_NO_PACKAGES_STATUS
    ? []
    : toolProblems<OsvReport>('osv-scanner', execution, (report) =>
        (report.results ?? []).flatMap((result) =>
          result.packages.flatMap(osvPackageLines),
        ),
      )

const knipRowLines = (row: KnipRow): string[] => {
  assert(row.file.length > 0)

  const lines = [...KNIP_RULES].flatMap(([issueClass, ids]) => {
    const items = row[issueClass]

    return Array.isArray(items)
      ? items.map((item) => {
          const name = Array.isArray(item)
            ? item.map((part) => part.name).join(', ')
            : item.name

          return ruleLine(ids, 'knip', `${row.file} ${issueClass} ${name}`)
        })
      : []
  })

  assert(lines.every((line) => line.includes(row.file)))

  return lines
}

export const knipProblems = (execution: Execution): string[] =>
  toolProblems<{ issues: KnipRow[] }>('knip', execution, (report) =>
    report.issues.flatMap(knipRowLines),
  )
