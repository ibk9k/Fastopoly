import { describe, expect, it, vi } from 'vitest'
import { cleanupInactiveRooms, INACTIVITY_THRESHOLD_MS } from '@/lib/game-engine/room-cleanup'

vi.mock('@/lib/supabase/server', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          lt: vi.fn(() => Promise.resolve({ data: [{ id: 'STALE1' }, { id: 'STALE2' }], error: null })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    },
  }
})

vi.mock('@/lib/game-engine/server-state', () => {
  return {
    liveblocksRoomId: (id: string) => `fastopoly-${id}`,
    getLiveblocksServer: vi.fn(() => ({
      deleteRoom: vi.fn(() => Promise.resolve()),
    })),
  }
})

describe('room cleanup module', () => {
  it('defines 5-minute inactivity threshold', () => {
    expect(INACTIVITY_THRESHOLD_MS).toBe(5 * 60 * 1000)
  })

  it('identifies and deletes inactive rooms from Supabase and Liveblocks backend', async () => {
    const deletedIds = await cleanupInactiveRooms(INACTIVITY_THRESHOLD_MS)
    expect(deletedIds).toEqual(['STALE1', 'STALE2'])
  })
})
