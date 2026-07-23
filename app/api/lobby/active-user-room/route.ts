import { NextResponse } from 'next/server'
import { findActiveUserRoom } from '@/lib/game-engine/room-cleanup'
import { getRequestUser } from '@/lib/supabase/server'

/**
 * Returns the room the CALLER is currently playing in, if any, so the client can
 * redirect them back into it. Identity comes from the session cookie — an earlier
 * version took a `?username=` parameter, which let anyone probe whether a given
 * display name was in a game.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getRequestUser()
    if (!user) {
      return NextResponse.json({ activeRoomId: null })
    }

    const activeRoomId = await findActiveUserRoom(user.id)
    return NextResponse.json({ activeRoomId })
  } catch (error) {
    console.error('Check active user room error:', error)
    return NextResponse.json({ activeRoomId: null })
  }
}
