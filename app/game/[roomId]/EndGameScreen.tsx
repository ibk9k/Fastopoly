'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { calculatePlayerNetWorth, formatMoney, postJson, resolveLocalPlayer } from '@/components/game/helpers'
import { getStoredHostToken } from '@/lib/game-client/tokens'
import { useSelf, useStorage } from '@/lib/liveblocks.config'
import type { PlayerResult } from '@/lib/game-engine/scoring'

type EndGameResponse = {
  results: PlayerResult[]
}

export default function EndGameScreen() {
  const params = useParams<{ roomId: string }>()
  const roomId = params.roomId
  const self = useSelf()
  const winnerIds = useStorage((root) => root.winnerIds)
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const properties = useStorage((root) => root.properties)
  const [results, setResults] = useState<PlayerResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const calledRef = useRef(false)

  const selfPlayer = resolveLocalPlayer(players, self)
  // /api/game/end is host-only; only the client holding the host token persists final scores.
  const shouldPersistResults = players[0]?.id === selfPlayer?.id && Boolean(roomId && getStoredHostToken(roomId))

  useEffect(() => {
    if (!roomId || calledRef.current || !shouldPersistResults) return

    calledRef.current = true
    postJson<EndGameResponse>('/api/game/end', { roomId })
      .then((payload) => setResults(payload.results))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to save final scores'))
  }, [roomId, shouldPersistResults])

  const fallbackResults = useMemo<PlayerResult[]>(() => {
    if (!properties) return []

    return [...players]
      .sort((first, second) => {
        if (first.isBankrupt !== second.isBankrupt) return first.isBankrupt ? 1 : -1
        return calculatePlayerNetWorth(second, properties) - calculatePlayerNetWorth(first, properties)
      })
      .map((player, index) => ({
        playerId: player.id,
        username: player.username,
        placement: index + 1,
        pointsEarned: 0,
        bonuses: [],
      }))
  }, [players, properties])

  const standings = results ?? fallbackResults
  const winnerNames = (winnerIds ?? [])
    .map((id) => players.find((player) => player.id === id)?.username)
    .filter((name): name is string => Boolean(name))

  return (
    <main className="min-h-screen bg-[#F7F0E4] px-4 py-10 text-zinc-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-[#d28b7a] bg-[#EFA38F]/30 p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-800">Final standings</p>
              <h1 className="mt-2 text-3xl font-black text-zinc-900 sm:text-4xl">Game ended</h1>
              <p className="mt-2 text-zinc-800 font-semibold">Winner: {winnerNames.join(', ') || standings[0]?.username || 'Pending'}</p>
            </div>
            <Link href="/" className="inline-flex justify-center rounded-md bg-[#1a472a] px-5 py-3 font-bold text-white hover:bg-[#235d38] transition">
              Play Again
            </Link>
          </div>

          {error ? <p className="mt-5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{error}</p> : null}

          <div className="mt-8 grid gap-3">
            {standings.map((result) => {
              const player = players.find((candidate) => candidate.id === result.playerId)
              const netWorth = player && properties ? calculatePlayerNetWorth(player, properties) : player?.cash ?? 0
              const isWinner = result.placement === 1

              return (
                <article
                  key={result.playerId}
                  className={`rounded-lg border p-4 ${
                    isWinner ? 'border-emerald-700 bg-emerald-50' : 'border-[#e58a74]/30 bg-white/50'
                  }`}
                >
                  <div className="grid gap-4 sm:grid-cols-[80px_minmax(0,1fr)_160px_120px] sm:items-center">
                    <div className="text-2xl font-black text-zinc-900">#{result.placement}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: player?.color ?? '#d28b7a' }} />
                        <h2 className="truncate text-lg font-black text-zinc-900">{result.username}</h2>
                      </div>
                      <p className="mt-1 text-sm text-zinc-700 font-semibold">
                        Cash {formatMoney(player?.cash ?? 0)} · Net worth {formatMoney(netWorth)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-zinc-700 font-bold">Points earned</p>
                      <p className="text-xl font-black text-emerald-800">{result.pointsEarned}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      {result.bonuses.length === 0 ? <span className="text-xs text-zinc-600">No bonuses</span> : null}
                      {result.bonuses.map((bonus) => (
                        <span key={bonus} className="rounded-full border border-[#d28b7a] bg-white/30 px-2 py-1 text-xs text-zinc-800 font-semibold">
                          {bonus}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
