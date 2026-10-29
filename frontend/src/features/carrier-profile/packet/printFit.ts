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
 * wide), and text wraps differently at that width, so the scale is found in a few rounds of
 * measuring. The copy is laid out off-screen, so this is measured exactly as it will print.
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
  // The scale each sheet needs to fit (a few rounds: text rewraps at each width).
  const fits = (sheet: HTMLElement) => {
    let zoom = 1
    for (let round = 0; round < 5; round += 1) {
      const natural = measure(sheet, zoom)
      if (natural <= 0) return MAX_ZOOM
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, height / natural))
      const settled = Math.abs(next - zoom) < 0.005
      zoom = next
      if (settled) break
    }
    const natural = measure(sheet, zoom)
    return natural * zoom > height ? Math.max(MIN_ZOOM, height / natural) : zoom
  }
  const zoom = Math.min(MAX_ZOOM, ...sheets.map(fits))
  for (const sheet of sheets) {
    measure(sheet, zoom)
    sheet.style.zoom = String(zoom)
    // min-height is in the sheet's own (unzoomed) units: after the zoom it is exactly a page.
    sheet.style.minHeight = `${height / zoom}px`
  }
}
