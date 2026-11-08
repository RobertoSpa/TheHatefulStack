import { type Policy } from '../scripts/bundle/shared.ts'
import { POLICY_PATHS, readPolicy } from '../scripts/policies.ts'
import { expect, test } from '@playwright/test'
import assert from 'node:assert'

const ROUTES_MAX = 100
const LITERAL_SEGMENT = /^[\w-]+$/u

const policy = readPolicy<Policy>(POLICY_PATHS.bundle)

assert(policy.routes.length > 0)
assert(policy.routes.length <= ROUTES_MAX)

// One folder for each path segment, so /a/b and /a-b keep apart.
const baselineNameOf = (path: string): string[] => {
  assert(path.startsWith('/'))

  const segments = path.split('/').filter((segment) => segment.length > 0)

  assert(
    segments.every((segment) => LITERAL_SEGMENT.test(segment)),
    `${path} is not a literal route path`,
  )
  const name =
    segments.length === 0
      ? ['index.png']
      : [...segments.slice(0, -1), `${segments.at(-1)}.png`]

  assert(name.length >= 1)
  assert(name.length === Math.max(segments.length, 1))

  return name
}

for (const route of policy.routes) {
  test(`the route ${route.path} renders as its baseline`, async ({ page }) => {
    await page.goto(route.path)

    await expect(page).toHaveScreenshot(baselineNameOf(route.path), {
      animations: 'disabled',
      fullPage: true,
    })
  })
}
