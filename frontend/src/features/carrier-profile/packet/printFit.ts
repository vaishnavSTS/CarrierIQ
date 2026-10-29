import { createContext } from 'react'

/** True inside the printed copy of the report: its sheets use the print layout (no card frame). */
export const PrintCopy = createContext(false)

/** A4's height less the print margins (index.css @page: 9mm top and bottom) and 4mm to spare. */
const PAGE_MM = 275
const PX_PER_MM = 96 / 25.4
/** A quiet page grows to fill the page, a busy one shrinks to fit it, within these limits. */
const MAX_ZOOM = 1.3
const MIN_ZOOM = 0.55

/**
 * Makes each sheet of the printed copy exactly one A4 page: scaled (CSS zoom) so its content
 * fills the page, and stretched to the page's height; the sheet spreads its sections over that
 * height, so the information covers the whole page and the Sky Transport Solutions strip at its
 * end sits at the bottom of that same page. The copy is laid out off-screen at the printed width
 * (190mm), so it is measured exactly as it will print.
 */
export function fitSheets(root: HTMLElement) {
  const page = PAGE_MM * PX_PER_MM
  for (const sheet of root.querySelectorAll<HTMLElement>('.packet-sheet')) {
    sheet.style.zoom = '1'
    sheet.style.minHeight = '0px'
    const natural = sheet.getBoundingClientRect().height
    if (natural <= 0) continue
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, page / natural))
    sheet.style.zoom = String(zoom)
    // min-height is in the sheet's own (unzoomed) units: after the zoom it is exactly a page.
    sheet.style.minHeight = `${page / zoom}px`
  }
}
