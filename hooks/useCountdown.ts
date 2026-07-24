'use client'

import { useEffect, useState } from 'react'
import { serverNow, syncServerTime } from '@/lib/game-client/server-time'

/**
 * Ticks once a second and returns whole seconds remaining until `deadline`
 * (an epoch-ms timestamp on the SERVER's clock), clamped at zero. Returns null
 * when there is no active deadline. Shared by the dice turn timer, the debt
 * overlay, and the per-player timer in the dashboard so they all count in lockstep.
 */
export function useCountdown(deadline: number | undefined | null): number | null {
  const [now, setNow] = useState(() => serverNow())

  useEffect(() => {
    void syncServerTime().then(() => setNow(serverNow()))
    const interval = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!deadline || deadline <= 0) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
