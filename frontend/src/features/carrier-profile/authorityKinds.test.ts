import { describe, expect, it } from 'vitest'

import { mixedAuthorityNote } from './authorityKinds'

describe('mixedAuthorityNote', () => {
  it('explains an active and an inactive kind under one MC', () => {
    expect(
      mixedAuthorityNote('MC 123456', [
        { kind: 'Motor Carrier of Property (Except Household Goods)', status: 'ACTIVE' },
        { kind: 'Broker of Property (Except Household Goods)', status: 'INACTIVE' },
      ]),
    ).toBe(
      'FMCSA lists each kind of authority under MC 123456 separately: Motor Carrier of Property ' +
        '(Except Household Goods) is active; Broker of Property (Except Household Goods) is ' +
        'inactive. The docket counts as active because at least one kind is, which is what ' +
        'FMCSA’s SAFER snapshot shows. A check that looks only at Broker of Property (Except ' +
        'Household Goods) would see it as inactive.',
    )
  })

  it('names old L&I kinds as authorities', () => {
    const note = mixedAuthorityNote('MC 787470', [
      { kind: 'Common carrier', status: 'INACTIVE' },
      { kind: 'Contract carrier', status: 'ACTIVE' },
      { kind: 'Broker', status: 'WITHDRAWN' },
    ])
    expect(note).toContain('Contract carrier authority is active')
    expect(note).toContain('Common carrier authority is inactive and Broker authority is withdrawn')
  })

  it('says nothing when there is nothing to explain', () => {
    // Kinds never held ("None") are normal: e.g. contract active, common and broker none.
    expect(
      mixedAuthorityNote('MC 787470', [
        { kind: 'Common carrier', status: 'NONE' },
        { kind: 'Contract carrier', status: 'ACTIVE' },
        { kind: 'Broker', status: 'NONE' },
      ]),
    ).toBeNull()
    expect(mixedAuthorityNote('MC 1', [{ kind: 'Broker', status: 'INACTIVE' }])).toBeNull()
    expect(mixedAuthorityNote('MC 1', [])).toBeNull()
  })
})
