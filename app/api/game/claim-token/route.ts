import { NextRequest, NextResponse } from 'next/server'
import { AuthError, signGameToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage } from '@/lib/game-engine/server-state'

/**
 * Claim-once issuance of a player's action token. The first caller to present a
 * seated playerId with the matching username receives the token and locks the seat
 * (`tokenClaimed`). The token is returned to the client only — never written to storage.
 *
 * Residual risk (accounts are out of scope): the claim is gated on the username, which
 * is public in storage, so an attacker who claims a seat before its legitimate player
 * could take it. This still strictly improves on the previous "any body playerId works"
 * model and is documented for the Phase 7 seat-recovery follow-up.
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, username } = (await req.json()) as {
      roomId?: string
      playerId?: string
      username?: string
    }
    if (!roomId || !playerId || !username) return badRequest('Missing roomId, playerId, or username')

    const result = await mutateGameStorage(roomId, (storage) => {
      const player = storage.players.find((candidate) => candidate.id === playerId)
      if (!player) throw new AuthError('No such seat in this room')
      if (player.username !== username) throw new AuthError('Username does not match this seat')
      if (player.tokenClaimed) throw new AuthError('This seat has already been claimed')
      player.tokenClaimed = true
      return { token: signGameToken(roomId, playerId) }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Token claim failed')
  }
}
