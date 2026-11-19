// Takes the README screenshots and the restore-flow GIF from the built UI with demo data.
//
//   bun run screenshots              # builds the static app first (nuxt generate)
//   bun run screenshots --skip-build # reuses .output/public
//   bun run screenshots --review     # also checks UI flows into .shots-logs/review/ (not the README)
//
// Runs the app in headless Chromium (Playwright) at http://app.local/, served from .output/public
// through request interception, so it needs no port. Tauri is faked (tauri-mock.ts) on top of a
// demo SQLite database (demo-data.ts). Output: docs/screenshots/. Needs ffmpeg on PATH for the GIF.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { buildDemoDb, COLLECTION, GAMES, WORKSHOP_NEW } from './demo-data.ts'
import { createHandler, emit, pageInit } from './tauri-mock.ts'
import { workshopPage } from './workshop-pages.ts'

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
  await context.exposeBinding('__demoInvoke', async ({ page }, cmd: string, args: Record<string, unknown>) => {
    try {
      return await handle(page, cmd, args)
    } catch (e) {
      problems.push(`${cmd}: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  })
  await context.addInitScript(pageInit)
  // What Tauri injects into the Workshop webview (it only acts on steamcommunity.com pages).
  await context.addInitScript({ path: join(root, 'src-tauri/src/workshop_inject.js') })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (ICON_HOSTS.includes(url.hostname)) return route.continue()
    // The Workshop browser's pages: demo stand-ins, never Steam itself.
    if (url.hostname === 'steamcommunity.com') {
      if (request.isNavigationRequest()) await emit(request.frame().page(), 'workshop://loading', { url: url.href })
      return route.fulfill({ body: workshopPage(url), contentType: 'text/html' })
    }
    // The injected buttons "navigate" here; the app cancels that and queues the ids (204 keeps the page).
    if (url.hostname === 'wsd.invalid') {
      const ids = url.searchParams.get('ids')
      if (url.pathname === '/add' && ids) await emit(request.frame().page(), 'workshop://add', { ids: ids.split(',') })
      return route.fulfill({ status: 204, body: '' })
    }
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
const shot = async (page: Page, name: string, { keepMouse = false, dir = out } = {}) => {
  if (!keepMouse) await page.mouse.move(1, 1)
  await settle(page)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: join(dir, `${name}.png`) })
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
  await page.getByRole('button', { name: /^Update \d/ }).click()
  await go(page, `/apps/${GAMES[1]!.appId}`)
  await page.getByRole('button', { name: /^Update \d/ }).click()
  await go(page, `/apps/${GAMES[2]!.appId}`)
  await page.locator('table thead [role="checkbox"]').click()
  await page.getByRole('button', { name: /^Download/ }).first().click()
  await go(page, '/')
  await settle(page, 7000)
  await shot(page, 'downloads')

  await context.close()
}

// --- Workshop browser ---------------------------------------------------------------------

const workshop = (page: Page) => page.frameLocator('#demo-workshop')
const tileButton = (page: Page, id: string) => workshop(page).locator(`.tile:has(a[href$="id=${id}"]) .wsd-tile-btn`)

/** Opens Starfall Colony's workshop with the queue panel, once the injected buttons know the library. */
async function openWorkshop(page: Page) {
  await page.goto(`${ORIGIN}/apps/${STARFALL}`)
  await page.locator('table tbody tr').first().waitFor()
  await go(page, `/workshop/${STARFALL}`)
  await workshop(page).locator('.wsd-tile-btn[data-state="current"]').first().waitFor()
  await page.getByRole('button', { name: 'Show queue' }).click()
}

async function addTile(page: Page, id: string, pause = 0) {
  await tileButton(page, id).hover()
  if (pause) await page.waitForTimeout(pause)
  await tileButton(page, id).click()
  await workshop(page).locator(`.tile:has(a[href$="id=${id}"]) .wsd-tile-btn[data-state="queued"]`).waitFor()
}

async function workshopShots(browser: Browser) {
  const { context, page } = await open(browser, 'workshop')
  await openWorkshop(page)
  await addTile(page, WORKSHOP_NEW[0]!.id)
  await addTile(page, WORKSHOP_NEW[2]!.id)
  // Hovering a tile spells out what its "+" does.
  await tileButton(page, WORKSHOP_NEW[1]!.id).hover()
  await shot(page, 'workshop', { keepMouse: true })

  await workshop(page).locator(`.tile a.name[href$="id=${COLLECTION.id}"]`).click()
  await workshop(page).locator('.wsd-row-btn').first().waitFor()
  await workshop(page).locator(`#sharedfile_${WORKSHOP_NEW[4]!.id} .wsd-row-btn`).click()
  await workshop(page).locator(`#sharedfile_${WORKSHOP_NEW[4]!.id} .wsd-row-btn[data-state="queued"]`).waitFor()
  await shot(page, 'workshop-collection')

  // An item with a newer revision on Steam: its button offers the update.
  await page.getByRole('button', { name: 'Back' }).click()
  await workshop(page).locator('.wsd-tile-btn').first().waitFor()
  await workshop(page).locator('.tile a.name[href$="id=3100010006"]').click()
  await workshop(page).locator('.wsd-btn[data-kind="item"]').waitFor()
  await shot(page, 'workshop-item')
  await context.close()
}

async function workshopVideo(browser: Browser) {
  const { context, page, openedAt } = await open(browser, 'workshop-video', { video: true, scale: 1 })
  await openWorkshop(page)
  const skip = Math.max(0, (Date.now() - openedAt) / 1000 + 0.3)
  await settle(page, 1200)
  await addTile(page, WORKSHOP_NEW[0]!.id, 700)
  await settle(page, 600)
  await addTile(page, WORKSHOP_NEW[2]!.id, 700)
  await settle(page, 900)
  await workshop(page).locator(`.tile a.name[href$="id=${COLLECTION.id}"]`).hover()
  await settle(page, 500)
  await workshop(page).locator(`.tile a.name[href$="id=${COLLECTION.id}"]`).click()
  await workshop(page).locator('.wsd-row-btn').first().waitFor()
  await settle(page, 1500)
  const addAll = workshop(page).locator('.wsd-btn[data-kind="collection"]').first()
  await addAll.hover()
  await settle(page, 600)
  await addAll.click()
  await workshop(page).locator('.wsd-btn[data-kind="collection"][data-state="queued"]').first().waitFor()
  await settle(page, 2500)
  await toGif(page, context, skip, 'workshop.gif')
}

/** Closes the recording context and turns its video into a GIF in docs/screenshots. */
async function toGif(page: Page, context: Awaited<ReturnType<Browser['newContext']>>, skip: number, name: string) {
  const video = page.video()
  await context.close()
  const webm = await video!.path()
  const gif = join(out, name)
  const ffmpeg = spawnSync('ffmpeg', ['-y', '-ss', skip.toFixed(2), '-i', webm, '-vf',
    'fps=12,scale=1080:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif], { stdio: 'ignore' })
  if (ffmpeg.status === 0) {
    console.log(`  ${name}`)
  } else {
    renameSync(webm, join(out, name.replace(/\.gif$/, '.webm')))
    problems.push(`ffmpeg failed or is missing; kept a .webm instead of ${name}`)
  }
}

/** UI flows worth eyeballing after UI changes; not used in the README. */
async function review(browser: Browser) {
  const dir = join(root, '.shots-logs/review')
  const { context, page } = await open(browser, 'review')
  await page.goto(`${ORIGIN}/apps/${STARFALL}`)
  await page.locator('table tbody tr').first().waitFor()
  await page.locator('table tbody tr').nth(1).locator('[role="checkbox"]').click()
  await page.locator('table tbody tr').nth(3).locator('[role="checkbox"]').click()
  await shot(page, 'game-selected', { dir })

  // Hide Harbor Lights through its settings, then look at the sidebar and the Games page.
  await go(page, `/apps/${GAMES[2]!.appId}`)
  await page.getByRole('button', { name: 'Game settings' }).click()
  await page.getByRole('switch').first().click()
  await page.locator('#game-version').fill('0.9.2')
  await shot(page, 'settings-dirty', { dir })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Unsaved changes').waitFor({ state: 'detached' })
  await shot(page, 'settings-saved-hidden', { dir })
  await go(page, '/apps')
  await shot(page, 'games-hidden', { dir })
  await page.getByRole('switch', { name: /Show hidden/ }).click()
  await shot(page, 'games-show-hidden', { dir })

  // History: day tooltip, a ruler bar's tooltip, saving a point, restoring a saved one.
  await page.goto(`${ORIGIN}/apps/${STARFALL}`)
  await page.locator('table tbody tr').first().waitFor()
  await page.getByRole('button', { name: 'History' }).click()
  await page.locator(`[data-day="${todayKey()}"]`).hover()
  await settle(page, 500)
  await shot(page, 'history-day-tooltip', { dir, keepMouse: true })
  await page.locator(`[data-day="${todayKey()}"]`).click()
  await page.getByRole('slider').scrollIntoViewIfNeeded()
  await page.getByRole('slider').locator('span.flex-col').nth(2).hover()
  await settle(page, 500)
  await shot(page, 'history-bar-tooltip', { dir, keepMouse: true })
  await page.getByRole('button', { name: 'Save restore point' }).click()
  await page.getByPlaceholder(/Name \(optional\)/).fill('After the morning update')
  await shot(page, 'history-save-popover', { dir, keepMouse: true })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('After the morning update').first().waitFor()
  await page.evaluate(() => document.querySelector('[data-day]')?.scrollIntoView())
  await shot(page, 'history-saved-list', { dir })
  await page.getByRole('button', { name: 'Restore', exact: true }).nth(1).click()
  await page.getByRole('dialog').waitFor()
  await shot(page, 'history-restore-saved', { dir })
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.goto(`${ORIGIN}/items/3100010002`)
  await page.getByText('Snapshots').first().waitFor()
  await page.getByRole('button', { name: 'More actions' }).click()
  await shot(page, 'item-menu', { dir, keepMouse: true })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Snapshot actions' }).nth(1).click()
  await shot(page, 'item-snapshot-menu', { dir, keepMouse: true })
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
  await toGif(page, context, skip, 'restore.gif')
}

const browser = await chromium.launch()
try {
  console.log('Screenshots:')
  await screenshots(browser)
  await workshopShots(browser)
  if (process.argv.includes('--review')) {
    console.log('Review:')
    await review(browser)
  }
  console.log('Videos:')
  await restoreVideo(browser)
  await workshopVideo(browser)
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}

if (unknownCommands.size) console.log(`Commands with no demo answer (returned null): ${[...unknownCommands].join(', ')}`)
for (const p of problems) console.log(`! ${p}`)
console.log(`Wrote ${readdirSync(out).join(', ')} to docs/screenshots/`)
