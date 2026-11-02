import { type Execution } from '../io.ts'
import { type RuleIds, ruleLine, toolProblems } from './toolChecks.ts'
import assert from 'node:assert'

type EslintFile = { filePath: string; messages: EslintMessage[] }

type EslintMessage = {
  column: number
  line: number
  message: string
  ruleId: null | string
  severity: number
}

const WARNING_SEVERITY = 1
const WARNING_RULE = 'CODE-08'
const DEFAULT_RULES: RuleIds = [WARNING_RULE]
const ESLINT_RULES = new Map<string, RuleIds>([
  ['@typescript-eslint/ban-ts-comment', ['CODE-05']],
  ['@typescript-eslint/no-explicit-any', ['CODE-05']],
  ['@typescript-eslint/no-non-null-assertion', ['CODE-05']],
  ['@typescript-eslint/switch-exhaustiveness-check', ['CODE-06']],
])
const ESLINT_PLUGIN_RULES = new Map<string, RuleIds>([
  ['no-unsanitized', ['CODE-02']],
  ['security', ['CODE-02']],
])

const rulesOf = (message: EslintMessage): RuleIds => {
  assert(Number.isInteger(message.severity))
  assert(message.severity > 0)

  const ruleId = message.ruleId ?? ''
  const plugin = ruleId.includes('/') ? (ruleId.split('/')[0] ?? '') : ''
  const rules =
    ESLINT_RULES.get(ruleId) ?? ESLINT_PLUGIN_RULES.get(plugin) ?? DEFAULT_RULES

  if (message.severity === WARNING_SEVERITY && !rules.includes(WARNING_RULE)) {
    return [...rules, WARNING_RULE]
  }

  return rules
}

const eslintFileLines = (file: EslintFile): string[] => {
  assert(file.filePath.length > 0)
  assert(Array.isArray(file.messages))

  return file.messages.map((message) =>
    ruleLine(
      rulesOf(message),
      'eslint',
      `${file.filePath}:${message.line}:${message.column} ${message.ruleId ?? ''} ${message.message}`,
    ),
  )
}

export const eslintProblems = (execution: Execution): string[] =>
  toolProblems<EslintFile[]>('eslint', execution, (files) =>
    files.flatMap(eslintFileLines),
  )
