import { execute } from './io.ts'
import { changesOf, type Commit, templateCommitAt } from './template/history.ts'
import assert from 'node:assert'
import { readFileSync, writeFileSync } from 'node:fs'

const TEMPLATE_URL = 'https://github.com/RobertoSpa/TheHatefulStack.git'
const TEMPLATE_ROOT = '7225d2a4bc035e306183cdf2c1e949062a2fd36f'
const MANIFEST = 'package.json'
const FIELD = 'templateCommit'
const FIELD_SEPARATOR = '\u001F'
const TEMPLATE_REF = 'refs/template/main'
const COMMITS_MAX = 100_000
const USAGE = 'usage: node scripts/template.ts stamp|changes'

type Manifest = Record<string, boolean | null | number | object | string>

const git = (args: string[]): string | undefined => {
  assert(args.length > 0)

  const result = execute('git', args)

  return result.status === 0 ? result.stdout.trim() : undefined
}

const commitsOf = (range: string): Commit[] | undefined => {
  const format = ['%H', '%cI', '%s'].join(FIELD_SEPARATOR)
  const log = git(['log', '--first-parent', `--format=${format}`, range])

  if (log === undefined) {
    return undefined
  }

  const commits = log
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha = '', date = '', subject = ''] = line.split(FIELD_SEPARATOR)

      return { date, sha, subject }
    })

  assert(commits.length <= COMMITS_MAX)

  return commits
}

const fetchTemplate = (): Commit[] | undefined => {
  const fetched = execute('git', [
    '-c',
    'http.lowSpeedLimit=1000',
    '-c',
    'http.lowSpeedTime=30',
    'fetch',
    '--quiet',
    '--no-tags',
    '--no-write-fetch-head',
    TEMPLATE_URL,
    `+main:${TEMPLATE_REF}`,
  ])

  if (fetched.status !== 0) {
    console.warn(`git fetch ${TEMPLATE_URL} failed: ${fetched.output.trim()}`)

    return undefined
  }

  return commitsOf(TEMPLATE_REF)
}

const readManifest = (): Manifest => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest

  assert(typeof manifest === 'object')
  assert(!Array.isArray(manifest))

  return manifest
}

// The field goes after "version", or first when no version exists.
const stampedManifest = (
  manifest: Manifest,
  templateCommit: string,
): string => {
  assert(!(FIELD in manifest))

  const entries = Object.entries(manifest)
  const versionIndex = entries.findIndex(([key]) => key === 'version')

  entries.splice(versionIndex + 1, 0, [FIELD, templateCommit])

  const stamped = JSON.stringify(Object.fromEntries(entries), null, 2) + '\n'

  assert(stamped.includes(`"${FIELD}": "${templateCommit}"`))

  return stamped
}

const createdAtOf = (): string | undefined => {
  if (git(['rev-parse', '--is-shallow-repository']) !== 'false') {
    return undefined
  }

  const roots = git(['rev-list', '--max-parents=0', 'HEAD'])?.split('\n')

  if (roots === undefined) {
    console.warn(`${FIELD}: no git history, so no stamp.`)

    return undefined
  }

  if (roots.includes(TEMPLATE_ROOT)) {
    return undefined
  }

  // The author date survives an amend or a rebase of the first commit.
  return git(['log', '-1', '--format=%aI', ...roots.slice(-1)])
}

// The prepare script runs this, so a failure warns and never stops the install.
const stamp = (): number => {
  const manifest = readManifest()

  if (FIELD in manifest) {
    return 0
  }

  const createdAt = createdAtOf()

  if (createdAt === undefined) {
    return 0
  }

  const history = fetchTemplate()
  const templateCommit =
    history === undefined ? undefined : templateCommitAt(history, createdAt)

  if (templateCommit === undefined) {
    console.warn(`${FIELD}: no template commit found. Run pnpm install again.`)

    return 0
  }

  writeFileSync(MANIFEST, stampedManifest(manifest, templateCommit))
  console.log(`${FIELD}: ${templateCommit}. Commit package.json.`)

  return 0
}

const changes = (): number => {
  const templateCommit = readManifest()[FIELD]
  const range =
    typeof templateCommit === 'string'
      ? `${templateCommit}..${TEMPLATE_REF}`
      : TEMPLATE_REF

  if (fetchTemplate() === undefined) {
    return 1
  }

  const listed = commitsOf(range)

  if (listed === undefined) {
    console.error(`git log ${range} failed.`)

    return 1
  }

  if (typeof templateCommit !== 'string') {
    console.warn(`No ${FIELD} in ${MANIFEST}, so each template change shows.`)
  }

  const lines = changesOf(listed)

  console.log(lines.length > 0 ? lines.join('\n') : 'No template changes.')

  return 0
}

const main = (argv: string[]): number => {
  assert(argv.length < 100)

  process.env.GIT_TERMINAL_PROMPT = '0'

  const command = argv[0]

  if (command === 'stamp') {
    return stamp()
  }

  if (command === 'changes') {
    return changes()
  }

  console.error(USAGE)

  return 1
}

process.exitCode = main(process.argv.slice(2))
