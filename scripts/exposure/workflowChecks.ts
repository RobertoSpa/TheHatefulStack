import { problem } from './shared.ts'
import assert from 'node:assert'

// The live gate reaches the host only when CI lets the runner out. Rule PROBE-03.
export const egressProblems = (
  workflowText: string,
  liveUrl: string,
): string[] => {
  assert(workflowText.length > 0)
  assert(typeof liveUrl === 'string')

  if (liveUrl.length === 0) {
    return []
  }

  const host = new URL(liveUrl).hostname

  assert(host.length > 0)

  return workflowText.includes(`${host}:443`)
    ? []
    : [
        problem(
          `the exposure workflow lets no traffic out to ${host}`,
          `Add ${host}:443 to allowed-endpoints in .github/workflows/exposure.yml`,
          'PROBE-03',
        ),
      ]
}
