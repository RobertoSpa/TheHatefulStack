import { gitleaksProblems, secretFileProblems } from './secretsChecks.ts'
import { describe, expect, it } from 'vitest'

const patterns = ['.env', '.env.local', '.env.*.local', '*.pem', 'id_rsa*']

describe('secretFileProblems', () => {
  it('accepts tracked files that match no pattern', () => {
    const tracked = [
      'src/app/main.tsx',
      '.env.example',
      'docs/pem.md',
      'environment.ts',
    ]

    expect(secretFileProblems(patterns, tracked)).toStrictEqual([])
  })

  it.each([
    ['.env', '.env matches the secret pattern .env. Rule SEC-03.'],
    [
      'config/.env.local',
      'config/.env.local matches the secret pattern .env.local. Rule SEC-03.',
    ],
    [
      '.env.staging.local',
      '.env.staging.local matches the secret pattern .env.*.local. Rule SEC-03.',
    ],
    [
      'certs/server.pem',
      'certs/server.pem matches the secret pattern *.pem. Rule SEC-03.',
    ],
    [
      'keys/id_rsa.pub',
      'keys/id_rsa.pub matches the secret pattern id_rsa*. Rule SEC-03.',
    ],
  ])('refuses the tracked file %s', (path, problem) => {
    expect(secretFileProblems(patterns, [path])).toStrictEqual([problem])
  })
})

describe('gitleaksProblems', () => {
  it('accepts a run with no finding', () => {
    expect(
      gitleaksProblems({ output: '[]\n', status: 0, stdout: '[]\n' }),
    ).toStrictEqual([])
  })

  it('names rule SEC-01 first in one line per secret', () => {
    const stdout = JSON.stringify([
      {
        Commit: '0123456789abcdef0123456789abcdef01234567',
        File: 'src/config.ts',
        RuleID: 'aws-access-token',
        StartLine: 2,
      },
      {
        Commit: 'fedcba9876543210fedcba9876543210fedcba98',
        File: '.env.example',
        RuleID: 'slack-bot-token',
        StartLine: 4,
      },
    ])

    expect(
      gitleaksProblems({ output: stdout, status: 1, stdout }),
    ).toStrictEqual([
      'SEC-01 gitleaks: src/config.ts:2 aws-access-token in commit 0123456789ab',
      'SEC-01 gitleaks: .env.example:4 slack-bot-token in commit fedcba987654',
    ])
  })

  it('prints the tail of the output when the report does not parse', () => {
    const output = '[{"File": "src/config.ts", "StartLi'

    expect(
      gitleaksProblems({ output, status: 1, stdout: output }),
    ).toStrictEqual(['gitleaks failed', output])
  })

  it('prints the tail of the output when the tool fails with no finding', () => {
    const output = 'gitleaks: exec: "gitleaks": executable file not found'

    expect(gitleaksProblems({ output, status: 127, stdout: '' })).toStrictEqual(
      ['gitleaks failed', output],
    )
  })
})
