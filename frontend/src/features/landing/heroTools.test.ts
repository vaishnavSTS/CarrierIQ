import { describe, expect, it } from 'vitest'

import { mcs150Due } from './HeroTools'

// 49 CFR 390.19(b): last digit = month (0 = October), next-to-last digit odd/even = odd/even years.
describe('mcs150Due', () => {
  const nov2026 = new Date(2026, 10, 4)

  it('takes the month from the last digit and the year from the next-to-last', () => {
    // 7 → July; 6 is even → even years; July 2026 has passed → July 2028
    expect(mcs150Due('1234567', nov2026)).toEqual({ month: 6, year: 2028 })
  })

  it('uses October for a last digit of 0', () => {
    expect(mcs150Due('1234510', nov2026)?.month).toBe(9)
  })

  it('is this year while the month has not ended yet', () => {
    expect(mcs150Due('1234502', new Date(2026, 1, 10))).toEqual({ month: 1, year: 2026 })
  })

  it('moves to the next matching year once the month has passed', () => {
    expect(mcs150Due('1234502', nov2026)).toEqual({ month: 1, year: 2028 })
    expect(mcs150Due('1234512', nov2026)).toEqual({ month: 1, year: 2027 })
  })

  it('needs two digits', () => {
    expect(mcs150Due('7')).toBeNull()
  })
})
