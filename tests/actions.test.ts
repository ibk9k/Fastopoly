import { describe, expect, it } from 'vitest'
import {
  applyCard,
  hasFullColorGroup,
  moveBy,
  movePlayer,
  nearestTileIndex,
  payPlayer,
  resolveLanding,
  sendToJail,
} from '@/lib/game-engine/actions'
import { makePlayer, makeProperty, makePropertyMap, makeStorage, totalCash } from './factories'

describe('movePlayer', () => {
  it('collects $200 when passing Go', () => {
    const p = makePlayer({ position: 39, cash: 100 })
    const passed = movePlayer(p, 5, true) // advance forward wrapping past Go
    expect(passed).toBe(true)
    expect(p.position).toBe(5)
    expect(p.cash).toBe(300)
  })

  it('does not collect $200 when collectGo is false (e.g. Advance to Boardwalk)', () => {
    const p = makePlayer({ position: 5, cash: 100 })
    movePlayer(p, 39, false)
    expect(p.cash).toBe(100)
  })

  it('collects $200 for landing exactly on Go', () => {
    const p = makePlayer({ position: 10, cash: 0 })
    movePlayer(p, 0, true)
    expect(p.cash).toBe(200)
  })
})

describe('moveBy', () => {
  it('collects $200 when stepping forward past Go', () => {
    const p = makePlayer({ position: 38, cash: 0 })
    expect(moveBy(p, 5)).toBe(true)
    expect(p.position).toBe(3)
    expect(p.cash).toBe(200)
  })

  it('does not collect when moving backwards (Go back 3 spaces)', () => {
    const p = makePlayer({ position: 2, cash: 0 })
    expect(moveBy(p, -3)).toBe(false)
    expect(p.position).toBe(39)
    expect(p.cash).toBe(0)
  })
})

describe('nearestTileIndex', () => {
  it('finds the next railroad ahead', () => {
    expect(nearestTileIndex(7, 'railroad')).toBe(15)
  })
  it('finds the next utility ahead', () => {
    expect(nearestTileIndex(7, 'utility')).toBe(12)
  })
})

describe('sendToJail', () => {
  it('places the player on tile 10 and flags jail', () => {
    const p = makePlayer({ position: 25 })
    sendToJail(p)
    expect(p.position).toBe(10)
    expect(p.inJail).toBe(true)
    expect(p.jailTurns).toBe(0)
  })
})

describe('payPlayer', () => {
  it('conserves money between payer and receiver', () => {
    const storage = makeStorage()
    const payer = makePlayer({ cash: 500 })
    const receiver = makePlayer({ id: 'player-1', cash: 500 })
    payPlayer(storage, payer, receiver, 200)
    expect(payer.cash).toBe(300)
    expect(receiver.cash).toBe(700)
    expect(totalCash([payer, receiver])).toBe(1000)
  })

  it('routes a null-receiver payment into the Free Parking pool when the jackpot rule is on', () => {
    const storage = makeStorage({ rules: { ...makeStorage().rules, freeParkingJackpot: true } })
    const payer = makePlayer({ cash: 500 })
    payPlayer(storage, payer, null, 200)
    expect(payer.cash).toBe(300)
    expect(storage.freeParkingPool).toBe(200)
  })

  // Phase 6 design: the receiver is credited in full immediately (kept whole), and the payer's
  // negative balance parks them in debt-limbo — end-turn blocks until they liquidate, and any
  // shortfall is clawed back from the creditor at bankruptcy (see bankruptcy.test.ts), so money
  // is conserved across the whole flow rather than at each payPlayer call.
  it('credits the receiver in full and lets the payer go into debt', () => {
    const storage = makeStorage()
    const payer = makePlayer({ cash: 10 })
    const receiver = makePlayer({ id: 'player-1', cash: 0 })
    payPlayer(storage, payer, receiver, 100)
    expect(payer.cash).toBe(-90)
    expect(receiver.cash).toBe(100)
  })
})

describe('applyCard', () => {
  it('collect adds cash', () => {
    const storage = makeStorage()
    const p = makePlayer({ cash: 100 })
    applyCard(storage, p, { id: 'x', text: '', action: { type: 'collect', amount: 50 } })
    expect(p.cash).toBe(150)
  })

  it('pay removes cash', () => {
    const storage = makeStorage()
    const p = makePlayer({ cash: 100 })
    applyCard(storage, p, { id: 'x', text: '', action: { type: 'pay', amount: 50 } })
    expect(p.cash).toBe(50)
  })

  it('birthday (collect_from_players, positive) takes from each other active player', () => {
    const p0 = makePlayer({ id: 'player-0', cash: 100 })
    const p1 = makePlayer({ id: 'player-1', cash: 100 })
    const p2 = makePlayer({ id: 'player-2', cash: 100, isBankrupt: true })
    const storage = makeStorage({ players: [p0, p1, p2] })
    applyCard(storage, p0, { id: 'x', text: '', action: { type: 'collect_from_players', amount: 10 } })
    expect(p0.cash).toBe(110) // +10 from p1 only (p2 bankrupt is skipped)
    expect(p1.cash).toBe(90)
    expect(p2.cash).toBe(100)
  })

  it('chairman (collect_from_players, negative) pays each other active player', () => {
    const p0 = makePlayer({ id: 'player-0', cash: 100 })
    const p1 = makePlayer({ id: 'player-1', cash: 100 })
    const storage = makeStorage({ players: [p0, p1] })
    applyCard(storage, p0, { id: 'x', text: '', action: { type: 'collect_from_players', amount: -50 } })
    expect(p0.cash).toBe(50)
    expect(p1.cash).toBe(150)
  })

  it('pay_per_building charges per house and hotel across owned properties', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: 'player-0', houses: 2 }))
    props.set('boardwalk', makeProperty('boardwalk', { ownerId: 'player-0', hotels: 1 }))
    const storage = makeStorage({ properties: Object.fromEntries(props) })
    const p = makePlayer({ cash: 1000, properties: ['mediterranean-avenue', 'boardwalk'] })
    applyCard(storage, p, { id: 'x', text: '', action: { type: 'pay_per_building', houseCost: 25, hotelCost: 100 } })
    // 2 houses * 25 + 1 hotel * 100 = 150
    expect(p.cash).toBe(850)
  })

  it('go_to_jail sends the player to jail', () => {
    const storage = makeStorage()
    const p = makePlayer({ position: 22 })
    applyCard(storage, p, { id: 'x', text: '', action: { type: 'go_to_jail' } })
    expect(p.inJail).toBe(true)
    expect(p.position).toBe(10)
  })

  it('get_out_of_jail grants a jail card', () => {
    const storage = makeStorage()
    const p = makePlayer({ getOutOfJailCards: 0 })
    applyCard(storage, p, { id: 'x', text: '', action: { type: 'get_out_of_jail' } })
    expect(p.getOutOfJailCards).toBe(1)
  })

  it('movement cards signal a follow-up landing', () => {
    const storage = makeStorage()
    const p = makePlayer({ position: 0 })
    const result = applyCard(storage, p, { id: 'x', text: '', action: { type: 'move_to', tileIndex: 24, collectGo: true } })
    expect(result.followUpTile).toBe(true)
    expect(p.position).toBe(24)
  })
})

describe('resolveLanding', () => {
  it('offers a buy decision on an unowned property', () => {
    const p = makePlayer({ position: 1 }) // mediterranean
    const storage = makeStorage({ players: [p] })
    const result = resolveLanding(storage, p)
    expect(result.action).toBe('can_buy')
    expect(storage.gamePhase).toBe('buy_decision')
  })

  it('charges rent to the owner and conserves money', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: 'player-1' }))
    const p0 = makePlayer({ id: 'player-0', position: 1, cash: 500 })
    const p1 = makePlayer({ id: 'player-1', cash: 500 })
    const storage = makeStorage({ players: [p0, p1], properties: Object.fromEntries(props) })
    const result = resolveLanding(storage, p0)
    expect(result.action).toBe('paid_rent')
    expect(result.amount).toBe(2)
    expect(totalCash([p0, p1])).toBe(1000)
  })

  it('collects tax from the player', () => {
    const p = makePlayer({ position: 4, cash: 500 }) // income tax $200
    const storage = makeStorage({ players: [p] })
    const result = resolveLanding(storage, p)
    expect(result.action).toBe('tax')
    expect(result.amount).toBe(200)
    expect(p.cash).toBe(300)
  })

  it('sends the player to jail from the Go To Jail tile', () => {
    const p0 = makePlayer({ id: 'player-0', position: 30 })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1] })
    const result = resolveLanding(storage, p0)
    expect(result.action).toBe('jail')
    expect(p0.inJail).toBe(true)
  })
})

describe('hasFullColorGroup', () => {
  it('is true only when every tile in the color group is owned', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: 'player-0' }))
    expect(hasFullColorGroup('player-0', 'mediterranean-avenue', props)).toBe(false)
    props.set('baltic-avenue', makeProperty('baltic-avenue', { ownerId: 'player-0' }))
    expect(hasFullColorGroup('player-0', 'mediterranean-avenue', props)).toBe(true)
  })

  it('is false for railroads and utilities', () => {
    const props = makePropertyMap()
    props.set('reading-railroad', makeProperty('reading-railroad', { ownerId: 'player-0' }))
    expect(hasFullColorGroup('player-0', 'reading-railroad', props)).toBe(false)
  })
})
