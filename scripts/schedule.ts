import { exists, readText } from './io.ts'
import assert from 'node:assert'
import { parse as parseYaml } from 'yaml'

export type Schedule = { weekly_day: string; weekly_time_utc: string }
type Workflow = null | { on?: { schedule?: Array<{ cron?: string }> } }

const DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]
const TIME_UTC = /^([01]\d|2[0-3]):([0-5]\d)$/u
const CRONS_MAX = 100

const workflowCrons = (workflowText: string): string[] => {
  assert(typeof workflowText === 'string')

  const workflow = parseYaml(workflowText) as Workflow
  const crons = (workflow?.on?.schedule ?? []).map((entry) => entry.cron ?? '')

  assert(crons.length <= CRONS_MAX)

  return crons
}

const scheduleCron = (schedule: Schedule) => {
  assert(typeof schedule === 'object')

  const day = DAYS.indexOf(schedule.weekly_day)
  const time = TIME_UTC.exec(schedule.weekly_time_utc)
  const symptoms: string[] = []

  if (day === -1) {
    symptoms.push(
      `schedule.weekly_day is ${schedule.weekly_day}, and it must be a day name in lower case`,
    )
  }

  if (time === null) {
    symptoms.push(
      `schedule.weekly_time_utc is ${schedule.weekly_time_utc}, and it must be HH:MM in UTC`,
    )
  }

  const wanted =
    symptoms.length === 0 && time !== null
      ? `${Number(time[2])} ${Number(time[1])} * * ${day}`
      : undefined

  assert((wanted === undefined) === symptoms.length > 0)

  return { symptoms, wanted }
}

export const scheduleSymptoms = (
  schedule: Schedule | undefined,
  workflowText: string,
): string[] => {
  assert(typeof workflowText === 'string')

  if (schedule === undefined) {
    return [
      'the policy has no schedule.weekly_day and schedule.weekly_time_utc',
    ]
  }

  const { symptoms, wanted } = scheduleCron(schedule)

  if (wanted === undefined) {
    return symptoms
  }

  const crons = workflowCrons(workflowText)

  if (crons.length !== 1) {
    return [`the workflow has ${crons.length} cron lines, and it must have 1`]
  }

  const [cron] = crons

  assert(cron !== undefined)

  return cron === wanted
    ? []
    : [
        `the workflow cron is '${cron}', and the policy schedule wants '${wanted}'`,
      ]
}

export const scheduleProblems = (
  schedule: Schedule | undefined,
  workflowText: string,
  rule: string,
): string[] => {
  assert(typeof workflowText === 'string')
  assert(rule.length > 0)

  return scheduleSymptoms(schedule, workflowText).map(
    (symptom) => `${symptom}. Rule ${rule}.`,
  )
}

export const workflowScheduleProblems = (
  schedule: Schedule | undefined,
  workflowPath: string,
  rule: string,
): string[] => {
  assert(workflowPath.startsWith('.github/workflows/'))
  assert(rule.length > 0)

  if (!exists(workflowPath)) {
    return [`${workflowPath} is missing. Rule ${rule}.`]
  }

  return scheduleProblems(schedule, readText(workflowPath), rule)
}
