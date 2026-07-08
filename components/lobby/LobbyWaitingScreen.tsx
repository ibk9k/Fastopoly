'use client'

import { nanoid } from 'nanoid'
import { useMemo, useState } from 'react'
import type { GameRules, Player } from '@/lib/liveblocks.config'
import { useMutation, useOthers, useSelf, useStorage, useUpdateMyPresence } from '@/lib/liveblocks.config'

const colors = ['#ef4444', '#3b82f6', '#facc15', '#22c55e']
const tokens = ['car', 'hat', 'dog', 'ship']

export default function LobbyWaitingScreen({ roomId }: { roomId: string }) {
  const updatePresence = useUpdateMyPresence()
  const self = useSelf()
  const others = useOthers()
  const rules = useStorage((root) => root.rules)
  const mapType = useStorage((root) => root.mapType)
  const [isPublic, setIsPublic] = useState(true)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)

  const connectedPlayers = useMemo(() => {
    const everyone = [
      ...(self ? [{ connectionId: self.connectionId, presence: self.presence, isSelf: true }] : []),
      ...others.map((other) => ({ connectionId: other.connectionId, presence: other.presence, isSelf: false })),
    ].sort((first, second) => first.connectionId - second.connectionId)

    return everyone.map((person, index) => ({
      id: `player-${person.connectionId}`,
      username: person.presence.username,
      color: colors[index % colors.length],
      token: tokens[index % tokens.length],
      isReady: person.presence.isReady,
      isHost: index === 0,
      isSelf: person.isSelf,
    }))
  }, [others, self])

  const isHost = connectedPlayers.some((player) => player.isHost && player.isSelf)
  const canStart = connectedPlayers.length >= 1 && connectedPlayers.every((player) => player.isReady)

  const setPlaying = useMutation(({ storage }) => {
    storage.set('gamePhase', 'playing')
  }, [])

  async function togglePublic(nextPublic: boolean) {
    setIsPublic(nextPublic)
    await fetch('/api/lobby/update-visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: roomId, isPublic: nextPublic }),
    })
  }

  async function startGame() {
    if (!canStart || !rules) return
    setStarting(true)
    const players: Player[] = connectedPlayers.map((player) => ({
      id: player.id,
      username: player.username,
      color: player.color,
      token: player.token,
      position: 0,
      cash: rules.startingCash,
      properties: [],
      inJail: false,
      jailTurns: 0,
      isBankrupt: false,
      getOutOfJailCards: 0,
      ownedColorGroups: [],
      hasBuiltHotel: false,
      bankruptciesCaused: 0,
    }))

    setPlaying()
    await fetch('/api/game/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, players, rules: rules as GameRules, mapType: mapType ?? 'classic' }),
    })
    setStarting(false)
  }

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Room code</p>
            <h1 className="mt-2 text-5xl font-black tracking-[0.2em]">{roomId}</h1>
          </div>
          <button onClick={copyRoomCode} className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-zinc-500">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Visibility</h2>
              <p className="text-sm text-zinc-400">{isPublic ? 'Listed in public games' : 'Only players with code can join'}</p>
            </div>
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              Public
              <input type="checkbox" checked={isPublic} onChange={(event) => void togglePublic(event.target.checked)} className="h-5 w-5 accent-emerald-700" />
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="font-bold">Players</h2>
          <div className="mt-4 grid gap-3">
            {connectedPlayers.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: player.color }} />
                  <div>
                    <p className="font-semibold">
                      {player.username} {player.isHost ? <span className="text-xs text-emerald-400">Host</span> : null}
                    </p>
                    <p className="text-sm text-zinc-500">{player.isReady ? 'Ready' : 'Not ready'}</p>
                  </div>
                </div>
                {player.isSelf ? (
                  <button
                    onClick={() => updatePresence({ isReady: !player.isReady })}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-zinc-500"
                  >
                    {player.isReady ? 'Unready' : 'Ready'}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {isHost ? (
          <button
            onClick={() => void startGame()}
            disabled={!canStart || starting}
            className="mt-8 rounded-md bg-[#1a472a] px-8 py-4 font-bold transition hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? 'Starting...' : 'Start Game'}
          </button>
        ) : null}
        {!canStart ? <p className="mt-3 text-sm text-zinc-500">Start unlocks when at least 2 players are connected and everyone is ready.</p> : null}
      </div>
    </main>
  )
}
