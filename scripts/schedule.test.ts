import { scheduleProblems } from './schedule.ts'
import { describe, expect, it } from 'vitest'

const MONDAY = { weekly_day: 'monday', weekly_time_utc: '06:00' }
const workflowOf = (cron: string): string =>
  [
    'on:',
    '  pull_request:',
    '  schedule:',
    `    - cron: '${cron}'`,
    '',
    'permissions: {}',
  ].join('\n')

describe('scheduleProblems', () => {
  it.each([
    ['security', '0 6 * * 1'],
    ['accessibility', '0 6 * * 1'],
    ['bundle', '0 6 * * 1'],
    ['resilience', '0 6 * * 1'],
    ['exposure', '0 6 * * 1'],
    ['timing', '0 6 * * 1'],
  ])(
    'accepts the monday 06:00 policy with the %s cron of origin/main',
    (_, cron) => {
      expect(
        scheduleProblems(MONDAY, workflowOf(cron), 'SOT-01'),
      ).toStrictEqual([])
    },
  )

  it.each([
    ['no quotes', 'on:\n  schedule:\n    - cron: 0 6 * * 1\n'],
    ['a comment', "on:\n  schedule:\n    - cron: '0 6 * * 1' # weekly\n"],
    [
      'a cron list in a step',
      [
        'on:',
        '  schedule:',
        "    - cron: '0 6 * * 1'",
        'jobs:',
        '  run:',
        '    steps:',
        '      - with:',
        '          crons:',
        "            - cron: '0 7 * * 1'",
      ].join('\n'),
    ],
  ])('reads the cron of a workflow with %s', (_, text) => {
    expect(scheduleProblems(MONDAY, text, 'SOT-01')).toStrictEqual([])
  })

  it('refuses an empty workflow', () => {
    expect(scheduleProblems(MONDAY, '', 'TSOT-01')).toStrictEqual([
      'the workflow has 0 cron lines, and it must have 1. Rule TSOT-01.',
    ])
  })

  it.each([
    [{ weekly_day: 'sunday', weekly_time_utc: '00:00' }, '0 0 * * 0'],
    [{ weekly_day: 'saturday', weekly_time_utc: '23:59' }, '59 23 * * 6'],
    [{ weekly_day: 'friday', weekly_time_utc: '13:30' }, '30 13 * * 5'],
  ])('reads %j as the cron %s', (schedule, cron) => {
    expect(
      scheduleProblems(schedule, workflowOf(cron), 'SOT-01'),
    ).toStrictEqual([])
  })

  it('refuses a cron on tuesday when the policy says monday', () => {
    expect(
      scheduleProblems(MONDAY, workflowOf('0 6 * * 2'), 'BSOT-01'),
    ).toStrictEqual([
      "the workflow cron is '0 6 * * 2', and the policy schedule wants '0 6 * * 1'. Rule BSOT-01.",
    ])
  })

  it('refuses a cron one minute after the policy time', () => {
    expect(
      scheduleProblems(MONDAY, workflowOf('1 6 * * 1'), 'SOT-01'),
    ).toStrictEqual([
      "the workflow cron is '1 6 * * 1', and the policy schedule wants '0 6 * * 1'. Rule SOT-01.",
    ])
  })

  it('refuses a policy with no schedule keys', () => {
    expect(
      scheduleProblems(undefined, workflowOf('0 6 * * 1'), 'RSOT-01'),
    ).toStrictEqual([
      'the policy has no schedule.weekly_day and schedule.weekly_time_utc. Rule RSOT-01.',
    ])
  })

  it.each([
    [{ weekly_day: 'Monday', weekly_time_utc: '06:00' }],
    [{ weekly_day: 'mon', weekly_time_utc: '06:00' }],
  ])('refuses the day of %j', (schedule) => {
    expect(
      scheduleProblems(schedule, workflowOf('0 6 * * 1'), 'SOT-01'),
    ).toStrictEqual([
      `schedule.weekly_day is ${schedule.weekly_day}, and it must be a day name in lower case. Rule SOT-01.`,
    ])
  })

  it.each([['6:00'], ['24:00'], ['06:60'], ['0600']])(
    'refuses the time %s',
    (time) => {
      expect(
        scheduleProblems(
          { weekly_day: 'monday', weekly_time_utc: time },
          workflowOf('0 6 * * 1'),
          'SOT-01',
        ),
      ).toStrictEqual([
        `schedule.weekly_time_utc is ${time}, and it must be HH:MM in UTC. Rule SOT-01.`,
      ])
    },
  )

  it('refuses a workflow with no cron line', () => {
    expect(
      scheduleProblems(MONDAY, 'on:\n  pull_request:\n', 'TSOT-01'),
    ).toStrictEqual([
      'the workflow has 0 cron lines, and it must have 1. Rule TSOT-01.',
    ])
  })

  it('refuses a workflow with two cron lines', () => {
    const text =
      "on:\n  schedule:\n    - cron: '0 6 * * 1'\n    - cron: '0 7 * * 1'\n"

    expect(scheduleProblems(MONDAY, text, 'ASOT-01')).toStrictEqual([
      'the workflow has 2 cron lines, and it must have 1. Rule ASOT-01.',
    ])
  })
})
