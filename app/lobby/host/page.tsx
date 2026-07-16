'use client'

import { customAlphabet } from 'nanoid'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { GameRules } from '@/lib/liveblocks.config'
import { setStoredHostToken } from '@/lib/game-client/tokens'
import Button from '@/components/ui/Button'
import PropertyStrip from '@/components/ui/PropertyStrip'

const createCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

const maps = [
  { id: 'classic', title: 'Classic', detail: '10x10', enabled: true },
  { id: 'mega', title: 'Mega', detail: '16x16', enabled: false },
  { id: '13x13', title: '13x13', detail: 'Expanded board', enabled: false },
  { id: 'double-path', title: 'Double Path', detail: 'Branching routes', enabled: false },
]

const selectClass =
  'rounded-md border-2 border-salmon-line/40 bg-white/40 px-3 py-2 text-sm font-bold text-pine outline-none focus:border-pine'

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
    <main className="relative min-h-screen bg-parchment px-6 py-12 text-pine">
      <PropertyStrip position="top" />
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-4xl uppercase tracking-wide text-pine">Host a game</h1>

        <section className="mt-8">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-pine/70">Map</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {maps.map((map) => (
              <button
                key={map.id}
                disabled={!map.enabled}
                onClick={() => setMapType(map.id)}
                className={`min-h-28 rounded-lg border-2 p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pine ${
                  mapType === map.id
                    ? 'border-pine bg-felt/50 shadow-card'
                    : 'border-salmon-line/40 bg-parchment-raised'
                } ${map.enabled ? 'hover:border-pine/60' : 'cursor-not-allowed opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold">{map.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-pine/60">{map.detail}</p>
                  </div>
                  {!map.enabled ? (
                    <span className="rounded bg-pine/10 px-2 py-1 text-[10px] font-bold uppercase text-pine/60">
                      Soon
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 max-w-2xl rounded-lg border-2 border-salmon-line/50 bg-salmon p-6 shadow-card">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-800">Rules</h2>
          <div className="mt-5 grid gap-5 text-zinc-900">
            <label className="flex items-center justify-between gap-4 font-bold">
              <span>Starting cash</span>
              <select value={startingCash} onChange={(event) => setStartingCash(Number(event.target.value))} className={selectClass}>
                <option value={1000}>$1000</option>
                <option value={1500}>$1500</option>
                <option value={2000}>$2000</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-4 font-bold">
              <span>Free Parking jackpot</span>
              <input type="checkbox" checked={freeParkingJackpot} onChange={(event) => setFreeParkingJackpot(event.target.checked)} className="h-5 w-5 accent-pine" />
            </label>
            <label className="flex items-center justify-between gap-4 font-bold">
              <span>Auction on pass</span>
              <input type="checkbox" checked={auctionOnPass} onChange={(event) => setAuctionOnPass(event.target.checked)} className="h-5 w-5 accent-pine" />
            </label>
            <label className="flex items-center justify-between gap-4 font-bold">
              <span>Speed die</span>
              <input type="checkbox" checked={speedDie} onChange={(event) => setSpeedDie(event.target.checked)} className="h-5 w-5 accent-pine" />
            </label>
            <label className="flex items-center justify-between gap-4 font-bold">
              <span>Max players</span>
              <select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} className={selectClass}>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
          </div>
        </section>

        {error ? (
          <p className="mt-5 rounded-md border border-danger-line bg-danger-surface px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}
        <Button onClick={createRoom} loading={creating} size="lg" className="mt-8">
          {creating ? 'Creating…' : 'Create room'}
        </Button>
      </div>
      <PropertyStrip position="bottom" />
    </main>
  )
}
