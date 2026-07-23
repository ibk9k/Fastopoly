import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { PlayerResult } from '@/lib/game-engine/scoring'
import type { Player, RoomEvent } from '@/lib/liveblocks.config'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { broadcastRoomEvent, mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { enforceTurnTimeout } from '@/lib/game-engine/turn'
import { persistGameResults } from '@/lib/game-engine/persistence'

/** How long one enforcement suppresses further auto-enforcement for the same room. */
const ENFORCEMENT_LOCK_MS = 2_500

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    const token = readPlayerToken(req)

    let results: PlayerResult[] | null = null
    let finalPlayers: Player[] = []
    const events: RoomEvent[] = []

    const enforced = await mutateGameStorage(roomId, (storage) => {
      // Only seated players may nudge the timer; the server clock is the actual gate.
      authenticatePlayer(storage, roomId, playerId, token)

      // Concurrency guard. The lock lives in storage rather than module memory:
      // serverless instances share no memory, so an in-process lock would be granted
      // once per instance and the room could be auto-rolled twice. Reading and
      // stamping it inside mutateGameStorage's transaction makes it a real
      // check-and-set. (The refreshed turnDeadline is a second line of defence.)
      const now = Date.now()
      if ((storage.enforcementLockUntil ?? 0) > now) {
        return { acted: false, skippedConcurrent: true, skipWrite: true }
      }

      const acted = enforceTurnTimeout(storage, events)
      if (!acted) return { acted: false, skipWrite: true }

      storage.enforcementLockUntil = now + ENFORCEMENT_LOCK_MS

      if (storage.gamePhase === 'ended' && !storage.resultsPersisted) {
        storage.resultsPersisted = true
        results = calculateScores(storage.players, propertyMap(storage.properties))
        finalPlayers = storage.players
      }
      return { acted: true }
    })

    if (enforced.acted) {
      await Promise.all(events.map((event) => broadcastRoomEvent(roomId, event)))
    }
    if (results) {
      await persistGameResults(roomId, results, finalPlayers)
    }

    return NextResponse.json(enforced)
  } catch (error) {
    return routeError(error, 'Turn enforcement failed')
  }
}
