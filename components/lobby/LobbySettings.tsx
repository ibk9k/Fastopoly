'use client'

import { useState } from 'react'
import type { GameRules } from '@/lib/liveblocks.config'
import { useToast } from '@/components/ui/Toast'

type LobbySettingsProps = {
  roomId: string
  isHost: boolean
  isPublic: boolean
  onTogglePublic: (nextPublic: boolean) => void
  mapType: string
  rules: GameRules | null
  onUpdateRule: (key: keyof GameRules, value: GameRules[keyof GameRules]) => void
  onUpdateMapType: (value: string) => void
}

const maps = [
  { id: 'classic', title: 'Classic', enabled: true },
  { id: 'mega', title: 'Mega', enabled: false },
  { id: '13x13', title: '13x13', enabled: false },
  { id: 'double-path', title: 'Double Path', enabled: false },
]

const selectClass =
  'rounded border border-salmon-line/50 bg-white/30 px-2 py-1 text-xs font-bold text-zinc-800 outline-none focus:border-pine disabled:opacity-70 cursor-pointer w-[130px]'
const checkboxClass = 'h-[18px] w-[18px] rounded accent-pine disabled:opacity-70'

/**
 * The single lobby-settings card — one implementation for every viewport
 * (replaces the near-verbatim desktop/mobile duplicates in GameBoard).
 */
export default function LobbySettings({
  roomId,
  isHost,
  isPublic,
  onTogglePublic,
  mapType,
  rules,
  onUpdateRule,
  onUpdateMapType,
}: LobbySettingsProps) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast(`Copying is blocked here — the room code is ${roomId}`, 'info')
    }
  }

  return (
    <div className="rounded-lg border border-salmon-line/60 bg-salmon p-5 text-zinc-900 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-salmon-line/40 pb-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-700">Room Code</span>
          <h2 className="mt-1 font-display text-3xl tracking-wider text-zinc-900">{roomId}</h2>
        </div>
        <button
          onClick={() => void copyRoomCode()}
          className="rounded-md border border-salmon-line/60 bg-white/25 px-3 py-1.5 text-xs font-bold text-zinc-800 shadow-sm transition-all hover:bg-white/45 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine"
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      <div className="mb-5 rounded border border-salmon-line/40 bg-white/25 p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-extrabold text-zinc-900">Visibility</h3>
            <p className="text-[10px] font-semibold text-zinc-700">{isPublic ? 'Public game list' : 'Invite code only'}</p>
          </div>
          {isHost ? (
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-extrabold text-zinc-900">
              Public
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => onTogglePublic(event.target.checked)}
                className={checkboxClass}
              />
            </label>
          ) : (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                isPublic ? 'bg-felt text-pine' : 'bg-zinc-300 text-zinc-700'
              }`}
            >
              {isPublic ? 'Public' : 'Private'}
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-salmon-line/40 pt-3">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-zinc-900">Lobby Settings</h2>

        <div className="mb-4 flex items-center justify-between gap-3 text-xs font-bold text-zinc-800">
          <span>Map</span>
          <select disabled={!isHost} value={mapType} onChange={(event) => onUpdateMapType(event.target.value)} className={selectClass}>
            {maps.map((map) => (
              <option key={map.id} value={map.id} disabled={!map.enabled}>
                {map.title}
                {!map.enabled ? ' (soon)' : ''}
              </option>
            ))}
          </select>
        </div>

        {rules ? (
          <div className="grid gap-3 pt-1">
            <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-800">
              <span>Starting Cash</span>
              <select
                disabled={!isHost}
                value={rules.startingCash}
                onChange={(event) => onUpdateRule('startingCash', Number(event.target.value))}
                className={selectClass}
              >
                <option value={1000}>$1000</option>
                <option value={1500}>$1500</option>
                <option value={2000}>$2000</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-800">
              <span>Max Players</span>
              <select
                disabled={!isHost}
                value={rules.maxPlayers ?? 4}
                onChange={(event) => onUpdateRule('maxPlayers', Number(event.target.value))}
                className={selectClass}
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>

            <label className="flex cursor-pointer select-none items-center justify-between gap-3 text-xs font-bold text-zinc-800">
              <span>Free Parking Jackpot</span>
              <input
                type="checkbox"
                disabled={!isHost}
                checked={rules.freeParkingJackpot}
                onChange={(event) => onUpdateRule('freeParkingJackpot', event.target.checked)}
                className={checkboxClass}
              />
            </label>

            <label className="flex cursor-pointer select-none items-center justify-between gap-3 text-xs font-bold text-zinc-800">
              <span>Auction on Pass</span>
              <input
                type="checkbox"
                disabled={!isHost}
                checked={rules.auctionOnPass}
                onChange={(event) => onUpdateRule('auctionOnPass', event.target.checked)}
                className={checkboxClass}
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  )
}
