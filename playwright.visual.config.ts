import manifest from './package.json' with { type: 'json' }
import { defineConfig } from '@playwright/test'
import assert from 'node:assert'

const APP_PORT = 4_173
const BROWSER_PORT = 4_180
const SHUTDOWN_MS_MAX = 10_000

const playwrightVersion = manifest.devDependencies['@playwright/test']

assert(/^\d+\.\d+\.\d+$/u.test(playwrightVersion))
assert(import.meta.dirname.length > 0)

// Each baseline comes from the browser and the fonts of this one image, on any host with Docker.
const browserServer = [
  `docker run --rm --init --publish 127.0.0.1:${BROWSER_PORT}:${BROWSER_PORT}`,
  `--volume "${import.meta.dirname}:/work:ro" --workdir /work`,
  `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`,
  `node node_modules/@playwright/test/cli.js run-server --host 0.0.0.0 --port ${BROWSER_PORT}`,
].join(' ')

export default defineConfig({
  snapshotPathTemplate:
    '{testFileDir}/__screenshots__/{testFileName}/{arg}{ext}',
  testMatch: '**/visual.e2e.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    connectOptions: {
      exposeNetwork: '<loopback>',
      wsEndpoint: `ws://127.0.0.1:${BROWSER_PORT}/`,
    },
    viewport: { height: 800, width: 1_280 },
  },
  webServer: [
    { command: 'pnpm build:dist && pnpm preview', port: APP_PORT },
    {
      command: browserServer,
      gracefulShutdown: { signal: 'SIGTERM', timeout: SHUTDOWN_MS_MAX },
      port: BROWSER_PORT,
    },
  ],
})
