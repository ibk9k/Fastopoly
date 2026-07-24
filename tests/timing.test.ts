import { describe, expect, it } from 'vitest'
import {
  AUCTION_DURATION_MS,
  AUCTION_EXTENSION_MS,
  DEBT_TIMEOUT_MS,
  TURN_TIMEOUT_MS,
  URGENT_THRESHOLD_SECONDS,
} from '@/lib/game-engine/timing'
import { DEBT_TIMEOUT_MS as reExportedDebt, TURN_TIMEOUT_MS as reExportedTurn } from '@/lib/game-engine/server-state'

describe('timing constants', () => {
  it('pins the player-facing durations', () => {
    expect(TURN_TIMEOUT_MS).toBe(25_000)
    expect(DEBT_TIMEOUT_MS).toBe(80_000)
    expect(AUCTION_DURATION_MS).toBe(30_000)
    expect(AUCTION_EXTENSION_MS).toBe(5_000)
  })

  it('re-exports the same values from server-state', () => {
    expect(reExportedTurn).toBe(TURN_TIMEOUT_MS)
    expect(reExportedDebt).toBe(DEBT_TIMEOUT_MS)
  })

  it('gives a player in debt longer than a normal turn', () => {
    expect(DEBT_TIMEOUT_MS).toBeGreaterThan(TURN_TIMEOUT_MS)
  })

  it('keeps the anti-snipe window well inside the auction length', () => {
    // Strictly less, not <=. If the extension equals the duration then every bid
    // lands "inside the final window" and re-arms the whole auction, so it never
    // ends while anyone keeps bidding — that shipped once and had to be reverted.
    expect(AUCTION_EXTENSION_MS).toBeLessThan(AUCTION_DURATION_MS / 2)
  })

  it('warns before time runs out, but not for most of the turn', () => {
    expect(URGENT_THRESHOLD_SECONDS).toBeGreaterThan(0)
    expect(URGENT_THRESHOLD_SECONDS * 1000).toBeLessThan(TURN_TIMEOUT_MS / 2)
  })
})
