import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { PlayerResult } from '@/lib/game-engine/scoring'
import type { Player } from '@/lib/liveblocks.config'
import { authenticateHost, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { persistGameResults } from '@/lib/game-engine/persistence'

export async function POST(req: NextRequest) {
  try {
    const { roomId } = (await req.json()) as { roomId?: string }
    if (!roomId) return badRequest('Missing roomId')
    authenticateHost(roomId, readPlayerToken(req))

    let results: PlayerResult[] = []
    let finalPlayers: Player[] = []
    let alreadyPersisted = false
    await mutateGameStorage(roomId, (storage) => {
      results = calculateScores(storage.players, propertyMap(storage.properties))
      finalPlayers = storage.players
      storage.gamePhase = 'ended'
      storage.winnerIds = results.filter((result) => result.placement === 1).map((result) => result.playerId)
      alreadyPersisted = Boolean(storage.resultsPersisted)
      storage.resultsPersisted = true
    })

    // Idempotent: only the first caller to flip resultsPersisted writes to Supabase.
    if (!alreadyPersisted) {
      await persistGameResults(roomId, results, finalPlayers)
    }

    return NextResponse.json({ results })
  } catch (error) {
    return routeError(error, 'End game failed')
  }
}
