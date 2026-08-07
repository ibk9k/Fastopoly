'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameLogEntry } from '@/lib/liveblocks.config'
import { useEventListener, useStorage } from '@/lib/liveblocks.config'

type VisualLogEntry = GameLogEntry & {
  ephemeral?: boolean
}

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export default function GameLog({ bare = false }: { bare?: boolean } = {}) {
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const storedLog = useStorage((root) => root.log)
  const log = useMemo(() => storedLog ?? [], [storedLog])
  const [ephemeralEntries, setEphemeralEntries] = useState<VisualLogEntry[]>([])
  const [now, setNow] = useState(Date.now())
  const endRef = useRef<HTMLDivElement | null>(null)

  useEventListener(({ event }) => {
    if (event.type === 'DICE_ROLLED') {
      const playerName = players.find((player) => player.id === event.playerId)?.username ?? 'A player'
      setEphemeralEntries((entries) => [
        ...entries,
        {
          id: `dice-${event.playerId}-${Date.now()}`,
          message: `${playerName} rolled a ${event.dice[0]} and a ${event.dice[1]}.`,
          timestamp: Date.now(),
          ephemeral: true,
        },
      ])
    }

    if (event.type === 'CARD_DRAWN') {
      const playerName = players.find((player) => player.id === event.playerId)?.username ?? 'A player'
      setEphemeralEntries((entries) => [
        ...entries,
        {
          id: `card-${event.playerId}-${Date.now()}`,
          message: `${playerName} drew ${event.text}`,
          timestamp: Date.now(),
          ephemeral: true,
        },
      ])
    }
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(intervalId)
  }, [])

  const entries = useMemo<VisualLogEntry[]>(() => {
    return [...log, ...ephemeralEntries].sort((first, second) => first.timestamp - second.timestamp)
  }, [ephemeralEntries, log])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length])

  const latestMessage = entries.length ? entries[entries.length - 1].message : ''

  const body = (
    <>
      {/* Announces each new game event (turn, roll, rent, card) to screen readers. */}
      <p className="sr-only" aria-live="polite">
        {latestMessage}
      </p>
      {bare ? null : (
        <div className="flex items-center justify-between">
          <h2 className="font-display uppercase tracking-wide text-zinc-900">Log</h2>
          <p className="text-xs text-zinc-700">{entries.length} entries</p>
        </div>
      )}
      {/* When bare, the host panel owns the height and this just fills it — `h-full`
        * plus `min-h-0` is what makes the overflow scroll here instead of stretching
        * the panel to fit every entry. */}
      <div className={`${bare ? 'h-full min-h-0' : 'mt-4 max-h-72'} overflow-y-auto pr-1`}>
        <div className="grid gap-3">
          {entries.length === 0 ? <p className="text-sm text-zinc-600">No events yet.</p> : null}
          {entries.map((entry) => (
            <div key={entry.id} className={`text-sm ${entry.ephemeral ? 'text-zinc-700' : 'text-zinc-900 font-semibold'}`}>
              <p>{entry.message}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-zinc-700">{relativeTime(entry.timestamp, now)}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </>
  )

  // `bare` drops the panel shell so SidePanel can host the log inside its own
  // Comments/Logs frame without double borders.
  if (bare) return body

  return <section className="rounded-lg border border-salmon-line/60 bg-salmon p-4 shadow-card">{body}</section>
}
