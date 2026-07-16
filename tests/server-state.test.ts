import { describe, expect, it } from 'vitest'
import { endTurn, handlePostLanding } from '@/lib/game-engine/server-state'
import { resolveLanding } from '@/lib/game-engine/actions'
import { makePlayer, makeStorage } from './factories'

describe('endTurn — win detection', () => {
  it('ends the game when only one non-bankrupt player remains', () => {
    const p0 = makePlayer({ id: 'player-0' })
    const p1 = makePlayer({ id: 'player-1', isBankrupt: true })
    const storage = makeStorage({ players: [p0, p1], currentPlayerIndex: 0 })
    endTurn(storage)
    expect(storage.gamePhase).toBe('ended')
    expect(storage.winnerIds).toEqual(['player-0'])
  })
})

describe('endTurn — debt limbo', () => {
  it('keeps a negative-cash player active instead of advancing', () => {
    const p0 = makePlayer({ id: 'player-0', cash: -50 })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1], currentPlayerIndex: 0 })
    endTurn(storage)
    expect(storage.currentPlayerIndex).toBe(0)
    expect(storage.gamePhase).toBe('playing')
    expect(storage.log.at(-1)?.message).toContain('in debt')
  })
})

describe('endTurn — doubles', () => {
  it('grants another roll and does not advance the turn', () => {
    const p0 = makePlayer({ id: 'player-0' })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1], currentPlayerIndex: 0, lastRollWasDoubles: true, hasRolled: true })
    endTurn(storage)
    expect(storage.currentPlayerIndex).toBe(0)
    expect(storage.hasRolled).toBe(false)
    expect(storage.lastRollWasDoubles).toBe(false)
  })
})

describe('endTurn — normal advance', () => {
  it('advances to the next player and resets hasRolled', () => {
    const storage = makeStorage({
      players: [makePlayer({ id: 'player-0' }), makePlayer({ id: 'player-1' })],
      currentPlayerIndex: 0,
      hasRolled: true,
    })
    endTurn(storage)
    expect(storage.currentPlayerIndex).toBe(1)
    expect(storage.hasRolled).toBe(false)
  })

  it('skips bankrupt players when advancing', () => {
    const storage = makeStorage({
      players: [
        makePlayer({ id: 'player-0' }),
        makePlayer({ id: 'player-1', isBankrupt: true }),
        makePlayer({ id: 'player-2' }),
      ],
      currentPlayerIndex: 0,
    })
    endTurn(storage)
    expect(storage.currentPlayerIndex).toBe(2)
  })
})

describe('handlePostLanding', () => {
  it('returns to the playing phase after a normal landing', () => {
    const storage = makeStorage({ gamePhase: 'landed', lastRollWasDoubles: false })
    handlePostLanding(storage)
    expect(storage.gamePhase).toBe('playing')
  })

  it('re-arms the roll on doubles', () => {
    const storage = makeStorage({ gamePhase: 'landed', lastRollWasDoubles: true, hasRolled: true })
    handlePostLanding(storage)
    expect(storage.hasRolled).toBe(false)
    expect(storage.lastRollWasDoubles).toBe(false)
  })
})

describe('known bug: go-to-jail on doubles grants an extra roll', () => {
  // BUG(Phase 3): landing on Go-To-Jail routes through endTurn, which still sees lastRollWasDoubles
  // and re-arms the roll — the jailed player wrongly gets to roll again. Documenting current behavior.
  it('CURRENTLY re-arms the roll for a player who was just jailed on doubles', () => {
    const p0 = makePlayer({ id: 'player-0', position: 30 })
    const p1 = makePlayer({ id: 'player-1' })
    const storage = makeStorage({ players: [p0, p1], currentPlayerIndex: 0, lastRollWasDoubles: true, hasRolled: true })
    resolveLanding(storage, p0)
    expect(p0.inJail).toBe(true)
    expect(storage.currentPlayerIndex).toBe(0) // still their turn
    expect(storage.hasRolled).toBe(false) // wrongly re-armed
  })

  it.todo('going to jail must forfeit the remainder of the turn even on doubles — Phase 3')
})
