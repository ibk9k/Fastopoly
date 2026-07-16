'use client'

import { customAlphabet } from 'nanoid'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { GameRules } from '@/lib/liveblocks.config'
import { setStoredHostToken } from '@/lib/game-client/tokens'

const createCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

const maps = [
  { id: 'classic', title: 'Classic', detail: '10x10', enabled: true },
  { id: 'mega', title: 'Mega', detail: '16x16', enabled: false },
  { id: '13x13', title: '13x13', detail: 'Expanded board', enabled: false },
  { id: 'double-path', title: 'Double Path', detail: 'Branching routes', enabled: false },
]

export default function HostLobbyPage() {
  const router = useRouter()
  const [mapType, setMapType] = useState('classic')
  const [startingCash, setStartingCash] = useState(1500)
  const [freeParkingJackpot, setFreeParkingJackpot] = useState(false)
  const [auctionOnPass, setAuctionOnPass] = useState(true)
  const [speedDie, setSpeedDie] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function createRoom() {
    const username = sessionStorage.getItem('fastopoly_username') ?? localStorage.getItem('fastopoly_username')
    if (!username) {
      router.push('/')
      return
    }

    const roomCode = createCode()
    const rules: GameRules & { maxPlayers: number } = {
      startingCash,
      freeParkingJackpot,
      auctionOnPass,
      speedDie,
      maxPlayers,
    }

    setCreating(true)
    setError(null)
    const response = await fetch('/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, username, mapType, rules, isPublic: true }),
    })
    const result = (await response.json()) as { roomCode?: string; hostToken?: string; error?: string }
    setCreating(false)

    if (!response.ok || !result.roomCode) {
      setError(result.error ?? 'Could not create room')
      return
    }

    if (result.hostToken) {
      setStoredHostToken(result.roomCode, result.hostToken)
    }

    sessionStorage.setItem('fastopoly_rules', JSON.stringify(rules))
    sessionStorage.setItem('fastopoly_mapType', mapType)
    router.push(`/game/${result.roomCode}`)
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">Host a game</h1>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-200">Map</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {maps.map((map) => (
              <button
                key={map.id}
                disabled={!map.enabled}
                onClick={() => setMapType(map.id)}
                className={`min-h-32 rounded-lg border p-5 text-left transition ${
                  mapType === map.id ? 'border-emerald-500 bg-[#102b1b]' : 'border-zinc-800 bg-zinc-950'
                } ${map.enabled ? 'hover:border-emerald-700' : 'cursor-not-allowed opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{map.title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{map.detail}</p>
                  </div>
                  {!map.enabled ? <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Coming soon</span> : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-lg font-semibold text-zinc-200">Rules</h2>
          <div className="mt-5 grid gap-5">
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-300">Starting cash</span>
              <select value={startingCash} onChange={(event) => setStartingCash(Number(event.target.value))} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <option value={1000}>$1000</option>
                <option value={1500}>$1500</option>
                <option value={2000}>$2000</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-300">Free Parking jackpot</span>
              <input type="checkbox" checked={freeParkingJackpot} onChange={(event) => setFreeParkingJackpot(event.target.checked)} className="h-5 w-5 accent-emerald-700" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-300">Auction on pass</span>
              <input type="checkbox" checked={auctionOnPass} onChange={(event) => setAuctionOnPass(event.target.checked)} className="h-5 w-5 accent-emerald-700" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-300">Speed die</span>
              <input type="checkbox" checked={speedDie} onChange={(event) => setSpeedDie(event.target.checked)} className="h-5 w-5 accent-emerald-700" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="text-zinc-300">Max players</span>
              <select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
          </div>
        </section>

        {error ? <p className="mt-5 text-sm text-red-400">{error}</p> : null}
        <button onClick={createRoom} disabled={creating} className="mt-8 rounded-md bg-[#1a472a] px-8 py-4 font-bold transition hover:bg-[#235d38] disabled:cursor-wait disabled:opacity-60">
          {creating ? 'Creating...' : 'Create room'}
        </button>
      </div>
    </main>
  )
}
