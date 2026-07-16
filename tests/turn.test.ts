import { describe, expect, it } from 'vitest'
import { applyRoll, resolveExpiredAuction } from '@/lib/game-engine/turn'
import { CHANCE_CARDS } from '@/lib/game-engine/cards'
import type { RoomEvent } from '@/lib/liveblocks.config'
import { makePlayer, makeProperty, makePropertyMap, makeStorage, totalCash } from './factories'

function events(): RoomEvent[] {
  return []
}

describe('applyRoll — movement', () => {
  it('moves by the dice total and marks the roll consumed', () => {
    const p = makePlayer({ position: 0 })
    const storage = makeStorage({ players: [p, makePlayer({ id: 'player-1' })] })
    const result = applyRoll(storage, 2, 3, events())
    expect(result.newPosition).toBe(5)
    expect(storage.hasRolled).toBe(true)
    expect(storage.lastDiceRoll.d1).toBe(2)
  })

  it('collects $200 when passing Go', () => {
    const p = makePlayer({ position: 38, cash: 0 })
    const storage = makeStorage({ players: [p, makePlayer({ id: 'player-1' })] })
    const result = applyRoll(storage, 2, 3, events())
    expect(result.passedGo).toBe(true)
    expect(p.position).toBe(3)
    // +200 Go, then Baltic is unowned -> buy decision (no rent deducted)
    expect(p.cash).toBe(200)
  })

  it('resolves the landing in the same call — rent settles with no separate /land', () => {
    const props = makePropertyMap()
    props.set('oriental-avenue', makeProperty('oriental-avenue', { ownerId: 'player-1' })) // index 6
    const p0 = makePlayer({ id: 'player-0', position: 1, cash: 500 })
    const p1 = makePlayer({ id: 'player-1', cash: 500 })
    const storage = makeStorage({ players: [p0, p1], properties: Object.fromEntries(props) })
    const result = applyRoll(storage, 2, 3, events()) // 1 + 5 = 6
    expect(result.action).toBe('paid_rent')
    expect(result.amount).toBe(6)
    expect(totalCash([p0, p1])).toBe(1000)
  })

  it('offers a buy decision on an unowned property', () => {
    const p = makePlayer({ position: 1 })
    const storage = makeStorage({ players: [p, makePlayer({ id: 'player-1' })] })
    const result = applyRoll(storage, 1, 1, events()) // -> index 3 baltic
    expect(result.action).toBe('can_buy')
    expect(storage.gamePhase).toBe('buy_decision')
  })

  it('draws and applies a card on Chance, advancing the deck index', () => {
    const p = makePlayer({ position: 5, cash: 1000 })
    const storage = makeStorage({ players: [p, makePlayer({ id: 'player-1' })], chanceIndex: 0 })
    const evts = events()
    applyRoll(storage, 1, 1, evts) // 5 + 2 = 7 (chance)
    expect(storage.chanceIndex).toBe(1)
    expect(evts.some((e) => e.type === 'CARD_DRAWN')).toBe(true)
    expect(CHANCE_CARDS[0]).toBeTruthy()
  })
})

describe('applyRoll — doubles', () => {
  it('counts consecutive doubles and grants a re-roll below three', () => {
    const p = makePlayer({ position: 0 })
    const storage = makeStorage({ players: [p, makePlayer({ id: 'player-1' })] })
    applyRoll(storage, 2, 2, events()) // lands on income tax? 0+4 = 4 tax -> handlePostLanding re-arms
    expect(storage.consecutiveDoubles).toBe(1)
    expect(storage.hasRolled).toBe(false) // re-armed for the extra roll
    expect(storage.currentPlayerIndex).toBe(0)
  })

  it('sends the roller to jail on the third consecutive doubles and forfeits the turn', () => {
    const p0 = makePlayer({ id: 'player-0', position: 0 })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1], consecutiveDoubles: 2, hasRolled: false })
    const result = applyRoll(storage, 4, 4, events())
    expect(result.action).toBe('jail')
    expect(p0.inJail).toBe(true)
    expect(p0.position).toBe(10)
    expect(storage.currentPlayerIndex).toBe(1) // turn passed — no extra roll
    expect(storage.consecutiveDoubles).toBe(0)
  })

  it('rolling doubles onto Go To Jail forfeits the turn (no extra roll)', () => {
    const p0 = makePlayer({ id: 'player-0', position: 22 })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1] })
    applyRoll(storage, 4, 4, events()) // 22 + 8 = 30 go-to-jail
    expect(p0.inJail).toBe(true)
    expect(storage.currentPlayerIndex).toBe(1) // advanced — doubles did NOT re-arm
    expect(storage.hasRolled).toBe(false)
  })

  it('resets the doubles counter when the turn passes normally', () => {
    const p0 = makePlayer({ id: 'player-0', position: 0 })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1], consecutiveDoubles: 1 })
    applyRoll(storage, 2, 3, events()) // non-doubles resets immediately
    expect(storage.consecutiveDoubles).toBe(0)
  })
})

describe('applyRoll — utility rent uses the server dice', () => {
  it('charges dice x4 from the actual roll, not a client-supplied total', () => {
    const props = makePropertyMap()
    props.set('electric-company', makeProperty('electric-company', { ownerId: 'player-1' })) // index 12
    const p0 = makePlayer({ id: 'player-0', position: 7, cash: 500 })
    const p1 = makePlayer({ id: 'player-1', cash: 0 })
    const storage = makeStorage({ players: [p0, p1], properties: Object.fromEntries(props) })
    const result = applyRoll(storage, 2, 3, events()) // 7 + 5 = 12
    expect(result.action).toBe('paid_rent')
    expect(result.amount).toBe(20) // 5 x 4
  })
})

describe('resolveExpiredAuction', () => {
  function auctionStorage(overrides = {}) {
    return makeStorage({
      gamePhase: 'auction',
      auctionPropertyId: 'baltic-avenue',
      auctionHighestBid: 50,
      auctionHighestBidderId: 'player-1',
      auctionEndTime: Date.now() - 1000,
      players: [makePlayer({ id: 'player-0' }), makePlayer({ id: 'player-1', cash: 500 })],
      ...overrides,
    })
  }

  it('charges the winner and transfers the property', () => {
    const storage = auctionStorage()
    expect(resolveExpiredAuction(storage)).toBe(true)
    const winner = storage.players[1]
    expect(winner.cash).toBe(450)
    expect(storage.properties['baltic-avenue'].ownerId).toBe('player-1')
    expect(storage.gamePhase).toBe('playing')
  })

  it('is idempotent — a second call is a no-op', () => {
    const storage = auctionStorage()
    expect(resolveExpiredAuction(storage)).toBe(true)
    expect(resolveExpiredAuction(storage)).toBe(false) // phase no longer auction
    expect(storage.players[1].cash).toBe(450) // not double-charged
  })

  it('rejects resolution while the timer is still running', () => {
    const storage = auctionStorage({ auctionEndTime: Date.now() + 10000 })
    expect(() => resolveExpiredAuction(storage)).toThrow('still in progress')
  })

  it('returns the property to the bank when there were no bids', () => {
    const storage = auctionStorage({ auctionHighestBidderId: null, auctionHighestBid: 0 })
    expect(resolveExpiredAuction(storage)).toBe(true)
    expect(storage.properties['baltic-avenue'].ownerId).toBeNull()
  })
})
