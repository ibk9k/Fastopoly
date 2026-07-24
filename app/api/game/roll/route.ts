import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, rollDice, routeError } from '@/lib/game-engine/route-utils'
import { broadcastRoomEvent, mutateGameStorage } from '@/lib/game-engine/server-state'
import { applyRoll } from '@/lib/game-engine/turn'
import type { RoomEvent } from '@/lib/liveblocks.config'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')
    const token = readPlayerToken(req)

    const events: RoomEvent[] = []
    const result = await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, 'playing')
      assertIsActivePlayer(storage, caller.id)
      if (storage.hasRolled) throw new Error('You have already rolled this turn')
      if (caller.inJail) throw new Error('You are in jail — use a jail action to roll')

      // Movement AND landing resolution happen in this one transaction: there is no
      // separate /land call to replay, skip, or lose to a disconnect.
      const [d1, d2] = rollDice()
      return applyRoll(storage, d1, d2, events)
    })

    await broadcastRoomEvent(roomId, { type: 'DICE_ROLLED', playerId, dice: result.dice })
    await Promise.all(events.map((event) => broadcastRoomEvent(roomId, event)))
    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Roll failed')
  }
}
