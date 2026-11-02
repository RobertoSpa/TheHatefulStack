import { expect, test } from '@playwright/test'
import assert from 'node:assert'

const DESCRIPTION = 'A React template with test, security and speed gates.'

test('the head links one icon that the server sends as SVG', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const icons = page.locator('head link[rel="icon"]')

  await expect(icons).toHaveCount(1)
  const href = await icons.getAttribute('href')

  assert(href !== null, 'the icon link has no href')
  const answer = await request.get(href)

  expect(answer.status()).toBe(200)
  expect(answer.headers()['content-type']).toContain('image/svg+xml')
})

test('the head holds one meta description', async ({ page }) => {
  await page.goto('/')
  const descriptions = page.locator('head meta[name="description"]')

  await expect(descriptions).toHaveCount(1)
  await expect(descriptions).toHaveAttribute('content', DESCRIPTION)
})
