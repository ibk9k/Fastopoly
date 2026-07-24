import { NextResponse } from 'next/server'

/**
 * Authoritative clock. Every deadline in storage (turnDeadline, auctionEndTime) is
 * stamped with the server's Date.now(), so clients must measure against the same
 * clock — a player whose device clock is off by hours would otherwise see nonsense
 * countdowns and either never fire turn enforcement or fire it immediately.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
