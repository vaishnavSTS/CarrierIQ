import { createContext } from 'react'

/** True inside the printed copy of the report: its sheets use the print layout (no card frame). */
export const PrintCopy = createContext(false)

/**
 * The content area of a printed page: A4 (210 x 297mm) less the 10mm side and 9mm top and bottom
 * margins drawn inside each page (index.css .print-page), less 2mm to spare.
 */
const PAGE_WIDTH_MM = 190
const PAGE_HEIGHT_MM = 277
const PX_PER_MM = 96 / 25.4
/**
 * Every page prints at the same scale, so the text is the same size on each: the scale the fullest
 * page needs to fit, never above 100% and never below MIN_ZOOM (the record pages show fewer rows,
 * with "+N more", so busy carriers stay readable).
 */
const MAX_ZOOM = 1
const MIN_ZOOM = 0.7

/**
 * Makes each sheet of the printed copy exactly one A4 page at one shared scale (CSS zoom); each
 * sheet is stretched to the page's height, so the Sky Transport Solutions strip at its end sits at
 * the bottom of that page.
 *
 * A zoomed sheet is laid out at the page width divided by its zoom (so it prints exactly the page
 * wide), and text wraps differently at that width (a table can be far taller when narrow), so the
 * largest scale that fits is found by halving the range a few times. The copy is laid out
 * off-screen, so this is measured exactly as it will print.
 */
export function fitSheets(root: HTMLElement) {
  const width = PAGE_WIDTH_MM * PX_PER_MM
  const height = PAGE_HEIGHT_MM * PX_PER_MM
  const sheets = [...root.querySelectorAll<HTMLElement>('.packet-sheet')]
  const measure = (sheet: HTMLElement, zoom: number) => {
    sheet.style.zoom = '1'
    sheet.style.minHeight = '0px'
    sheet.style.width = `${width / zoom}px`
    return sheet.getBoundingClientRect().height
  }
  // Whether the sheet fits on the page at this scale (laid out at the width that scale gives).
  const fitsAt = (sheet: HTMLElement, zoom: number) => measure(sheet, zoom) * zoom <= height
  // The largest scale at which the sheet fits, to within 0.005.
  const fits = (sheet: HTMLElement) => {
    if (fitsAt(sheet, MAX_ZOOM)) return MAX_ZOOM
    if (!fitsAt(sheet, MIN_ZOOM)) return MIN_ZOOM
    let low = MIN_ZOOM
    let high = MAX_ZOOM
    while (high - low > 0.005) {
      const mid = (low + high) / 2
      if (fitsAt(sheet, mid)) low = mid
      else high = mid
    }
    return low
  }
  const zoom = Math.min(MAX_ZOOM, ...sheets.map(fits))
  for (const sheet of sheets) {
    measure(sheet, zoom)
    sheet.style.zoom = String(zoom)
    // min-height is in the sheet's own (unzoomed) units: after the zoom it is exactly a page.
    sheet.style.minHeight = `${height / zoom}px`
  }
}
