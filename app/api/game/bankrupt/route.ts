import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, broadcastRoomEvent, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    if (!playerId) return badRequest('Missing playerId')
    const token = readPlayerToken(req)

    await mutateGameStorage(roomId, (storage) => {
      // Auth makes this self-only; requiring the active turn keeps the endTurn() below correct.
      const player = authenticatePlayer(storage, roomId, playerId, token)
      assertIsActivePlayer(storage, player.id)
      if (player.isBankrupt) throw new Error('Player is already bankrupt')

      // Return all properties to the bank
      player.properties.forEach((propertyId) => {
        const property = storage.properties[propertyId]
        if (!property) return
        property.ownerId = null
        property.houses = 0
        property.hotels = 0
        property.mortgaged = false
      })

      player.properties = []
      player.cash = 0
      player.isBankrupt = true

      addLog(storage, `${player.username} declared bankruptcy.`)
      endTurn(storage)
    })

    await broadcastRoomEvent(roomId, { type: 'PLAYER_BANKRUPT', playerId, creditorId: 'bank' })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Bankruptcy failed')
  }
}
