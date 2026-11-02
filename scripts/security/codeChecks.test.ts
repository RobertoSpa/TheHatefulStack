import { eslintProblems } from './codeChecks.ts'
import { describe, expect, it } from 'vitest'

const ERROR = 2
const WARNING = 1

describe('eslintProblems', () => {
  it('accepts a run with no finding', () => {
    expect(
      eslintProblems({ output: '[]', status: 0, stdout: '[]' }),
    ).toStrictEqual([])
  })

  it('names the rule of the eslint rule first in one line per message', () => {
    const stdout = JSON.stringify([
      {
        filePath: 'src/app/main.tsx',
        messages: [
          {
            column: 9,
            line: 4,
            message: 'Unexpected any. Specify a different type.',
            ruleId: '@typescript-eslint/no-explicit-any',
            severity: ERROR,
          },
          {
            column: 3,
            line: 8,
            message: 'Unsafe assignment to innerHTML',
            ruleId: 'no-unsanitized/property',
            severity: ERROR,
          },
        ],
      },
    ])

    expect(eslintProblems({ output: stdout, status: 1, stdout })).toStrictEqual(
      [
        'CODE-05 eslint: src/app/main.tsx:4:9 @typescript-eslint/no-explicit-any Unexpected any. Specify a different type.',
        'CODE-02 eslint: src/app/main.tsx:8:3 no-unsanitized/property Unsafe assignment to innerHTML',
      ],
    )
  })

  it('names rule CODE-08 for a warning and for a rule that no other rule names', () => {
    const stdout = JSON.stringify([
      {
        filePath: 'src/app/main.tsx',
        messages: [
          {
            column: 1,
            line: 2,
            message: 'Unexpected console statement.',
            ruleId: 'no-console',
            severity: ERROR,
          },
          {
            column: 1,
            line: 3,
            message: 'Unused eslint-disable directive.',
            ruleId: null,
            severity: WARNING,
          },
          {
            column: 5,
            line: 6,
            message: 'Unsafe Regular Expression',
            ruleId: 'security/detect-unsafe-regex',
            severity: WARNING,
          },
        ],
      },
    ])

    expect(eslintProblems({ output: stdout, status: 1, stdout })).toStrictEqual(
      [
        'CODE-08 eslint: src/app/main.tsx:2:1 no-console Unexpected console statement.',
        'CODE-08 eslint: src/app/main.tsx:3:1 Unused eslint-disable directive.',
        'CODE-02 CODE-08 eslint: src/app/main.tsx:6:5 security/detect-unsafe-regex Unsafe Regular Expression',
      ],
    )
  })
})
