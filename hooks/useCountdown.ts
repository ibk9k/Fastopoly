'use client'

import { useEffect, useState } from 'react'

/**
 * Ticks once a second and returns whole seconds remaining until `deadline`
 * (an epoch-ms timestamp), clamped at zero. Returns null when there is no
 * active deadline. Shared by the dice turn timer, the debt overlay, and the
 * per-player timer in the dashboard so they all count in lockstep.
 */
export function useCountdown(deadline: number | undefined | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (!deadline || deadline <= 0) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
