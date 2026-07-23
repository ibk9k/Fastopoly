import { NextRequest, NextResponse } from 'next/server'
import { cleanupInactiveRooms, findActiveUserRoom, INACTIVITY_THRESHOLD_MS, touchRoomActivity } from '@/lib/game-engine/room-cleanup'
import { readGameStorage } from '@/lib/game-engine/server-state'
import { getRequestUser, supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { roomCode, username } = (await req.json()) as { roomCode?: string; username?: string }
    if (!roomCode) {
      return NextResponse.json({ valid: false, error: 'Missing room code' }, { status: 400 })
    }

    // Sweep inactive rooms first
    void cleanupInactiveRooms(INACTIVITY_THRESHOLD_MS)

    const cutoffTime = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString()
    const { data, error } = await supabaseAdmin
      .from('public_rooms')
      .select('id, status')
      .eq('id', roomCode)
      .in('status', ['waiting', 'playing'])
      .gte('last_active_at', cutoffTime)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ valid: false, error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ valid: false, error: 'Room not found or expired due to inactivity' }, { status: 404 })
    }

    const storage = await readGameStorage(roomCode).catch(() => null)

    if (username) {
      const normalized = username.trim().toLowerCase()
      const players = storage?.players ?? []
      const user = await getRequestUser()
      const myUid = user?.id

      // The caller's existing seat, if any. Identity is the auth uid; a same-named
      // seat that hasn't been claimed yet also counts, so a player who reloads
      // between `init` and their first action can still get back in. claim-token
      // remains the actual security boundary — this check is only UX.
      const mySeat = players.find(
        (p) =>
          (myUid && p.authUserId === myUid) ||
          (!p.authUserId && p.username.trim().toLowerCase() === normalized),
      )
      const isAlreadySeated = Boolean(mySeat)

      if (data.status === 'playing' && !isAlreadySeated) {
        return NextResponse.json({ valid: false, error: 'This game has already started' }, { status: 400 })
      }

      // Prevent joining a second game if the user is already in another active game.
      if (myUid && !isAlreadySeated) {
        const existingActiveRoom = await findActiveUserRoom(myUid, roomCode)
        if (existingActiveRoom) {
          return NextResponse.json(
            { valid: false, error: `You are already in active game '${existingActiveRoom}'. You cannot join multiple games simultaneously.` },
            { status: 400 },
          )
        }
      }

      // Two players in one room may not share a display name — the board and log
      // would be unreadable. Compares against every seat that isn't the caller's.
      if (data.status === 'waiting' && !isAlreadySeated) {
        const nameTakenByOther = players.some(
          (p) => p !== mySeat && p.username.trim().toLowerCase() === normalized,
        )
        if (nameTakenByOther) {
          return NextResponse.json(
            { valid: false, error: `The username '${username}' is already taken in this room.` },
            { status: 400 },
          )
        }
      }
    } else if (data.status === 'playing') {
      return NextResponse.json({ valid: false, error: 'This game has already started' }, { status: 400 })
    }

    // Refresh last_active_at when a player joins
    void touchRoomActivity(roomCode)

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Validate lobby failed', error)
    return NextResponse.json({ valid: false, error: 'Unable to validate room' }, { status: 500 })
  }
}
