'use client'

/**
 * Client-side view of the SERVER clock.
 *
 * All deadlines held in Liveblocks storage (`turnDeadline`, `auctionEndTime`) are
 * absolute epoch-ms stamped by the server. Comparing them against a browser's
 * `Date.now()` assumes the two clocks agree — which is false often enough to matter
 * once strangers are playing: a device that is even a few minutes off renders
 * absurd countdowns, and worse, decides wrongly when to fire turn enforcement.
 *
 * We measure the offset once on load and correct for it. Round-trip time is halved
 * out of the estimate, which is accurate to well under a second — far tighter than
 * the 1 s tick these timers display at.
 */

let offsetMs = 0
let syncPromise: Promise<void> | null = null

/** Epoch ms according to the server's clock. */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/** Current estimated offset (server − client) in ms. Exposed for diagnostics. */
export function serverClockOffsetMs(): number {
  return offsetMs
}

async function measureOnce(): Promise<void> {
  const sentAt = Date.now()
  const response = await fetch('/api/time', { cache: 'no-store' })
  const receivedAt = Date.now()
  if (!response.ok) return

  const { now } = (await response.json()) as { now?: number }
  if (typeof now !== 'number' || !Number.isFinite(now)) return

  // Assume the response was generated at the midpoint of the round trip.
  const roundTrip = receivedAt - sentAt
  offsetMs = now + roundTrip / 2 - receivedAt
}

/**
 * Syncs the offset. Safe to call from several components — the in-flight request is
 * shared, and a failure leaves the offset at its previous value (0 = trust the
 * local clock), so timers degrade to today's behaviour rather than breaking.
 */
export function syncServerTime(): Promise<void> {
  if (!syncPromise) {
    syncPromise = measureOnce()
      .catch(() => undefined)
      .finally(() => {
        syncPromise = null
      })
  }
  return syncPromise
}
