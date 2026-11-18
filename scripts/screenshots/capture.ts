// Takes the README screenshots and the restore-flow GIF from the built UI with demo data.
//
//   bun run screenshots              # builds the static app first (nuxt generate)
//   bun run screenshots --skip-build # reuses .output/public
//
// Runs the app in headless Chromium (Playwright) at http://app.local/, served from .output/public
// through request interception, so it needs no port. Tauri is faked (tauri-mock.ts) on top of a
// demo SQLite database (demo-data.ts). Output: docs/screenshots/. Needs ffmpeg on PATH for the GIF.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { buildDemoDb, GAMES } from './demo-data.ts'
import { createHandler, pageInit } from './tauri-mock.ts'

const root = resolve(import.meta.dirname, '../..')
const dist = join(root, '.output/public')
const out = join(root, 'docs/screenshots')
const work = mkdtempSync(join(tmpdir(), 'wd-shots-'))
const ORIGIN = 'http://app.local'
// Nuxt Icon loads icon sets from the Iconify API at runtime (as the real app does); everything
// else outside the app is blocked so the demo stays offline.
const ICON_HOSTS = ['api.iconify.design', 'api.simplesvg.com', 'api.unisvg.com']
const STARFALL = GAMES[0]!.appId

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf'
}

const unknownCommands = new Set<string>()
const problems: string[] = []

if (!process.argv.includes('--skip-build') || !existsSync(dist)) {
  console.log('Building the static app (nuxt generate)…')
  execFileSync('bun', ['run', 'generate'], { cwd: root, stdio: 'inherit' })
}
mkdirSync(out, { recursive: true })

/** A fresh browser context on its own demo database. */
async function open(browser: Browser, name: string, options: { video?: boolean, scale?: number } = {}) {
  const dbPath = join(work, `${name}.db`)
  buildDemoDb(dbPath, join(root, 'drizzle'))
  const handle = createHandler(dbPath, unknownCommands)
  const size = { width: 1440, height: 900 }
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: options.scale ?? 2,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    ...(options.video ? { recordVideo: { dir: join(work, name), size } } : {})
  })
  await context.exposeFunction('__demoInvoke', (cmd: string, args: Record<string, unknown>) => {
    try {
      return handle(cmd, args)
    } catch (e) {
      problems.push(`${cmd}: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  })
  await context.addInitScript(pageInit)
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (ICON_HOSTS.includes(url.hostname)) return route.continue()
    if (url.origin !== ORIGIN) {
      problems.push(`blocked ${url.href.slice(0, 120)}`)
      return route.abort()
    }
    // No Nuxt server in a static build: let the icon client fall back to the Iconify API.
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: '' })
    let file = join(dist, decodeURIComponent(url.pathname))
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
    await route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' })
  })
  const page = await context.newPage()
  page.on('pageerror', e => problems.push(`[${name}] page error: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) problems.push(`[${name}] console: ${m.text()}`)
  })
  return { context, page, openedAt: Date.now() }
}

/** Client-side navigation through a sidebar/page link, keeping in-memory state (live jobs). */
async function go(page: Page, path: string) {
  await page.locator(`a[href="${path}"]`).first().click()
  await page.waitForURL(`${ORIGIN}${path}`)
}

const settle = (page: Page, ms = 600) => page.waitForTimeout(ms)
const shot = async (page: Page, name: string) => {
  await page.mouse.move(1, 1)
  await settle(page)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`  ${name}.png`)
}
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** History view, today picked, slider moved to before this morning's update run. */
async function openHistoryBeforeUpdates(page: Page, stepDelay = 0) {
  await page.getByRole('button', { name: 'History' }).click()
  await page.locator(`[data-day="${todayKey()}"]`).click()
  const slider = page.getByRole('slider')
  await slider.focus()
  await page.keyboard.press('End')
  // From the end (an hour after the last change) back past all five updates.
  // Calendar and timeline both in view (the game header scrolls away).
  await page.getByRole('button', { name: 'Restore to this point' }).scrollIntoViewIfNeeded()
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press('ArrowLeft')
    if (stepDelay) await page.waitForTimeout(stepDelay)
  }
}

async function screenshots(browser: Browser) {
  const { context, page } = await open(browser, 'shots')
  await page.goto(`${ORIGIN}/apps/${STARFALL}`)
  await page.locator('table tbody tr').first().waitFor()
  await shot(page, 'game')

  await openHistoryBeforeUpdates(page)
  await shot(page, 'history')

  await page.getByRole('button', { name: 'Restore to this point' }).click()
  await page.getByRole('dialog').waitFor()
  await shot(page, 'restore')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Back to items' }).click()
  const item = page.locator('table a', { hasText: 'Orbital Trade Hub' })
  await item.click()
  await page.getByText('Snapshots').first().waitFor()
  await shot(page, 'item')

  // Downloads: start a few jobs across games, then look while they run.
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__demoItemMs = 25_000 })
  await go(page, `/apps/${STARFALL}`)
  await page.getByRole('button', { name: 'Update outdated' }).click()
  await go(page, `/apps/${GAMES[1]!.appId}`)
  await page.getByRole('button', { name: 'Update outdated' }).click()
  await go(page, `/apps/${GAMES[2]!.appId}`)
  await page.locator('table thead [role="checkbox"]').click()
  await page.getByRole('button', { name: /^Download/ }).first().click()
  await go(page, '/')
  await settle(page, 7000)
  await shot(page, 'downloads')

  await context.close()
}

async function restoreVideo(browser: Browser) {
  const { context, page, openedAt } = await open(browser, 'video', { video: true, scale: 1 })
  await page.goto(`${ORIGIN}/apps/${STARFALL}`)
  await page.locator('table tbody tr').first().waitFor()
  // The recording starts with the context; cut the blank page and app start from the GIF.
  const skip = Math.max(0, (Date.now() - openedAt) / 1000 + 0.3)
  await settle(page, 1500)
  await openHistoryBeforeUpdates(page, 25)
  await settle(page, 1200)
  await page.getByRole('button', { name: 'Restore to this point' }).click()
  await settle(page, 2500)
  await page.getByRole('button', { name: /^Restore \d+ item/ }).click()
  await settle(page, 1800)
  await page.getByRole('button', { name: 'Back to items' }).click()
  await settle(page, 2500)
  const video = page.video()
  await context.close()
  const webm = await video!.path()

  const gif = join(out, 'restore.gif')
  const ffmpeg = spawnSync('ffmpeg', ['-y', '-ss', skip.toFixed(2), '-i', webm, '-vf',
    'fps=12,scale=1080:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif], { stdio: 'ignore' })
  if (ffmpeg.status === 0) {
    console.log('  restore.gif')
  } else {
    renameSync(webm, join(out, 'restore.webm'))
    problems.push('ffmpeg failed or is missing; kept restore.webm instead of a GIF')
  }
}

const browser = await chromium.launch()
try {
  console.log('Screenshots:')
  await screenshots(browser)
  console.log('Video:')
  await restoreVideo(browser)
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}

if (unknownCommands.size) console.log(`Commands with no demo answer (returned null): ${[...unknownCommands].join(', ')}`)
for (const p of problems) console.log(`! ${p}`)
console.log(`Wrote ${readdirSync(out).join(', ')} to docs/screenshots/`)
