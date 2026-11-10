export interface Xy {
  x: number
  y: number
}

/** A smooth line that never overshoots the points (monotone cubic, as d3's curveMonotoneX). */
export function smoothPath(pts: Xy[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`
  const n = pts.length
  const d = pts.slice(0, -1).map((p, k) => (pts[k + 1].y - p.y) / (pts[k + 1].x - p.x || 1))
  const m = pts.map((_, k) =>
    k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2,
  )
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0
      m[k + 1] = 0
      continue
    }
    const a = m[k] / d[k]
    const b = m[k + 1] / d[k]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[k] = t * a * d[k]
      m[k + 1] = t * b * d[k]
    }
  }
  let path = `M${pts[0].x},${pts[0].y}`
  for (let k = 0; k < n - 1; k++) {
    const h = (pts[k + 1].x - pts[k].x) / 3
    path +=
      ` C${pts[k].x + h},${pts[k].y + m[k] * h}` +
      ` ${pts[k + 1].x - h},${pts[k + 1].y - m[k + 1] * h}` +
      ` ${pts[k + 1].x},${pts[k + 1].y}`
  }
  return path
}
