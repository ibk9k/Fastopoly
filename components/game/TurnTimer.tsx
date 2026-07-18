'use client'

import { useEffect, useRef, useState } from 'react'
import { useStorage } from '@/lib/liveblocks.config'
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
 * the server to auto-skip them. Any connected seat fires this (the server clock
 * is authoritative and idempotent), so an absent player can't freeze the game.
 */
export default function TurnTimer({ roomId, selfPlayerId, isActivePlayer }: TurnTimerProps) {
  const gamePhase = useStorage((root) => root.gamePhase)
  const turnDeadline = useStorage((root) => root.turnDeadline) ?? 0
  const [now, setNow] = useState(() => Date.now())
  const enforcingRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const runnablePhase = gamePhase === 'playing' || gamePhase === 'buy_decision' || gamePhase === 'landed'
  const remainingMs = turnDeadline - now

  useEffect(() => {
    if (!runnablePhase || !selfPlayerId || turnDeadline === 0) return
    if (remainingMs > -GRACE_MS || enforcingRef.current) return
    enforcingRef.current = true
    void postJson('/api/game/enforce-turn', { roomId, playerId: selfPlayerId })
      .catch(() => undefined)
      .finally(() => {
        enforcingRef.current = false
      })
  }, [runnablePhase, remainingMs, selfPlayerId, roomId, turnDeadline])

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
