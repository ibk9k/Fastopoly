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

  // These two bonus paths read fields (ownedColorGroups, bankruptciesCaused) that are never populated
  // during play, so in a real game they never fire. The scoring math honors them when set — Phase 6
  // decides whether to wire the fields up or delete the bonuses.
  it('honors the color-group and bankruptcies bonuses when the (currently-dead) fields are set', () => {
    const p0 = makePlayer({ id: 'player-0', cash: 1000, ownedColorGroups: ['brown'], bankruptciesCaused: 2 })
    const results = calculateScores([p0], makePropertyMap())
    // 500 + 25 + 50 (color group) + 2*30 (bankruptcies) = 635
    expect(results[0].pointsEarned).toBe(635)
  })
})
