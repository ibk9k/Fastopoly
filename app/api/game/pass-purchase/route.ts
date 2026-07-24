import { NextRequest, NextResponse } from 'next/server'
import { BOARD } from '@/lib/game-engine/board'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'
import { AUCTION_DURATION_MS } from '@/lib/game-engine/timing'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')
    const token = readPlayerToken(req)

    await mutateGameStorage(roomId, (storage) => {
      const caller = authenticatePlayer(storage, roomId, playerId, token)
      assertGamePhase(storage, 'buy_decision')
      assertIsActivePlayer(storage, caller.id)

      const player = storage.players[storage.currentPlayerIndex]
      if (storage.rules.auctionOnPass) {
        const tile = BOARD[player.position]
        addLog(storage, `${player.username} passed on buying. Property goes to auction.`)
        storage.gamePhase = 'auction'
        storage.auctionPropertyId = tile?.id ?? null
        storage.auctionBids = []
        storage.auctionHighestBid = 10
        storage.auctionHighestBidderId = null
        storage.auctionEndTime = Date.now() + AUCTION_DURATION_MS
      } else {
        addLog(storage, `${player.username} passed on buying.`)
        endTurn(storage)
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return routeError(error, 'Pass purchase failed')
  }
}
