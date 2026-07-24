import { NextRequest, NextResponse } from 'next/server'
import { calculateScores } from '@/lib/game-engine/scoring'
import type { PlayerResult } from '@/lib/game-engine/scoring'
import type { Player, RoomEvent } from '@/lib/liveblocks.config'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { broadcastRoomEvent, mutateGameStorage, propertyMap } from '@/lib/game-engine/server-state'
import { enforceTurnTimeout } from '@/lib/game-engine/turn'
import { persistGameResults } from '@/lib/game-engine/persistence'

const activeEnforcements = new Map<string, { deadline: number; timestamp: number }>()

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    const token = readPlayerToken(req)

    // Concurrency guard: if an enforcement request was processed for this room within 2.5s, skip
    const now = Date.now()
    const lastLock = activeEnforcements.get(roomId)
    if (lastLock && now - lastLock.timestamp < 2500) {
      return NextResponse.json({ acted: false, skippedConcurrent: true })
    }
    activeEnforcements.set(roomId, { deadline: 0, timestamp: now })

    let results: PlayerResult[] | null = null
    let finalPlayers: Player[] = []
    const events: RoomEvent[] = []
    const enforced = await mutateGameStorage(roomId, (storage) => {
      // Only seated players may nudge the timer; the server clock is the actual gate.
      authenticatePlayer(storage, roomId, playerId, token)
      const acted = enforceTurnTimeout(storage, events)
      if (!acted) return { acted: false, skipWrite: true }
      if (storage.gamePhase === 'ended' && !storage.resultsPersisted) {
        storage.resultsPersisted = true
        results = calculateScores(storage.players, propertyMap(storage.properties))
        finalPlayers = storage.players
      }
      return { acted: true }
    })

    if (!enforced.acted) {
      activeEnforcements.delete(roomId)
    }

    if (enforced.acted) {
      await Promise.all(events.map((event) => broadcastRoomEvent(roomId, event)))
    }
    if (results) {
      await persistGameResults(roomId, results, finalPlayers)
    }

    return NextResponse.json(enforced)
  } catch (error) {
    if (req.json) {
      try {
        const body = (await req.json().catch(() => ({}))) as { roomId?: string }
        if (body.roomId) activeEnforcements.delete(body.roomId)
      } catch {
        // ignore
      }
    }
    return routeError(error, 'Turn enforcement failed')
  }
}
