import { describe, expect, it } from 'vitest'
import { calculateScores } from '@/lib/game-engine/scoring'
import { makePlayer, makeProperty, makePropertyMap } from './factories'

describe('calculateScores', () => {
  it('ranks by net worth (cash + $10/property) with bankrupt players last', () => {
    const rich = makePlayer({ id: 'player-0', username: 'Rich', cash: 1000 })
    const poor = makePlayer({ id: 'player-1', username: 'Poor', cash: 200 })
    const broke = makePlayer({ id: 'player-2', username: 'Broke', cash: 0, isBankrupt: true })
    const results = calculateScores([poor, broke, rich], makePropertyMap())
    expect(results.map((r) => r.username)).toEqual(['Rich', 'Poor', 'Broke'])
    expect(results[0].placement).toBe(1)
  })

  it('awards placement points plus a 25 base (1st = 525)', () => {
    const p0 = makePlayer({ id: 'player-0', cash: 1000 })
    const p1 = makePlayer({ id: 'player-1', cash: 100 })
    const results = calculateScores([p0, p1], makePropertyMap())
    expect(results[0].pointsEarned).toBe(525) // 500 + 25
    expect(results[1].pointsEarned).toBe(225) // 200 + 25
  })

  it('adds a hotel bonus when the player owns a property with a hotel', () => {
    const props = makePropertyMap()
    props.set('boardwalk', makeProperty('boardwalk', { ownerId: 'player-0', hotels: 1 }))
    const p0 = makePlayer({ id: 'player-0', cash: 1000, properties: ['boardwalk'] })
    const p1 = makePlayer({ id: 'player-1', cash: 100 })
    const results = calculateScores([p0, p1], props)
    expect(results[0].pointsEarned).toBe(575) // 525 + 50 hotel bonus
    expect(results[0].bonuses).toContain('Built at least one hotel')
  })

  // Phase 6: the color-group bonus is derived from real board ownership, and bankruptciesCaused
  // is now incremented by executeBankruptcy — both fire in a real game.
  it('awards the color-group bonus for actually owning a full group', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: 'player-0' }))
    props.set('baltic-avenue', makeProperty('baltic-avenue', { ownerId: 'player-0' }))
    const p0 = makePlayer({ id: 'player-0', cash: 1000, properties: ['mediterranean-avenue', 'baltic-avenue'] })
    const results = calculateScores([p0], props)
    expect(results[0].pointsEarned).toBe(575) // 525 + 50 color group
    expect(results[0].bonuses).toContain('Owned a full color group')
  })

  it('does not award the color-group bonus for a partial group', () => {
    const props = makePropertyMap()
    props.set('mediterranean-avenue', makeProperty('mediterranean-avenue', { ownerId: 'player-0' }))
    const p0 = makePlayer({ id: 'player-0', cash: 1000, properties: ['mediterranean-avenue'] })
    const results = calculateScores([p0], props)
    expect(results[0].pointsEarned).toBe(525)
  })

  it('awards the bankruptcies bonus from bankruptciesCaused', () => {
    const p0 = makePlayer({ id: 'player-0', cash: 1000, bankruptciesCaused: 2 })
    const results = calculateScores([p0], makePropertyMap())
    expect(results[0].pointsEarned).toBe(585) // 525 + 2*30
    expect(results[0].bonuses).toContain('Bankrupted 2 players')
  })
})
