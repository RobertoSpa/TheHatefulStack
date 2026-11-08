import {
  gateProblems,
  type Line,
  plainLine,
  workflowProblems,
} from './gateChecks.ts'
import { describe, expect, it } from 'vitest'

const problem: Line = (symptom, action, rule) =>
  `${symptom}. Do: ${action}. Rule ${rule}.`

const BUNDLE_RULES = { continueOnError: 'FAIL-02', step: 'BSOT-02' }
const TIMING_RULES = { continueOnError: 'TSOT-02', step: 'TSOT-02' }
const EXPOSURE_RULES = { continueOnError: 'ESOT-02', step: 'ESOT-02' }

describe('gateProblems', () => {
  it('gives no problem for the gates of the pipeline', () => {
    expect(
      gateProblems(
        ['policy', 'size'],
        ['policy', 'size'],
        () => 'BSOT-02',
        plainLine,
      ),
    ).toStrictEqual([])
  })

  it('names a missing gate first, then a name that is not a gate', () => {
    expect(
      gateProblems(
        ['write', 'policy'],
        ['policy', 'size'],
        () => 'BSOT-02',
        plainLine,
      ),
    ).toStrictEqual([
      'gates has no size. Rule BSOT-02.',
      'gates holds write, which is not a gate. Rule BSOT-02.',
    ])
  })

  it('names the rule that the rule of the name gives', () => {
    expect(
      gateProblems(
        ['policy', 'live'],
        ['policy'],
        (name) => (name === 'live' ? 'PROBE-03' : 'ESOT-02'),
        problem,
      ),
    ).toStrictEqual([
      'gates holds live, which is not a gate. Do: Remove live from gates. Rule PROBE-03.',
    ])
  })

  it('gives the action to the line of the pipeline', () => {
    expect(
      gateProblems(['policy'], ['policy', 'probe'], () => 'ESOT-02', problem),
    ).toStrictEqual([
      'gates has no probe. Do: Add probe to gates. Rule ESOT-02.',
    ])
  })
})

describe('workflowProblems', () => {
  it('gives no problem for one exact step', () => {
    expect(
      workflowProblems(
        'steps:\n  - run: pnpm install\n  - run: pnpm timing\n',
        'timing',
        TIMING_RULES,
        plainLine,
      ),
    ).toStrictEqual([])
  })

  it.each([
    [
      'steps:\n  - run: pnpm install',
      'the timing workflow has 0 timing steps, and it must have 1. Rule TSOT-02.',
    ],
    [
      'steps:\n  - run: pnpm timing\n  - run: pnpm timing',
      'the timing workflow has 2 timing steps, and it must have 1. Rule TSOT-02.',
    ],
    [
      'steps:\n  - run: pnpm timing:policy',
      'the timing step of the workflow is not exactly `pnpm timing`. Rule TSOT-02.',
    ],
    [
      'steps:\n  - run: pnpm timing\n    continue-on-error: true',
      'the timing workflow holds continue-on-error. Rule TSOT-02.',
    ],
  ])('names the defect of %j', (text, line) => {
    expect(
      workflowProblems(text, 'timing', TIMING_RULES, plainLine),
    ).toStrictEqual([line])
  })

  it('names the continue-on-error rule apart from the step rule', () => {
    expect(
      workflowProblems(
        '      - run: pnpm bundle\n        continue-on-error: true\n      - run: pnpm bundle:size\n',
        'bundle',
        BUNDLE_RULES,
        plainLine,
      ),
    ).toStrictEqual([
      'the bundle workflow has 2 bundle steps, and it must have 1. Rule BSOT-02.',
      'the bundle workflow holds continue-on-error. Rule FAIL-02.',
    ])
  })

  it.each([
    [
      'steps:\n  - run: pnpm install',
      'the exposure workflow has 0 exposure steps, and it must have 1. Do: Keep one step, run: pnpm exposure. Rule ESOT-02.',
    ],
    [
      'steps:\n  - run: pnpm exposure:policy',
      'the exposure step of the workflow is not exactly `pnpm exposure`. Do: Set the step to run: pnpm exposure. Rule ESOT-02.',
    ],
    [
      'steps:\n  - run: pnpm exposure\n    continue-on-error: true',
      'the exposure workflow holds continue-on-error. Do: Remove continue-on-error from the workflow. Rule ESOT-02.',
    ],
  ])('gives the action of %j to the line of the pipeline', (text, line) => {
    expect(
      workflowProblems(text, 'exposure', EXPOSURE_RULES, problem),
    ).toStrictEqual([line])
  })

  it('counts each step whose command starts with the pipeline name', () => {
    expect(
      workflowProblems(
        '  - run: pnpm bundle\n  - run: pnpm bundles\n',
        'bundle',
        BUNDLE_RULES,
        plainLine,
      ),
    ).toStrictEqual([
      'the bundle workflow has 2 bundle steps, and it must have 1. Rule BSOT-02.',
    ])
  })
})
