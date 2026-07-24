'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelf, useOthers, useStorage } from '@/lib/liveblocks.config'
import { postJson } from '@/components/game/helpers'

type TurnTimerProps = {
  roomId: string
  selfPlayerId: string | undefined
  isActivePlayer: boolean
}

function formatClock(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`
}

const GRACE_MS = 2000

/**
 * Shows the active player's remaining time and, once the deadline lapses, asks
 * the server to auto-skip them. Only one designated seat per room sends the request
 * to prevent duplicate concurrent rolls.
 */
export default function TurnTimer({ roomId, selfPlayerId, isActivePlayer }: TurnTimerProps) {
  const gamePhase = useStorage((root) => root.gamePhase)
  const turnDeadline = useStorage((root) => root.turnDeadline) ?? 0
  const self = useSelf()
  const others = useOthers()
  const [now, setNow] = useState(() => Date.now())
  const lastEnforcedDeadlineRef = useRef<number>(0)
  const lastEnforceTimeRef = useRef<number>(0)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const runnablePhase = gamePhase === 'playing' || gamePhase === 'buy_decision' || gamePhase === 'landed'
  const remainingMs = turnDeadline - now

  // Only one designated client per room sends the enforcement HTTP request:
  // Active player if present; otherwise the connected peer with the lowest connectionId.
  const isDesignatedEnforcer = useMemo(() => {
    if (isActivePlayer) return true
    const everyone = [
      ...(self ? [{ connectionId: self.connectionId }] : []),
      ...others.map((o) => ({ connectionId: o.connectionId })),
    ].sort((a, b) => a.connectionId - b.connectionId)

    return everyone.length > 0 && self?.connectionId === everyone[0].connectionId
  }, [isActivePlayer, self, others])

  useEffect(() => {
    if (!runnablePhase || !selfPlayerId || turnDeadline === 0 || !isDesignatedEnforcer) return
    if (remainingMs > -GRACE_MS) return

    const nowTime = Date.now()
    // Prevent request spamming: enforce once per turnDeadline timestamp, with a 3.5s retry cooldown
    if (
      lastEnforcedDeadlineRef.current === turnDeadline &&
      nowTime - lastEnforceTimeRef.current < 3500
    ) {
      return
    }

    lastEnforcedDeadlineRef.current = turnDeadline
    lastEnforceTimeRef.current = nowTime

    void postJson('/api/game/enforce-turn', { roomId, playerId: selfPlayerId }).catch(() => undefined)
  }, [runnablePhase, remainingMs, selfPlayerId, roomId, turnDeadline, isDesignatedEnforcer])

  if (!runnablePhase || turnDeadline === 0) return null

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const urgent = seconds <= 8
  const label = isActivePlayer ? 'Your turn' : 'Turn'

  return (
    <div
      className={`flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide ${
        urgent ? 'text-danger' : 'text-pine/70'
      }`}
      aria-live="off"
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${urgent ? 'animate-pulse bg-danger' : 'bg-pine/50'}`} />
      {label} · {formatClock(seconds)}
    </div>
  )
}
