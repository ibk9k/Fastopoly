import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { PlayerResult } from '@/lib/game-engine/scoring'
import type { Player } from '@/lib/liveblocks.config'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { endTurn, mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { persistGameResults } from '@/lib/game-engine/persistence'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    const token = readPlayerToken(req)

    let results: PlayerResult[] | null = null
    let finalPlayers: Player[] = []
    await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, playerId, token)
      // 'playing' only: after rolling the phase is 'landed', so the landing must be
      // resolved (rent/card/tax) before the turn can end — this closes the skip-rent exploit.
      assertGamePhase(storage, 'playing')
      assertIsActivePlayer(storage, caller.id)
      if (!storage.hasRolled) throw new Error('Roll before ending your turn')
      const activePlayer = storage.players[storage.currentPlayerIndex]
      if (activePlayer && activePlayer.cash < 0 && !activePlayer.isBankrupt) {
        throw new Error('Cannot end turn while in debt. Mortgage properties or declare bankruptcy.')
      }
      endTurn(storage)
      // Persist exactly once, when the game first reaches 'ended'.
      if (storage.gamePhase === 'ended' && !storage.resultsPersisted) {
        storage.resultsPersisted = true
        results = calculateScores(storage.players, propertyMap(storage.properties))
        finalPlayers = storage.players
      }
    })

    if (results) {
      await persistGameResults(roomId, results, finalPlayers)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'End turn failed')
  }
}
