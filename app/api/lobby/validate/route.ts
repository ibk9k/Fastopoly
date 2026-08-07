import { NextRequest, NextResponse } from 'next/server'
import { cleanupInactiveRooms, findActiveUserRoom, INACTIVITY_THRESHOLD_MS, touchRoomActivity } from '@/lib/game-engine/room-cleanup'
import { listActiveUserIds, readGameStorage } from '@/lib/game-engine/server-state'
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
      .select('id, status, max_players')
      .eq('id', roomCode)
      // 'private' belongs here: it is a lobby that simply isn't advertised in the
      // public list. Omitting it made a room unjoinable the moment the host flipped
      // the visibility toggle — players who reloaded were told the room did not
      // exist, and they could not start a fresh game either, because
      // findActiveUserRoom does count 'private' and kept them "already in a game".
      .in('status', ['waiting', 'playing', 'private'])
      .gte('last_active_at', cutoffTime)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ valid: false, error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ valid: false, error: 'Room not found or expired due to inactivity' }, { status: 404 })
    }

    const storage = await readGameStorage(roomCode).catch(() => null)
    // A private room is still a lobby; only 'playing' means the game has begun.
    // Every pre-game check below keys on this rather than on 'waiting' alone.
    const isOpenLobby = data.status === 'waiting' || data.status === 'private'

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

      // Capacity. Nothing enforced this before: `maxPlayers` was a rule the lobby
      // displayed and the room ignored, so a 2-player game could be joined by a
      // third. It cannot be counted from `storage.players`, which stays empty until
      // `init` freezes the seats — lobby occupancy lives in Liveblocks presence.
      //
      // Counts everyone EXCEPT the caller. In the lobby `isAlreadySeated` is always
      // false (there are no seats yet), so without this a player who reloads their
      // own full lobby would be told the room is full and locked out of their own
      // game — their previous connection lingers for a moment after the reload.
      //
      // Fails open: if presence is unavailable, let the join through rather than
      // sealing every room over an API hiccup. `init` is the real backstop.
      if (isOpenLobby && !isAlreadySeated) {
        const capacity = storage?.rules?.maxPlayers ?? data.max_players ?? null
        const activeIds = await listActiveUserIds(roomCode)
        const others = myUid
          ? activeIds?.filter((id) => id !== `user-${myUid}`)
          : activeIds
        if (typeof capacity === 'number' && others && others.length >= capacity) {
          return NextResponse.json(
            { valid: false, error: `This room is full (${others.length}/${capacity} players).` },
            { status: 400 },
          )
        }
      }

      // Two players in one room may not share a display name — the board and log
      // would be unreadable. Compares against every seat that isn't the caller's.
      if (isOpenLobby && !isAlreadySeated) {
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
