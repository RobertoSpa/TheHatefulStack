import assert from 'node:assert'

export type Line = (symptom: string, action: string, rule: string) => string

export type WorkflowRules = { continueOnError: string; step: string }

const PIPELINE = /^[a-z]+$/u

export const plainLine: Line = (symptom, action, rule) => {
  assert(symptom.length > 0)
  assert(action.length > 0)
  assert(rule.length > 0)

  return `${symptom}. Rule ${rule}.`
}

export const gateProblems = (
  gates: string[],
  names: string[],
  ruleOf: (name: string) => string,
  line: Line,
): string[] => {
  assert(names.length > 0)
  assert(Array.isArray(gates))

  const problems = [
    ...names
      .filter((name) => !gates.includes(name))
      .map((name) =>
        line(`gates has no ${name}`, `Add ${name} to gates`, ruleOf(name)),
      ),
    ...gates
      .filter((name) => !names.includes(name))
      .map((name) =>
        line(
          `gates holds ${name}, which is not a gate`,
          `Remove ${name} from gates`,
          ruleOf(name),
        ),
      ),
  ]

  assert(problems.length <= names.length + gates.length)

  return problems
}

export const workflowProblems = (
  text: string,
  pipeline: string,
  rules: WorkflowRules,
  line: Line,
): string[] => {
  assert(text.length > 0)
  assert(PIPELINE.test(pipeline))

  const steps = [
    ...text.matchAll(new RegExp(`run:\\s*pnpm ${pipeline}\\S*`, 'gu')),
  ].length
  const exact = new RegExp(`run:\\s*pnpm ${pipeline}\\s*$`, 'mu')
  const problems: string[] = []

  if (steps !== 1) {
    problems.push(
      line(
        `the ${pipeline} workflow has ${steps} ${pipeline} steps, and it must have 1`,
        `Keep one step, run: pnpm ${pipeline}`,
        rules.step,
      ),
    )
  } else if (!exact.test(text)) {
    problems.push(
      line(
        `the ${pipeline} step of the workflow is not exactly \`pnpm ${pipeline}\``,
        `Set the step to run: pnpm ${pipeline}`,
        rules.step,
      ),
    )
  }

  if (text.includes('continue-on-error')) {
    problems.push(
      line(
        `the ${pipeline} workflow holds continue-on-error`,
        'Remove continue-on-error from the workflow',
        rules.continueOnError,
      ),
    )
  }

  assert(problems.length <= 2)

  return problems
}
