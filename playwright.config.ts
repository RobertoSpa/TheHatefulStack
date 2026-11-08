import { defineConfig } from '@playwright/test'

export default defineConfig({
  testIgnore: '**/visual.e2e.ts',
  testMatch: '**/*.e2e.{ts,js}',
  webServer: { command: 'pnpm build:dist && pnpm preview', port: 4_173 },
})
