import { NextRequest, NextResponse } from 'next/server'
import { getTile } from '@/lib/game-engine/board'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, endTurn, handlePostLanding, mutateGameStorage, propertyMap, toPropertyRecord } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId } = (await req.json()) as { roomId?: string }
    if (!roomId) return badRequest('Missing roomId')

    const result = await mutateGameStorage(roomId, (storage) => {
      if (storage.gamePhase !== 'auction') {
        return {
          success: true,
          resolvedByOther: true,
          skipWrite: true,
          message: 'Auction already resolved or game phase is not auction',
        }
      }

      const propertyId = storage.auctionPropertyId
      if (!propertyId) throw new Error('No auction property set')

      const tile = getTile(propertyId)
      const properties = propertyMap(storage.properties)
      const property = properties.get(propertyId)
      if (!tile || !property) throw new Error('Invalid property')

      // Validate expiration
      const now = Date.now()
      const endTime = storage.auctionEndTime ?? 0
      // Allow 500ms grace period for network latency
      if (now < endTime - 500) {
        throw new Error('Auction is still in progress')
      }

      const winnerId = storage.auctionHighestBidderId
      const finalBidAmount = storage.auctionHighestBid ?? 0

      if (winnerId) {
        const winnerPlayer = storage.players.find((p) => p.id === winnerId)
        if (!winnerPlayer) throw new Error('Winner player not found')
        if (winnerPlayer.cash < finalBidAmount) {
          throw new Error(`Winner ${winnerPlayer.username} does not have enough cash to complete purchase`)
        }

        // Complete purchase
        winnerPlayer.cash -= finalBidAmount
        property.ownerId = winnerPlayer.id
        winnerPlayer.properties = [...winnerPlayer.properties, propertyId]
        storage.properties = toPropertyRecord(properties)

        addLog(storage, `Auction complete! ${winnerPlayer.username} won ${tile.name} for $${finalBidAmount}.`)
      } else {
        addLog(storage, `Auction complete! ${tile.name} had no bids and remains unowned.`)
      }

      // Reset auction state
      storage.auctionPropertyId = null
      storage.auctionHighestBid = 0
      storage.auctionHighestBidderId = null
      storage.auctionEndTime = 0
      storage.auctionBids = []

      // Reset gamePhase to playing to allow active player to finish their turn, handling doubles
      handlePostLanding(storage)

      return {
        success: true,
        winnerId,
        amount: finalBidAmount,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Auction resolution failed')
  }
}
