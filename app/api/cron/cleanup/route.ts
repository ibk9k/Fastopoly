import { NextRequest, NextResponse } from 'next/server'
import { cleanupInactiveRooms, INACTIVITY_THRESHOLD_MS } from '@/lib/game-engine/room-cleanup'

/**
 * Scheduled sweep of inactive rooms (see vercel.json `crons`).
 *
 * Deployment platforms invoke this with `Authorization: Bearer $CRON_SECRET`.
 * Without CRON_SECRET set the route refuses to run at all rather than exposing an
 * unauthenticated delete-by-side-effect endpoint to the internet.
 *
 * `/api/lobby/list` still sweeps opportunistically, which is what actually keeps
 * rooms tidy on plans whose cron frequency is too coarse for a 5-minute threshold.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const deleted = await cleanupInactiveRooms(INACTIVITY_THRESHOLD_MS)
    return NextResponse.json({ deleted: deleted.length, roomIds: deleted })
  } catch (error) {
    console.error('Cron cleanup failed', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
