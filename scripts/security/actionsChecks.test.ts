import {
  actionlintProblems,
  actionsWorkflowProblems,
  pinactProblems,
  type Workflow,
  zizmorProblems,
} from './actionsChecks.ts'
import { describe, expect, it } from 'vitest'

const SHA = 'a'.repeat(40)

const policy = {
  egress_allowed: ['github.com:443', 'registry.npmjs.org:443'],
  owners_allowed: ['actions', 'step-security'],
}

const workflow = (): Workflow => ({
  jobs: {
    checks: {
      steps: [
        {
          uses: `step-security/harden-runner@${SHA}`,
          with: {
            'allowed-endpoints': 'github.com:443\nregistry.npmjs.org:443\n',
            'egress-policy': 'block',
          },
        },
        { uses: `actions/checkout@${SHA}` },
        { run: 'pnpm install --frozen-lockfile' },
      ],
    },
  },
  on: { pull_request: null },
  permissions: {},
})

describe('actionsWorkflowProblems', () => {
  it('accepts a workflow that obeys every rule', () => {
    expect(actionsWorkflowProblems(policy, 'ci.yml', workflow())).toStrictEqual(
      [],
    )
  })

  it.each([
    [
      { permissions: { contents: 'read' } },
      'ci.yml: permissions at the top is not {}. Rule CI-02.',
    ],
    [
      { permissions: undefined },
      'ci.yml: permissions at the top is not {}. Rule CI-02.',
    ],
    [
      { on: { pull_request_target: null } },
      'ci.yml: uses the trigger pull_request_target. Rule CI-03.',
    ],
  ])('refuses the top level %o', (change, problem) => {
    expect(
      actionsWorkflowProblems(policy, 'ci.yml', { ...workflow(), ...change }),
    ).toStrictEqual([problem])
  })

  it.each([
    [
      [{ uses: `actions/checkout@${SHA}` }],
      'ci.yml job checks: the first step is not step-security/harden-runner. Rule CI-05.',
    ],
    [
      [
        {
          uses: `step-security/harden-runner@${SHA}`,
          with: { 'egress-policy': 'audit' },
        },
      ],
      'ci.yml job checks: egress-policy is not block. Rule CI-05.',
    ],
    [
      [
        {
          uses: `step-security/harden-runner@${SHA}`,
          with: {
            'allowed-endpoints': 'evil.example:443',
            'egress-policy': 'block',
          },
        },
      ],
      'ci.yml job checks: endpoint evil.example:443 is not in policy actions.egress_allowed',
    ],
    [
      [
        {
          uses: `step-security/harden-runner@${SHA}`,
          with: { 'egress-policy': 'block' },
        },
        { uses: 'actions/checkout@v7' },
      ],
      'ci.yml job checks: actions/checkout@v7 is not pinned to a SHA. Rule CI-01.',
    ],
    [
      [
        {
          uses: `step-security/harden-runner@${SHA}`,
          with: { 'egress-policy': 'block' },
        },
        { uses: `tj-actions/changed-files@${SHA}` },
      ],
      'ci.yml job checks: owner tj-actions is not in policy actions.owners_allowed',
    ],
    [
      [
        {
          uses: `step-security/harden-runner@${SHA}`,
          with: { 'egress-policy': 'block' },
        },
        { env: { TOKEN: '${{ secrets.NPM_TOKEN }}' }, run: 'npm publish' },
      ],
      'ci.yml job checks: uses the long-lived secret NPM_TOKEN',
    ],
  ])('refuses the steps %o', (steps, problem) => {
    const changed = { ...workflow(), jobs: { checks: { steps } } }

    expect(actionsWorkflowProblems(policy, 'ci.yml', changed)).toStrictEqual([
      problem,
    ])
  })

  it('lets a step read secrets.GITHUB_TOKEN', () => {
    const steps = [
      {
        uses: `step-security/harden-runner@${SHA}`,
        with: { 'egress-policy': 'block' },
      },
      { env: { GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }, run: 'gh api' },
    ]
    const changed = { ...workflow(), jobs: { checks: { steps } } }

    expect(actionsWorkflowProblems(policy, 'ci.yml', changed)).toStrictEqual([])
  })
})

describe('pinactProblems', () => {
  it('names rule CI-01 first in one line per unpinned action', () => {
    const stdout = JSON.stringify({
      runs: [
        {
          results: [
            {
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: '.github/workflows/ci.yml' },
                    region: { startLine: 6 },
                  },
                },
              ],
              message: {
                text: 'Action should be pinned:       - uses: actions/checkout@v4',
              },
              ruleId: 'unpinned-action',
            },
          ],
        },
      ],
    })

    expect(pinactProblems({ output: stdout, status: 1, stdout })).toStrictEqual(
      [
        'CI-01 pinact: .github/workflows/ci.yml:6 Action should be pinned: - uses: actions/checkout@v4',
      ],
    )
  })

  it('names rule CI-01 for a result with no location', () => {
    const stdout = JSON.stringify({
      runs: [
        {
          results: [
            {
              locations: [],
              message: { text: 'Action should be pinned' },
              ruleId: 'unpinned-action',
            },
          ],
        },
      ],
    })

    expect(pinactProblems({ output: stdout, status: 1, stdout })).toStrictEqual(
      ['CI-01 pinact: Action should be pinned'],
    )
  })
})

describe('actionlintProblems', () => {
  it('names rule CI-09 first in one line per finding', () => {
    const stdout = JSON.stringify([
      {
        filepath: '.github/workflows/ci.yml',
        kind: 'expression',
        line: 7,
        message: '"github.event.issue.title" is potentially untrusted',
      },
    ])

    expect(
      actionlintProblems({ output: stdout, status: 1, stdout }),
    ).toStrictEqual([
      'CI-09 actionlint: .github/workflows/ci.yml:7 expression "github.event.issue.title" is potentially untrusted',
    ])
  })
})

describe('zizmorProblems', () => {
  const finding = (ident: string, desc: string) => ({
    desc,
    ident,
    locations: [
      {
        concrete: { location: { start_point: { row: 5 } } },
        symbolic: {
          key: { Local: { verbatim_path: '.github/workflows/ci.yml' } },
          kind: 'Hidden',
        },
      },
      {
        concrete: { location: { start_point: { row: 6 } } },
        symbolic: {
          key: { Local: { verbatim_path: '.github/workflows/ci.yml' } },
          kind: 'Primary',
        },
      },
    ],
  })

  it('names the rule of the audit and rule CI-08 first', () => {
    const stdout = JSON.stringify([
      finding('template-injection', 'code injection via template expansion'),
      finding('unpinned-uses', 'unpinned action reference'),
    ])

    expect(
      zizmorProblems({ output: stdout, status: 14, stdout }),
    ).toStrictEqual([
      'CI-04 CI-08 zizmor: .github/workflows/ci.yml:7 template-injection code injection via template expansion',
      'CI-01 CI-08 zizmor: .github/workflows/ci.yml:7 unpinned-uses unpinned action reference',
    ])
  })

  it('names rule CI-08 for an audit that no other rule names', () => {
    const stdout = JSON.stringify([
      finding('artipacked', 'credential persistence through artifacts'),
    ])

    expect(
      zizmorProblems({ output: stdout, status: 13, stdout }),
    ).toStrictEqual([
      'CI-08 zizmor: .github/workflows/ci.yml:7 artipacked credential persistence through artifacts',
    ])
  })

  it('names the rule of a finding with no location', () => {
    const stdout = JSON.stringify([
      {
        desc: 'unpinned action reference',
        ident: 'unpinned-uses',
        locations: [],
      },
    ])

    expect(
      zizmorProblems({ output: stdout, status: 14, stdout }),
    ).toStrictEqual([
      'CI-01 CI-08 zizmor: unpinned-uses unpinned action reference',
    ])
  })
})
