import { supabaseAdmin } from '@/lib/supabase/server'
import { getLiveblocksServer, liveblocksRoomId } from './server-state'

/** Default inactivity threshold: 5 minutes (300,000 milliseconds) */
export const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Sweeps the database for rooms inactive for longer than `thresholdMs` (default 5 minutes),
 * completely deletes their records from Supabase public_rooms, and deletes their Liveblocks
 * storage documents backend-side so no resources are consumed.
 */
export async function cleanupInactiveRooms(thresholdMs: number = INACTIVITY_THRESHOLD_MS): Promise<string[]> {
  try {
    const cutoffTime = new Date(Date.now() - thresholdMs).toISOString()

    // Find all rooms where last_active_at is older than cutoffTime
    const { data: inactiveRooms, error: selectError } = await supabaseAdmin
      .from('public_rooms')
      .select('id')
      .lt('last_active_at', cutoffTime)

    if (selectError || !inactiveRooms || inactiveRooms.length === 0) {
      return []
    }

    const roomIds = inactiveRooms.map((r) => r.id)

    // 1. Delete rows from Supabase public_rooms table
    const { error: deleteError } = await supabaseAdmin
      .from('public_rooms')
      .delete()
      .in('id', roomIds)

    if (deleteError) {
      console.error('Failed to delete inactive public_rooms from Supabase', deleteError)
    }

    // 2. Delete Liveblocks backend rooms & storage documents
    const server = getLiveblocksServer()
    await Promise.all(
      roomIds.map(async (roomId) => {
        try {
          const rid = liveblocksRoomId(roomId)
          if (typeof server.deleteRoom === 'function') {
            await server.deleteRoom(rid)
          }
        } catch {
          // Ignore if room was already deleted or missing in Liveblocks
        }
      }),
    )

    return roomIds
  } catch (err) {
    console.error('Cleanup inactive rooms error:', err)
    return []
  }
}

/**
 * Touches the last_active_at timestamp for an active room in Supabase.
 */
export async function touchRoomActivity(
  roomId: string,
  playerCount?: number | null,
  maxPlayers?: number | null,
): Promise<void> {
  if (!roomId) return
  try {
    const patch: { last_active_at: string; player_count?: number; max_players?: number } = {
      last_active_at: new Date().toISOString(),
    }
    // Each figure is written only when the caller actually established it. Passing an
    // unknown value through would overwrite a good number with a wrong one.
    if (typeof playerCount === 'number' && playerCount >= 0) {
      patch.player_count = playerCount
    }
    if (typeof maxPlayers === 'number' && maxPlayers > 0) {
      patch.max_players = maxPlayers
    }
    await supabaseAdmin.from('public_rooms').update(patch).eq('id', roomId)
  } catch {
    // Ignore error
  }
}

/**
 * Checks whether a user is currently active in any game room other than `excludeRoomId`.
 * Returns that room's code, or null if the user is free to join/create.
 *
 * Keyed on the Supabase auth uid, NOT the display name: usernames are deliberately
 * non-unique, so name-matching let two players called "Alex" lock each other out of
 * the lobby. A room matches when the caller either hosts it (public_rooms.host_user_id)
 * or holds a live seat in it (player.authUserId).
 */
export async function findActiveUserRoom(
  authUserId: string,
  excludeRoomId?: string,
): Promise<string | null> {
  if (!authUserId) return null

  const cutoffTime = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString()

  // 1. Fetch active rooms from public_rooms
  const { data: activeRooms, error } = await supabaseAdmin
    .from('public_rooms')
    .select('id, host_user_id, status')
    .in('status', ['waiting', 'playing', 'private'])
    .gte('last_active_at', cutoffTime)

  if (error || !activeRooms || activeRooms.length === 0) {
    return null
  }

  const { readGameStorage } = await import('./server-state')

  for (const room of activeRooms) {
    // Exclude target room if specified (e.g. rejoining/validating the same room)
    if (excludeRoomId && room.id.toUpperCase() === excludeRoomId.toUpperCase()) {
      continue
    }

    // Host of a room they created but may not have taken a seat in yet.
    if (room.host_user_id && room.host_user_id === authUserId) {
      return room.id
    }

    // Check Liveblocks storage for a live (non-bankrupt) seat owned by this uid.
    try {
      const storage = await readGameStorage(room.id).catch(() => null)
      if (storage && storage.gamePhase !== 'ended' && storage.players) {
        const isSeated = storage.players.some((p) => !p.isBankrupt && p.authUserId === authUserId)
        if (isSeated) {
          return room.id
        }
      }
    } catch {
      // Ignore read error for an individual room
    }
  }

  return null
}
