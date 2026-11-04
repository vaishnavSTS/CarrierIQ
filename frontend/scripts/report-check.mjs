// Opens the Safety Score Report of the 20 real carriers in the ISS fixtures, prints each to PDF and
// compares it with the API: nothing cut off, no broken values, every A4 page fits and is numbered,
// the latest 30 inspections are listed at the end, and the printed numbers match. It only reads,
// so it sends no email. Point it at a local or test server, never at production with a real login.
//
//   REPORT_EMAIL=... REPORT_PASSWORD=... npm run report-check
//
// REPORT_URL    the site (default http://localhost:5173); needs a staff login
// TEST_ISS=1    use a made-up Estimated ISS, for a database without ISS tables
// ONLY=1,2      only these USDOT numbers
// OUT_DIR       keep each PDF here
// EDGE_PATH     the browser (any Chromium-based one works)
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.REPORT_URL ?? 'http://localhost:5173'
const EMAIL = process.env.REPORT_EMAIL
const PASSWORD = process.env.REPORT_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('Set REPORT_EMAIL and REPORT_PASSWORD (a staff login on a test server).')
  process.exit(2)
}
const BROWSER =
  process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = process.env.DEBUG_PORT ?? '9555'
const OUT_DIR = process.env.OUT_DIR
const fixtures = new URL('../../backend/tests/fixtures/iss/carriers_2026_10.json', import.meta.url)
const usdots = process.env.ONLY
  ? process.env.ONLY.split(',')
  : JSON.parse(readFileSync(fixtures, 'utf8')).map((row) => row.dot_number)

/** 277mm by 190mm: the printed page's content area (src/.../packet/printFit.ts). */
const PAGE_HEIGHT = (277 * 96) / 25.4
const PAGE_WIDTH = (190 * 96) / 25.4
/** The printed page keeps 2mm to spare below that, so this much over still prints whole. */
const TOLERANCE = (2 * 96) / 25.4

/** The report's everyday names for FMCSA's categories (src/.../packet/basicTiles.ts). */
const PLAIN_NAME = {
  'Hours-of-Service Compliance': 'Hours of Service',
  'Controlled Substances/Alcohol': 'Drugs & Alcohol',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!login.ok) throw new Error(`Login failed: ${login.status}`)
const [cookieName, cookieValue] = login.headers.get('set-cookie').split(';')[0].split('=')
const cookie = `${cookieName}=${cookieValue}`
const { hostname } = new URL(BASE)

const browser = spawn(
  BROWSER,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'report-check-'))}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
let targets
for (let i = 0; i < 40 && !targets; i += 1) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  } catch {
    await sleep(250)
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => ws.addEventListener('open', resolve))
let nextId = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    nextId += 1
    pending.set(nextId, resolve)
    ws.send(JSON.stringify({ id: nextId, method, params }))
  })
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result.result?.value

const basic = (key, label, percentile, threshold, over) => ({
  basic: key,
  label,
  percentile,
  assessed: true,
  threshold,
  over_threshold: over,
})
const TEST_ISS = process.env.TEST_ISS
  ? {
      value: 91,
      band: 'INSPECT',
      group: 1,
      reason: "2 safety categories over FMCSA's thresholds (FMCSA's high-risk rule)",
      data_month: '2026-10-01',
      version: 'test',
      algorithm: 'SAFETY',
      basics: [
        basic('hos_driv', 'Hours-of-Service Compliance', 88, 65, true),
        basic('veh_maint', 'Vehicle Maintenance', 96, 80, true),
        basic('unsafe_driv', 'Unsafe Driving', 40, 65, false),
      ],
    }
  : null
if (TEST_ISS) {
  await send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/v1/carriers/*/safety', requestStage: 'Response' }],
  })
  ws.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data)
    if (message.method !== 'Fetch.requestPaused') return
    const { requestId } = message.params
    const { result } = await send('Fetch.getResponseBody', { requestId })
    const body = JSON.parse(
      result.base64Encoded ? Buffer.from(result.body, 'base64').toString() : result.body,
    )
    body.estimated_iss = TEST_ISS
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    })
  })
}
await send('Network.setCookie', {
  name: cookieName,
  value: cookieValue,
  domain: hostname,
  path: '/',
})
await send('Emulation.setDeviceMetricsOverride', {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})

// Reads the printed copy. Text pieces are joined with spaces, so "2026" and "91" stay two numbers.
const READ_REPORT = `JSON.stringify((() => {
  const root = document.querySelector('#carrier-packet-print')
  const sheets = root ? [...root.querySelectorAll('.packet-sheet')] : []
  if (!sheets.length) return null
  const pieces = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) pieces.push(node.nodeValue)
  const clipped = [...root.querySelectorAll('*')]
    .filter((el) => {
      const style = getComputedStyle(el)
      return (
        (style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none') &&
        (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      )
    })
    .map((el) => el.textContent.slice(0, 50))
  // The A4 pages paginateReport laid the report out on (printFit.ts): what prints.
  const pages = [...document.querySelectorAll('#carrier-packet-pages .print-page')]
  // Each page is printed at a fixed scale (CSS zoom); its size is measured as printed.
  const zoomOf = (sheet) => parseFloat(sheet.style.zoom || 1)
  const sizes = pages.map((page, i) => ({
    page: i + 1,
    height: page.firstElementChild.scrollHeight * zoomOf(page.firstElementChild),
    width: page.firstElementChild.scrollWidth * zoomOf(page.firstElementChild),
    runsOn: page.classList.contains('print-flow'),
    number: page.querySelector('[data-page-number]')?.textContent ?? '',
  }))
  const listed = document.querySelectorAll(
    '#carrier-packet-pages table[data-inspection-list] > tbody',
  ).length
  return { sizes, listed, clipped, text: pieces.join(' ').replace(/\\s+/g, ' ') }
})())`

const api = async (usdot, path) => {
  const response = await fetch(`${BASE}/api/v1/carriers/${usdot}${path}`, {
    headers: { Cookie: cookie },
  })
  if (!response.ok) throw new Error(`${path || 'profile'}: ${response.status}`)
  return response.json()
}

/** Everything wrong with one carrier's report, in words. */
function problemsIn(report, profile, safety, pdfPages, inspectionsOnFile) {
  const problems = []
  const { text, sizes, listed, clipped } = report
  const has = (pattern) => pattern.test(text)
  for (const bad of ['undefined', 'NaN', '[object', ' null ']) {
    if (text.includes(bad)) problems.push(`contains "${bad}"`)
  }
  for (const size of sizes) {
    if (size.height > PAGE_HEIGHT + TOLERANCE) {
      problems.push(`page ${size.page} is ${Math.round(size.height - PAGE_HEIGHT)}px too tall`)
    }
    if (size.width > PAGE_WIDTH + TOLERANCE) {
      problems.push(`page ${size.page} is ${Math.round(size.width - PAGE_WIDTH)}px too wide`)
    }
    if (size.runsOn) problems.push(`page ${size.page} runs on to another page`)
    if (size.number !== `· Page ${size.page} of ${sizes.length}`) {
      problems.push(`page ${size.page} is numbered "${size.number}"`)
    }
  }
  if (pdfPages !== sizes.length) problems.push(`PDF has ${pdfPages} pages for ${sizes.length}`)
  // The latest 30 are listed at the end (LATEST_INSPECTIONS in src/hooks/useCarrierSafety.ts).
  if (listed !== Math.min(30, inspectionsOnFile)) {
    problems.push(`${listed} inspections listed; ${inspectionsOnFile} on file`)
  }
  if (clipped.length) problems.push(`cut off: ${clipped.join(' | ')}`)
  if (!text.toLowerCase().includes(profile.legal_name.toLowerCase())) {
    problems.push('legal name missing')
  }
  const iss = safety.estimated_iss
  if (iss?.value != null && !has(new RegExp(`(?<!\\d)${iss.value}(?!\\d)`))) {
    problems.push(`ISS ${iss.value} not shown`)
  }
  if (iss?.reason && !text.includes(iss.reason)) problems.push(`ISS reason missing: ${iss.reason}`)
  for (const b of iss?.basics ?? []) {
    const name = PLAIN_NAME[b.label] ?? b.label
    if (b.over_threshold && !text.includes(`${name} over FMCSA`)) {
      problems.push(`${b.label} is over its threshold but not listed`)
    }
  }
  const recent = profile.safety.recent
  if (recent && !has(new RegExp(`Inspections ${recent.inspections}(?!\\d)`, 'i'))) {
    problems.push(`inspections don't match ${recent.inspections}`)
  }
  const crashes = safety.crashes
  if (
    crashes &&
    !has(new RegExp(`Crashes . ${crashes.recent_months} mo ${crashes.recent_total}(?!\\d)`, 'i'))
  ) {
    problems.push(`crashes don't match ${crashes.recent_total}`)
  }
  if (text.includes('Fix it with Sky')) problems.push('a web button is in the printed report')
  if (/\/(portal|broker)\/carriers\//.test(text)) problems.push('a role-specific link is printed')
  return problems
}

let failed = 0
for (const usdot of usdots) {
  let problems
  let summary = ''
  try {
    const profile = await api(usdot, '')
    await send('Page.navigate', { url: `${BASE}/carriers/${usdot}?tab=safety-score-report` })
    let report = null
    for (let i = 0; i < 40 && !report; i += 1) {
      await sleep(1500)
      report = JSON.parse((await evaluate(READ_REPORT)) ?? 'null')
    }
    if (!report) throw new Error('the report never rendered')
    await sleep(2500) // the pages are laid out again once the fonts have loaded
    report = JSON.parse(await evaluate(READ_REPORT))
    const safety = await api(usdot, '/safety')
    if (TEST_ISS) safety.estimated_iss = TEST_ISS
    const printed = await send('Page.printToPDF', {
      preferCSSPageSize: true,
      printBackground: true,
    })
    const pdf = Buffer.from(printed.result.data, 'base64')
    const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    if (OUT_DIR) writeFileSync(join(OUT_DIR, `report_${usdot}.pdf`), pdf)
    const onFile = (await api(usdot, '/inspections?page=1&page_size=1')).total
    problems = problemsIn(report, profile, safety, pdfPages, onFile)
    summary = `${profile.legal_name} | ${pdfPages} pages | ${report.listed} inspections listed`
  } catch (error) {
    problems = [String(error)]
  }
  if (problems.length) failed += 1
  console.log(usdot, summary, problems.length ? `| FAIL: ${problems.join('; ')}` : '| ok')
}
console.log(`${usdots.length} carriers, ${failed} with problems`)
ws.close()
browser.kill()
process.exit(failed ? 1 : 0)
