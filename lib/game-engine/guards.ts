import type { GamePhase, JsonStorage } from '@/lib/liveblocks.config'

export function assertIsActivePlayer(storage: JsonStorage, playerId: string): void {
  const activePlayer = storage.players[storage.currentPlayerIndex]
  if (!activePlayer || activePlayer.id !== playerId || activePlayer.isBankrupt) {
    throw new Error('Not the active player')
  }
}

export function assertGamePhase(storage: JsonStorage, expected: GamePhase | GamePhase[]): void {
  const expectedPhases = Array.isArray(expected) ? expected : [expected]
  if (!expectedPhases.includes(storage.gamePhase)) {
    throw new Error(`Expected game phase ${expectedPhases.join(' or ')}`)
  }
}
