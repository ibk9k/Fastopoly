import { NextRequest, NextResponse } from 'next/server'
import { AuthError, signGameToken } from '@/lib/game-engine/auth'
import { badRequest, routeError } from '@/lib/game-engine/route-utils'
import { mutateGameStorage } from '@/lib/game-engine/server-state'
import { getRequestUser } from '@/lib/supabase/server'

/**
 * Claim-once issuance of a player's action token.
 *
 * The seat is bound to the caller's authenticated Supabase user id, read from the
 * session cookie — never from the request body. This closes the old hole where the
 * claim was gated on the username (public in storage), which let an attacker who
 * claimed first steal a seat. It also makes seat recovery automatic: the same signed-in
 * user always reclaims their own seat, even from a new device or after clearing storage.
 *
 * Guests are anonymous Supabase users, so they get the same guarantee.
 */
export async function POST(req: NextRequest) {
  try {
    const { roomId, playerId, username } = (await req.json()) as {
      roomId?: string
      playerId?: string
      username?: string
    }
    if (!roomId || !playerId) return badRequest('Missing roomId or playerId')

    const user = await getRequestUser()
    if (!user) throw new AuthError('Sign in (or play as guest) before joining a game')

    const result = await mutateGameStorage(roomId, (storage) => {
      const player = storage.players.find((candidate) => candidate.id === playerId)
      if (!player) throw new AuthError('No such seat in this room')

      // Already owned by this user → re-issue (reconnect / new device / cleared storage).
      if (player.authUserId && player.authUserId !== user.id) {
        throw new AuthError('This seat belongs to another player')
      }
      // Legacy seats claimed before accounts fall back to the username check once.
      if (!player.authUserId && player.tokenClaimed && username && player.username !== username) {
        throw new AuthError('This seat has already been claimed')
      }

      player.authUserId = user.id
      player.tokenClaimed = true
      return { token: signGameToken(roomId, playerId) }
    })

    return NextResponse.json(result)
  } catch (error) {
    return routeError(error, 'Token claim failed')
  }
}
