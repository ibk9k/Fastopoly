import { NextRequest, NextResponse } from 'next/server'
import { getTile } from '@/lib/game-engine/board'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, mutateGameStorage } from '@/lib/game-engine/server-state'
import { AUCTION_EXTENSION_MS } from '@/lib/game-engine/timing'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, increment } = (await req.json()) as {
      roomId?: string
      playerId?: string
      increment?: number
    }
    if (!roomId || !playerId || increment === undefined) {
      return badRequest('Missing auction bid fields')
    }

    if (![2, 10, 50].includes(increment)) {
      return badRequest('Invalid bid increment. Must be 2, 10, or 50')
    }
    const token = readPlayerToken(req)

    const result = await mutateGameStorage(roomId, (storage) => {
      assertGamePhase(storage, 'auction')

      const propertyId = storage.auctionPropertyId
      if (!propertyId) throw new Error('No auction property set')

      const tile = getTile(propertyId)
      if (!tile) throw new Error('Invalid property')

      // Validate the bidder
      const bidder = authenticatePlayer(storage, roomId, playerId, token)
      if (bidder.isBankrupt) throw new Error('Bankrupt players cannot bid')

      // Check if the timer has already expired
      const now = Date.now()
      const endTime = storage.auctionEndTime ?? 0
      if (now >= endTime) {
        throw new Error('The auction has already ended')
      }

      // Calculate the new bid
      const currentHighest = storage.auctionHighestBid ?? 0
      const newBid = currentHighest + increment

      if (newBid > bidder.cash) {
        throw new Error(`Cannot bid ${newBid} - you only have $${bidder.cash} cash`)
      }

      // Record highest bid and bidder
      storage.auctionHighestBid = newBid
      storage.auctionHighestBidderId = bidder.id

      // Append to the list of bids history
      const existingBids = storage.auctionBids ?? []
      storage.auctionBids = [...existingBids, { playerId, amount: newBid, timestamp: now }]

      // Anti-sniping protection: a late bid pushes the deadline back out so there
      // is always room for a counter-bid.
      const timeRemaining = endTime - now
      if (timeRemaining < AUCTION_EXTENSION_MS) {
        storage.auctionEndTime = now + AUCTION_EXTENSION_MS
      }

      addLog(storage, `${bidder.username} bid $${newBid} on ${tile.name}.`)

      return {
        status: 'success',
        highestBid: storage.auctionHighestBid,
        highestBidderId: storage.auctionHighestBidderId,
        endTime: storage.auctionEndTime,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Auction bid failed')
  }
}
