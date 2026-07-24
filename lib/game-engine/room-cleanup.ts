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
export async function touchRoomActivity(roomId: string): Promise<void> {
  if (!roomId) return
  try {
    await supabaseAdmin
      .from('public_rooms')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', roomId)
  } catch {
    // Ignore error
  }
}

/**
 * Checks if a user is currently active in any game room other than `excludeRoomId`.
 * Returns the room code of the active room if found, or null if the user is free.
 */
export async function findActiveUserRoom(
  username: string,
  excludeRoomId?: string,
): Promise<string | null> {
  if (!username) return null
  const normalized = username.trim().toLowerCase()
  if (!normalized) return null

  const cutoffTime = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString()

  // 1. Fetch active rooms from public_rooms
  const { data: activeRooms, error } = await supabaseAdmin
    .from('public_rooms')
    .select('id, host_username, status')
    .in('status', ['waiting', 'playing'])
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

    // Check host username match
    if (room.host_username && room.host_username.trim().toLowerCase() === normalized) {
      return room.id
    }

    // Check Liveblocks storage for non-bankrupt seated players
    try {
      const storage = await readGameStorage(room.id).catch(() => null)
      if (storage && storage.gamePhase !== 'ended' && storage.players) {
        const isSeated = storage.players.some(
          (p) => !p.isBankrupt && p.username.trim().toLowerCase() === normalized,
        )
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
