import { NextRequest, NextResponse } from 'next/server'
import { authenticateHost, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, mutateGameStorage } from '@/lib/game-engine/server-state'

/**
 * Host-only seat recovery: clears a seat's `tokenClaimed` flag so a player who
 * lost their localStorage token can re-claim it. Mitigates the documented
 * claim-once lockout (see claim-token/route.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')
    authenticateHost(roomId, readPlayerToken(req))

    await mutateGameStorage(roomId, (storage) => {
      const player = storage.players.find((candidate) => candidate.id === playerId)
      if (!player) throw new Error('No such seat in this room')
      player.tokenClaimed = false
      addLog(storage, `The host reopened ${player.username}'s seat for recovery.`)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Seat release failed')
  }
}
