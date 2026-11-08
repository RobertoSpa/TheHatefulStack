import { changesOf, templateCommitAt } from './history.ts'
import { describe, expect, it } from 'vitest'

const SQUASH = {
  date: '2026-11-07T18:00:00-03:00',
  sha: '07799cadbfb4aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  subject: 'feat(security): test the pull request rules (#150)',
}
const MERGE = {
  date: '2026-10-01T12:00:00Z',
  sha: '7a57f6d254a1bbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  subject: 'Merge pull request #12 from RobertoSpa/security-pipeline',
}
const DIRECT = {
  date: '2026-09-04T14:08:50-03:00',
  sha: '7225d2a4bc03cccccccccccccccccccccccccccc',
  subject: 'Add FSD React template',
}
const HISTORY = [SQUASH, MERGE, DIRECT]

describe('changesOf', () => {
  it('lists one line for each merged pull request, newest first', () => {
    expect(changesOf(HISTORY)).toStrictEqual([
      '07799cadbfb4 feat(security): test the pull request rules (#150)',
      '7a57f6d254a1 Merge pull request #12 from RobertoSpa/security-pipeline',
    ])
  })

  it('lists no line for a pull request number in the middle of a subject', () => {
    expect(
      changesOf([{ ...SQUASH, subject: 'fix (#150) the gate' }]),
    ).toStrictEqual([])
  })
})

describe('templateCommitAt', () => {
  it('names the newest template commit at the moment the project was made', () => {
    expect(templateCommitAt(HISTORY, '2026-10-02T09:00:00Z')).toBe(MERGE.sha)
  })

  it('names a commit made in the same second as the project', () => {
    expect(templateCommitAt(HISTORY, '2026-10-01T09:00:00-03:00')).toBe(
      MERGE.sha,
    )
  })

  it('names the commit before when the project is one second older', () => {
    expect(templateCommitAt(HISTORY, '2026-10-01T08:59:59-03:00')).toBe(
      DIRECT.sha,
    )
  })

  it('names no commit when the project is older than the template', () => {
    expect(templateCommitAt(HISTORY, '2026-09-01T00:00:00Z')).toBeUndefined()
  })
})
