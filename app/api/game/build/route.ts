import { NextRequest, NextResponse } from 'next/server'
import { COLOR_GROUPS, getTile } from '@/lib/game-engine/board'
import { hasFullColorGroup } from '@/lib/game-engine/actions'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, mutateGameStorage, propertyMap, toPropertyRecord } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, propertyId, action } = (await req.json()) as {
      roomId?: string
      playerId?: string
      propertyId?: string
      action?: 'build' | 'demolish'
    }
    if (!roomId || !playerId || !propertyId || !action) return badRequest('Missing build fields')
    const token = readPlayerToken(req)

    await mutateGameStorage(roomId, (storage) => {
      const player = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, ['playing', 'landed', 'buy_decision'])
      assertIsActivePlayer(storage, player.id)
      const tile = getTile(propertyId)
      const properties = propertyMap(storage.properties)
      const property = properties.get(propertyId)
      if (!tile || !property) throw new Error('Invalid player or property')
      if (property.ownerId !== player.id) throw new Error('Player does not own property')
      if (!hasFullColorGroup(player.id, propertyId, properties)) throw new Error('Full color group required')

      const groupIds = COLOR_GROUPS[tile.colorGroup ?? ''] ?? []
      const group = groupIds.map((id) => properties.get(id)).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

      if (action === 'build') {
        if (property.hotels > 0) throw new Error('Property already has a hotel')
        if (group.some((member) => member.mortgaged)) {
          throw new Error('Cannot build while any property in the color group is mortgaged')
        }
        const minBuildings = Math.min(...group.map((item) => item.hotels > 0 ? 5 : item.houses))
        const currentBuildings = property.hotels > 0 ? 5 : property.houses
        if (currentBuildings > minBuildings) throw new Error('Even building rule violation')
        if (property.houses === 4) {
          if ((storage.hotelSupply ?? 12) <= 0) throw new Error('No hotels available')
          const hotelCost = tile.hotelCost ?? 0
          if (player.cash < hotelCost) throw new Error('Insufficient cash to build')
          player.cash -= hotelCost
          property.houses = 0
          property.hotels = 1
          storage.houseSupply = (storage.houseSupply ?? 32) + 4
          storage.hotelSupply = (storage.hotelSupply ?? 12) - 1
          player.hasBuiltHotel = true
        } else {
          if ((storage.houseSupply ?? 32) <= 0) throw new Error('No houses available')
          const houseCost = tile.houseCost ?? 0
          if (player.cash < houseCost) throw new Error('Insufficient cash to build')
          player.cash -= houseCost
          property.houses += 1
          storage.houseSupply = (storage.houseSupply ?? 32) - 1
        }
        addLog(storage, `${player.username} built on ${tile.name}.`)
      } else {
        const maxBuildings = Math.max(...group.map((item) => item.hotels > 0 ? 5 : item.houses))
        const currentBuildings = property.hotels > 0 ? 5 : property.houses
        if (currentBuildings === 0 || currentBuildings < maxBuildings) throw new Error('Even demolish rule violation')
        if (property.hotels > 0) {
          // Demolishing a hotel puts 4 houses back on the lot — the bank must have them.
          if ((storage.houseSupply ?? 32) < 4) throw new Error('Not enough houses in the bank to break up a hotel')
          property.hotels = 0
          property.houses = 4
          player.cash += Math.floor((tile.hotelCost ?? 0) / 2)
          storage.hotelSupply = (storage.hotelSupply ?? 12) + 1
          storage.houseSupply = (storage.houseSupply ?? 32) - 4
        } else {
          property.houses -= 1
          player.cash += Math.floor((tile.houseCost ?? 0) / 2)
          storage.houseSupply = (storage.houseSupply ?? 32) + 1
        }
        addLog(storage, `${player.username} demolished on ${tile.name}.`)
      }

      storage.properties = toPropertyRecord(properties)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Build failed')
  }
}
