import { describe, expect, it } from 'vitest'

import { smoothPath } from './smoothPath'

describe('smoothPath', () => {
  it('passes through every point and stays flat where the score does not move', () => {
    const path = smoothPath([
      { x: 0, y: 50 },
      { x: 10, y: 50 },
      { x: 20, y: 30 },
    ])
    expect(path.startsWith('M0,50')).toBe(true)
    expect(path).toContain(' 10,50')
    expect(path.endsWith(' 20,30')).toBe(true)
    // Flat first segment: both control points at y = 50 (no overshoot).
    expect(path).toContain('C3.3333333333333335,50 6.666666666666666,50 10,50')
  })

  it('handles one point and none', () => {
    expect(smoothPath([{ x: 5, y: 7 }])).toBe('M5,7')
    expect(smoothPath([])).toBe('')
  })
})
