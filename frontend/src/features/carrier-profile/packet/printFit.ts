import { createContext } from 'react'

/** True inside the printed copy of the report: its sheets use the print layout (no card frame). */
export const PrintCopy = createContext(false)

/**
 * The content area of a printed page: A4 (210 x 297mm) less the 10mm side and 9mm top and bottom
 * margins drawn inside each page (index.css .print-page), less 2mm to spare.
 */
const PAGE_HEIGHT_MM = 277
const PAGE_WIDTH_MM = 190
const PX_PER_MM = 96 / 25.4
const PAGE_HEIGHT = PAGE_HEIGHT_MM * PX_PER_MM
const PAGE_WIDTH = PAGE_WIDTH_MM * PX_PER_MM
/**
 * The printed text's size: a little under full size, so the first page holds the score, the red
 * items and the out-of-service rates (it printed at 70-79% when every part had to fit one page).
 * Each page is laid out at the page width divided by this and scaled down with CSS zoom.
 */
const SCALE = 0.83 // the on-screen report uses the same (index.css #carrier-packet)

/** Where each report sheet landed: its first and last printed page, and the page count. */
export interface PageNumbers {
  first: number[]
  last: number[]
  total: number
}

/**
 * Lays the report out on A4 pages at one fixed size (SCALE, no shrinking to fit): the sheets of the printed
 * copy (`source`) are copied into `out` page by page. A sheet's sections (the children of its
 * `.sheet-body`) go onto a page while they fit; each new page repeats the running header and Sky
 * Transport Solutions strip of the sheet it starts in. The next sheet carries on on the same page
 * when there is room, under a line with its title. A section with a `[data-split]` element (a
 * table, a list) is split between its rows: what comes before the rows stays with the first part,
 * a table's header row is repeated on every part, and what follows the rows goes with the last.
 *
 * `out` is filled with plain copies that React never touches, so it can be rebuilt freely; it is
 * what prints (index.css). Returns the page numbers, or null when the copy isn't laid out (e.g.
 * while the browser is already in its print layout).
 */
export function paginateReport(source: HTMLElement, out: HTMLElement): PageNumbers | null {
  const sheets = [...source.querySelectorAll<HTMLElement>('.packet-sheet')]
  if (!sheets.length || source.getBoundingClientRect().width === 0) return null
  out.replaceChildren()
  const first: number[] = []
  const last: number[] = []
  const pages: HTMLElement[] = []
  let sheet = sheets[0]
  let page!: HTMLElement
  let body!: HTMLElement
  const newPage = () => {
    // A sheet's title line left alone at the bottom of a page goes: the new page's header names it.
    if (body?.lastElementChild?.hasAttribute('data-sheet-title')) body.lastElementChild.remove()
    const wrapper = document.createElement('div')
    wrapper.className = 'print-page'
    // The sheet's header and strip, with an empty body for this page's sections.
    const copy = sheet.cloneNode(false) as HTMLElement
    for (const child of sheet.children) {
      const isBody = child.classList.contains('sheet-body')
      const part = child.cloneNode(!isBody) as HTMLElement
      if (isBody) body = part
      copy.append(part)
    }
    copy.style.minHeight = '0px'
    // Zoomed from the start, so each page is measured exactly as it prints (text wraps a little
    // differently once scaled).
    copy.style.zoom = String(SCALE)
    copy.style.width = `${PAGE_WIDTH / SCALE}px`
    wrapper.append(copy)
    out.append(wrapper)
    pages.push(wrapper)
    page = copy
  }
  // The page's size as printed (the box of a zoomed element is the zoomed size).
  const fits = () => page.getBoundingClientRect().height <= PAGE_HEIGHT + 1

  sheets.forEach((next, index) => {
    sheet = next
    if (index === 0) {
      newPage()
    } else {
      const title = document.createElement('div')
      title.setAttribute('data-sheet-title', '')
      title.className =
        'mt-3 border-t-2 border-slate-300 pt-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-accent-strong'
      title.textContent = sheet.dataset.title ?? ''
      body.append(title)
      if (!fits()) newPage()
    }
    first.push(pages.length)

    const blocks = [
      ...(sheet.querySelector(':scope > .sheet-body')?.children ?? []),
    ] as HTMLElement[]
    for (const block of blocks) {
      const whole = block.cloneNode(true) as HTMLElement
      body.append(whole)
      if (fits()) continue
      whole.remove()
      const split = block.querySelector('[data-split]')
      if (!split) {
        // On a new page if it doesn't fit after what is already there.
        if (body.children.length) newPage()
        body.append(whole)
        if (!fits()) page.parentElement?.classList.add('print-flow') // never cut it off
        continue
      }
      placeSplit(block, split, () => body, newPage, fits)
    }
    last.push(pages.length)
  })

  pages.forEach((wrapper, i) => {
    const copy = wrapper.firstElementChild as HTMLElement
    // A full page tall (in its own, unzoomed units), so the strip sits at the bottom of each page.
    copy.style.minHeight = `${PAGE_HEIGHT / SCALE}px`
    const number = copy.querySelector('[data-page-number]')
    if (number) number.textContent = `· Page ${i + 1} of ${pages.length}`
  })
  return { first, last, total: pages.length }
}

/** The units a split element is cut between: its rows (a table's body groups, a list's items). */
function units(element: Element): Element[] {
  return [...element.children].filter((c) => c.tagName !== 'THEAD')
}

/**
 * An empty copy of `block` for a part starting at row `from`: the content before the split
 * element only on the first part. Returns the copy, its split element (rows go in there) and the
 * content after the split element (kept only on the last part).
 */
function shell(block: HTMLElement, split: Element, from: number) {
  // Copied without its rows (a long table would otherwise be copied whole for every page); they
  // are put back at once, before React can see the difference.
  const rows = units(split)
  rows.forEach((row) => row.remove())
  let copy: HTMLElement
  try {
    copy = block.cloneNode(true) as HTMLElement
  } finally {
    split.append(...rows)
  }
  const path: number[] = []
  for (let node: Element = split; node !== block; node = node.parentElement!) {
    path.unshift([...node.parentElement!.children].indexOf(node))
  }
  const after: Element[] = []
  let target: Element = copy
  for (const index of path) {
    const siblings = [...target.children]
    target = siblings[index]
    siblings.forEach((sibling, i) => {
      if (i < index && from > 0) sibling.remove()
      if (i > index) after.push(sibling)
    })
  }
  return { copy, target, after }
}

function placeSplit(
  block: HTMLElement,
  split: Element,
  body: () => HTMLElement,
  newPage: () => void,
  fits: () => boolean,
) {
  const rows = units(split)
  let from = 0
  while (from < rows.length) {
    // As many rows as fit on this page, measured with what follows the split element in place
    // in case they are the last ones.
    const { copy, target, after } = shell(block, split, from)
    body().append(copy)
    let to = from
    while (to < rows.length) {
      const row = rows[to].cloneNode(true)
      target.append(row)
      if (!fits()) {
        target.removeChild(row)
        break
      }
      to += 1
    }
    if (to === from) {
      if (body().children.length > 1) {
        copy.remove()
        newPage() // not even one row fits after what is there: start a new page
        continue
      }
      // One row taller than a page: printed on its own, running on rather than cut off.
      target.append(rows[from].cloneNode(true))
      body().closest('.print-page')?.classList.add('print-flow')
      to = from + 1
    }
    if (to < rows.length) after.forEach((element) => element.remove())
    from = to
    if (from < rows.length) newPage()
  }
}
