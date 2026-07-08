import { NextRequest, NextResponse } from 'next/server'
import { BOARD } from '@/lib/game-engine/board'
import { assertGamePhase, assertIsActivePlayer } from '@/lib/game-engine/guards'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { addLog, endTurn, mutateGameStorage } from '@/lib/game-engine/server-state'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')

    await mutateGameStorage(roomId, (storage) => {
      assertGamePhase(storage, 'buy_decision')
      assertIsActivePlayer(storage, playerId)

      const player = storage.players[storage.currentPlayerIndex]
      if (storage.rules.auctionOnPass) {
        const tile = BOARD[player.position]
        addLog(storage, `${player.username} passed on buying. Property goes to auction.`)
        storage.gamePhase = 'auction'
        storage.auctionPropertyId = tile?.id ?? null
        storage.auctionBids = []
        storage.auctionHighestBid = 10
        storage.auctionHighestBidderId = null
        storage.auctionEndTime = Date.now() + 30000
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
