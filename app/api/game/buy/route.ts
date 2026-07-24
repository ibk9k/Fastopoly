import { NextRequest, NextResponse } from 'next/server'
import { getTile } from '@/lib/game-engine/board'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, handlePostLanding, mutateGameStorage } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, propertyId } = (await req.json()) as { roomId?: string; playerId?: string; propertyId?: string }
    if (!roomId || !playerId || !propertyId) return badRequest('Missing buy fields')
    const token = readPlayerToken(req)

    const result = await mutateGameStorage(roomId, (storage) => {
      const player = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, ['buy_decision', 'landed'])
      assertIsActivePlayer(storage, player.id)

      const property = storage.properties[propertyId]
      const tile = getTile(propertyId)
      if (!tile?.price || !property) throw new Error('Invalid property')
      if (property.ownerId) throw new Error('Property already owned')
      if (player.cash < tile.price) throw new Error('Insufficient cash')

      player.cash -= tile.price
      property.ownerId = player.id
      player.properties = [...player.properties, propertyId]
      addLog(storage, `${player.username} bought ${tile.name} for $${tile.price}.`)

      handlePostLanding(storage)
      return { success: true }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Buy failed')
  }
}
