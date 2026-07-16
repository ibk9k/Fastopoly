import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlayer, readPlayerToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage } from '@/lib/game-engine/server-state'
import { resolveExpiredAuction } from '@/lib/game-engine/turn'

export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId } = (await req.json()) as { roomId?: string; playerId?: string }
    if (!roomId) return badRequest('Missing roomId')
    const token = readPlayerToken(req)

    const result = await mutateGameStorage(roomId, (storage) => {
      // Any seated player may trigger resolution; the expiry check + atomic
      // transaction make it idempotent under concurrent calls.
      authenticatePlayer(storage, roomId, playerId, token)

      const winnerId = storage.auctionHighestBidderId ?? null
      const amount = storage.auctionHighestBid ?? 0
      const resolved = resolveExpiredAuction(storage)
      if (!resolved) {
        return {
          success: true,
          resolvedByOther: true,
          skipWrite: true,
          message: 'Auction already resolved or game phase is not auction',
        }
      }
      return { success: true, winnerId, amount }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Auction resolution failed')
  }
}
