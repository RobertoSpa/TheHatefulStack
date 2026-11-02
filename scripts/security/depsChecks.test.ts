import {
  knipProblems,
  osvProblems,
  pinProblems,
  recordProblems,
} from './depsChecks.ts'
import { describe, expect, it } from 'vitest'

const policy = {
  allow_builds: ['esbuild'],
  min_lines_replaced: 200,
  trust_policy_exclude: ['chokidar'],
}

const packageJson = () => ({
  dependencies: { react: '19.2.8' },
  devDependencies: { vitest: '4.1.11' },
})

const records = () => [
  {
    cause: 'the UI library',
    lines: 20_000,
    name: 'react',
    since: '2026-09-20',
    without: 'a DOM differ',
  },
  { cause: 'the test runner', name: 'vitest', since: '2026-09-20' },
  {
    build: 'selects the platform binary',
    name: 'esbuild',
    since: '2026-09-20',
  },
  { name: 'chokidar', since: '2026-09-20', trust: '4.0.3 has no provenance' },
]

describe('recordProblems', () => {
  it('accepts a record for each dependency, each build, and each trust exclusion', () => {
    expect(recordProblems(policy, packageJson(), records())).toStrictEqual([])
  })

  it('refuses a dependency with no record', () => {
    const json = {
      ...packageJson(),
      devDependencies: { knip: '6.35.1', vitest: '4.1.11' },
    }

    expect(recordProblems(policy, json, records())).toStrictEqual([
      'knip has no record in security/dependencies.yaml. Rule DEP-01.',
    ])
  })

  it.each([
    [
      { lines: 50 },
      'react replaces 50 lines, policy wants 200 or more. Rule DEP-02.',
    ],
    [{ lines: undefined }, 'react record has no lines. Rule DEP-01.'],
    [{ without: undefined }, 'react record has no without. Rule DEP-01.'],
    [{ cause: undefined }, 'react record has no cause. Rule DEP-01.'],
  ])('refuses a runtime dependency record with %o', (change, problem) => {
    const changed = records().map((record) =>
      record.name === 'react' ? { ...record, ...change } : record,
    )

    expect(recordProblems(policy, packageJson(), changed)).toStrictEqual([
      problem,
    ])
  })

  it('refuses a build package with no build rationale', () => {
    const changed = records().filter((record) => record.name !== 'esbuild')

    expect(recordProblems(policy, packageJson(), changed)).toStrictEqual([
      'esbuild is in allow_builds with no build record',
    ])
  })

  it('refuses a trust exclusion with no trust rationale', () => {
    const changed = records().filter((record) => record.name !== 'chokidar')

    expect(recordProblems(policy, packageJson(), changed)).toStrictEqual([
      'chokidar is in trust_policy_exclude with no trust record',
    ])
  })

  it('refuses a stale record that names no dependency', () => {
    const changed = [
      ...records(),
      { cause: 'gone', name: 'lodash', since: '2026-01-01' },
    ]

    expect(recordProblems(policy, packageJson(), changed)).toStrictEqual([
      'lodash has a record and is not a dependency',
    ])
  })
})

describe('pinProblems', () => {
  it('refuses each dependency with a range', () => {
    const json = {
      dependencies: { react: '^19.2.8' },
      devDependencies: { knip: '~6.35.1', vitest: '4.1.11' },
    }

    expect(pinProblems(json)).toStrictEqual([
      'react is ^19.2.8, not one version. Rule DEP-15.',
      'knip is ~6.35.1, not one version. Rule DEP-15.',
    ])
  })

  it.each(['latest', 'next', '1', '1.2', 'github:a/b', '*'])(
    'refuses the version %s, which is not one version',
    (version) => {
      expect(
        pinProblems({ dependencies: { a: version }, devDependencies: {} }),
      ).toStrictEqual([`a is ${version}, not one version. Rule DEP-15.`])
    },
  )

  it('passes a version with a prerelease tag', () => {
    expect(
      pinProblems({ dependencies: { a: '2.0.0-beta.3' }, devDependencies: {} }),
    ).toStrictEqual([])
  })

  it('passes dependencies that each have one version', () => {
    expect(
      pinProblems({ dependencies: { react: '19.3.0' }, devDependencies: {} }),
    ).toStrictEqual([])
  })
})

describe('osvProblems', () => {
  it('accepts a lockfile with no package', () => {
    expect(osvProblems({ output: '', status: 128, stdout: '' })).toStrictEqual(
      [],
    )
  })

  it('names rule DEP-11 first in one line per vulnerable package', () => {
    const stdout = JSON.stringify({
      results: [
        {
          packages: [
            {
              groups: [
                { ids: ['GHSA-29mw-wpgm-hmr9', 'CVE-2020-28500'] },
                { ids: ['GHSA-35jh-r3h4-6jhm'] },
              ],
              license_violations: [],
              package: { name: 'lodash', version: '4.17.20' },
            },
            {
              groups: [{ ids: ['GHSA-vh95-rmgr-6w4m'] }],
              package: { name: 'minimist', version: '1.2.0' },
            },
          ],
        },
      ],
    })

    expect(osvProblems({ output: stdout, status: 1, stdout })).toStrictEqual([
      'DEP-11 osv-scanner: lodash@4.17.20 GHSA-29mw-wpgm-hmr9, GHSA-35jh-r3h4-6jhm',
      'DEP-11 osv-scanner: minimist@1.2.0 GHSA-vh95-rmgr-6w4m',
    ])
  })

  it('names rule DEP-10 first for a license that the policy does not allow', () => {
    const stdout = JSON.stringify({
      results: [
        {
          packages: [
            {
              groups: [],
              license_violations: ['GPL-3.0'],
              package: { name: 'left-pad', version: '1.3.0' },
            },
          ],
        },
      ],
    })

    expect(osvProblems({ output: stdout, status: 1, stdout })).toStrictEqual([
      'DEP-10 osv-scanner: left-pad@1.3.0 license GPL-3.0',
    ])
  })
})

describe('knipProblems', () => {
  it('names rule DEP-14 for a dependency and CODE-07 for code', () => {
    const stdout = JSON.stringify({
      issues: [
        {
          devDependencies: [{ line: 40, name: 'left-pad' }],
          exports: [],
          file: 'package.json',
        },
        {
          catalogReferences: [{ line: 2, name: 'react' }],
          file: 'pnpm-workspace.yaml',
        },
        {
          dependencies: [],
          exports: [{ line: 3, name: 'unusedHelper' }],
          file: 'src/shared/lib/helper.ts',
        },
      ],
    })

    expect(knipProblems({ output: stdout, status: 1, stdout })).toStrictEqual([
      'DEP-14 knip: package.json devDependencies left-pad',
      'DEP-14 knip: pnpm-workspace.yaml catalogReferences react',
      'CODE-07 knip: src/shared/lib/helper.ts exports unusedHelper',
    ])
  })
})
