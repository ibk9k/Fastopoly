import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { PlayerResult } from '@/lib/game-engine/scoring'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { enforceTurnTimeout } from '@/lib/game-engine/turn'
import { persistGameResults } from '@/lib/game-engine/persistence'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    const token = readPlayerToken(req)

    let results: PlayerResult[] | null = null
    const enforced = await mutateGameStorage(roomId, (storage) => {
      // Only seated players may nudge the timer; the server clock is the actual gate.
      authenticatePlayer(storage, roomId, playerId, token)
      const acted = enforceTurnTimeout(storage)
      if (!acted) return { acted: false, skipWrite: true }
      if (storage.gamePhase === 'ended' && !storage.resultsPersisted) {
        storage.resultsPersisted = true
        results = calculateScores(storage.players, propertyMap(storage.properties))
      }
      return { acted: true }
    })

    if (results) {
      await persistGameResults(roomId, results)
    }

    return NextResponse.json(enforced)
  } catch (error) {
    return routeError(error, 'Turn enforcement failed')
  }
}
