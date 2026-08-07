import { NextRequest, NextResponse } from 'next/server'
import { touchRoomActivity } from '@/lib/game-engine/room-cleanup'
import { countActiveUsers, readGameStorage } from '@/lib/game-engine/server-state'

/**
 * Keeps a room out of the inactivity sweep, and reconciles the two figures the
 * public games list advertises: how many players are in the room, and how many it
 * holds.
 *
 * Both are read server-side, never taken from the request body — this row is shown
 * to strangers browsing the lobby, so a client-supplied count would be trivially
 * spoofable.
 *
 * Reconciling here rather than only on change is deliberate. `player_count` was
 * written once at creation as a literal 1 and never updated; `max_players` was
 * written once from the creation rules, so a host who later lowered the cap kept
 * advertising the old number. Refreshing both on the heartbeat means a room that
 * drifted — including every room that existed before this fix — repairs itself
 * within one interval instead of staying wrong until someone touches the setting.
 */
export async function POST(req: NextRequest) {
  try {
    const { roomCode } = (await req.json()) as { roomCode?: string }
    if (!roomCode) {
      return NextResponse.json({ error: 'Missing roomCode' }, { status: 400 })
    }

    const [playerCount, storage] = await Promise.all([
      countActiveUsers(roomCode),
      readGameStorage(roomCode).catch(() => null),
    ])

    const maxPlayers =
      typeof storage?.rules?.maxPlayers === 'number' ? storage.rules.maxPlayers : null

    await touchRoomActivity(roomCode, playerCount, maxPlayers)
    return NextResponse.json({ ok: true, playerCount, maxPlayers })
  } catch (error) {
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 })
  }
}
