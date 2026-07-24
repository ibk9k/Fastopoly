import { describe, expect, it } from 'vitest'
import { executeBankruptcy } from '@/lib/game-engine/bankruptcy'
import { getTile } from '@/lib/game-engine/board'
import { makePlayer, makeProperty, makeStorage, totalCash } from './factories'

describe('executeBankruptcy — to a player creditor', () => {
  it('transfers properties (mortgage state intact) and jail cards to the creditor', () => {
    const debtor = makePlayer({ id: 'player-0', cash: 0, properties: ['baltic-avenue'], getOutOfJailCards: 1 })
    const creditor = makePlayer({ id: 'player-1', cash: 500 })
    const storage = makeStorage({
      players: [debtor, creditor],
      properties: { 'baltic-avenue': makeProperty('baltic-avenue', { ownerId: 'player-0', mortgaged: true }) },
    })

    executeBankruptcy(storage, debtor, 'player-1')

    expect(debtor.isBankrupt).toBe(true)
    expect(debtor.properties).toEqual([])
    expect(storage.properties['baltic-avenue'].ownerId).toBe('player-1')
    expect(storage.properties['baltic-avenue'].mortgaged).toBe(true) // stays mortgaged for the new owner
    expect(creditor.properties).toContain('baltic-avenue')
    expect(creditor.getOutOfJailCards).toBe(1)
    expect(creditor.bankruptciesCaused).toBe(1)
  })

  it('conserves total money when the debtor owed more than they had (rent already credited)', () => {
    // Debtor paid $200 rent they could not afford → cash -50; creditor already got the full $200.
    const debtor = makePlayer({ id: 'player-0', cash: -50, properties: [] })
    const creditor = makePlayer({ id: 'player-1', cash: 700 })
    const storage = makeStorage({ players: [debtor, creditor], properties: {} })

    const before = totalCash([debtor, creditor])
    executeBankruptcy(storage, debtor, 'player-1')
    expect(totalCash([debtor, creditor])).toBe(before) // -50 clawed back, debtor -> 0
    expect(creditor.cash).toBe(650)
  })

  it('sells buildings to the bank at half price and returns them to supply', () => {
    const debtor = makePlayer({ id: 'player-0', cash: 0, properties: ['mediterranean-avenue'] })
    const creditor = makePlayer({ id: 'player-1', cash: 0 })
    const storage = makeStorage({
      players: [debtor, creditor],
      properties: { 'mediterranean-avenue': makeProperty('mediterranean-avenue', { ownerId: 'player-0', houses: 2 }) },
      houseSupply: 30,
    })
    const houseCost = getTile('mediterranean-avenue')!.houseCost ?? 0

    executeBankruptcy(storage, debtor, 'player-1')
    expect(storage.properties['mediterranean-avenue'].houses).toBe(0)
    expect(storage.houseSupply).toBe(32) // 2 returned
    expect(creditor.cash).toBe(Math.floor((2 * houseCost) / 2))
  })
})

describe('executeBankruptcy — to the bank', () => {
  it('returns properties clean (unmortgaged, unowned)', () => {
    const debtor = makePlayer({ id: 'player-0', cash: 0, properties: ['baltic-avenue'] })
    const storage = makeStorage({
      players: [debtor, makePlayer({ id: 'player-1' })],
      properties: { 'baltic-avenue': makeProperty('baltic-avenue', { ownerId: 'player-0', mortgaged: true }) },
    })

    executeBankruptcy(storage, debtor, 'bank')
    expect(storage.properties['baltic-avenue'].ownerId).toBeNull()
    expect(storage.properties['baltic-avenue'].mortgaged).toBe(false)
    expect(debtor.isBankrupt).toBe(true)
  })
})
