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
/** A quiet page grows to fill the page, a busy one shrinks to fit it, within these limits. */
const MAX_ZOOM = 1.3
const MIN_ZOOM = 0.55

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

/**
 * Makes each sheet of the printed copy exactly one A4 page: scaled (CSS zoom) so its content
 * fills the page, and stretched to the page's height; the sheet spreads its sections over that
 * height, so the information covers the whole page and the Sky Transport Solutions strip at its
 * end sits at the bottom of that same page.
 *
 * A zoomed sheet is laid out at the page width divided by its zoom (so it prints exactly the page
 * wide), and text wraps differently at that width, so the zoom is found in a few rounds of
 * measuring. The copy is laid out off-screen, so this is measured exactly as it will print.
 */
export function fitSheets(root: HTMLElement) {
  const width = PAGE_WIDTH_MM * PX_PER_MM
  const height = PAGE_HEIGHT_MM * PX_PER_MM
  for (const sheet of root.querySelectorAll<HTMLElement>('.packet-sheet')) {
    const measure = (zoom: number) => {
      sheet.style.zoom = '1'
      sheet.style.minHeight = '0px'
      sheet.style.width = `${width / zoom}px`
      return sheet.getBoundingClientRect().height
    }
    let zoom = 1
    for (let round = 0; round < 5; round += 1) {
      const natural = measure(zoom)
      if (natural <= 0) break
      const next = clamp(height / natural)
      const settled = Math.abs(next - zoom) < 0.005
      zoom = next
      if (settled) break
    }
    // Never taller than the page: shrink a little more if the last round still overflows.
    const natural = measure(zoom)
    if (natural * zoom > height) zoom = Math.max(MIN_ZOOM, height / natural)
    measure(zoom)
    sheet.style.zoom = String(zoom)
    // min-height is in the sheet's own (unzoomed) units: after the zoom it is exactly a page.
    sheet.style.minHeight = `${height / zoom}px`
  }
}
