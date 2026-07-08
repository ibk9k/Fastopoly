'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import ActionPanel from '@/components/game/ActionPanel'
import BankruptcyOverlay from '@/components/game/BankruptcyOverlay'
import Board from '@/components/game/Board'
import ConnectionBanner from '@/components/game/ConnectionBanner'
import GameLog from '@/components/game/GameLog'
import PlayerDashboard from '@/components/game/PlayerDashboard'
import PropertyManager from '@/components/game/PropertyManager'
import TradeOfferModal from '@/components/game/TradeOfferModal'
import TradePanel from '@/components/game/TradePanel'
import { resolveLocalPlayer, formatMoney } from '@/components/game/helpers'
import {
  useSelf,
  useStorage,
  useMutation,
  useOthers,
  useUpdateMyPresence,
} from '@/lib/liveblocks.config'
import type { GameRules, Player } from '@/lib/liveblocks.config'
import { supabase } from '@/lib/supabase/client'

const colors = ['#ef4444', '#3b82f6', '#facc15', '#22c55e']
const tokens = ['car', 'hat', 'dog', 'ship']

const maps = [
  { id: 'classic', title: 'Classic', detail: '10x10', enabled: true },
  { id: 'mega', title: 'Mega', detail: '16x16', enabled: false },
  { id: '13x13', title: '13x13', detail: 'Expanded board', enabled: false },
  { id: 'double-path', title: 'Double Path', detail: 'Branching routes', enabled: false },
]

type MobilePanel = 'players' | 'log' | 'settings'

export default function GameBoard() {
  const params = useParams<{ roomId: string }>()
  const roomId = params.roomId
  const self = useSelf()
  const others = useOthers()
  const updatePresence = useUpdateMyPresence()

  const gamePhase = useStorage((root) => root.gamePhase) ?? 'lobby'
  const rules = useStorage((root) => root.rules)
  const mapType = useStorage((root) => root.mapType) ?? 'classic'
  const storedPlayers = useStorage((root) => root.players) ?? []
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0

  const activePlayer = storedPlayers[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(storedPlayers, self, activePlayer?.id)

  const [tradeOpen, setTradeOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('players')
  const [isPublic, setIsPublic] = useState(true)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)

  // Sync isPublic status from Supabase
  useEffect(() => {
    async function loadRoomVisibility() {
      if (!roomId) return
      const { data } = await supabase
        .from('public_rooms')
        .select('status')
        .eq('id', roomId)
        .maybeSingle()
      if (data) {
        setIsPublic(data.status === 'waiting')
      }
    }
    void loadRoomVisibility()
  }, [roomId])

  // Derive lobby players from presence
  const connectedPlayers = useMemo(() => {
    const everyone = [
      ...(self ? [{ connectionId: self.connectionId, presence: self.presence, isSelf: true }] : []),
      ...others.map((other) => ({ connectionId: other.connectionId, presence: other.presence, isSelf: false })),
    ].sort((first, second) => first.connectionId - second.connectionId)

    return everyone.map((person, index) => ({
      id: `player-${person.connectionId}`,
      username: person.presence?.username ?? 'Anonymous',
      color: colors[index % colors.length],
      token: tokens[index % tokens.length],
      isReady: Boolean(person.presence?.isReady),
      isHost: index === 0,
      isSelf: person.isSelf,
    }))
  }, [others, self])

  const isHost = connectedPlayers.some((player) => player.isHost && player.isSelf)
  const canStart = connectedPlayers.length >= 1 && connectedPlayers.every((player) => player.isReady)

  // Liveblocks mutations to update settings
  const updateRule = useMutation(({ storage }, key: keyof GameRules, value: any) => {
    const currentRules = storage.get('rules')
    if (currentRules) {
      if (typeof (currentRules as any).set === 'function') {
        (currentRules as any).set(key, value)
      } else {
        storage.set('rules', { ...storage.get('rules'), [key]: value })
      }
    }
  }, [])

  const updateMapType = useMutation(({ storage }, value: string) => {
    storage.set('mapType', value)
  }, [])

  const setPlaying = useMutation(({ storage }) => {
    storage.set('gamePhase', 'playing')
  }, [])

  async function togglePublic(nextPublic: boolean) {
    if (!isHost) return
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
    const playersToInit: Player[] = connectedPlayers.map((player) => ({
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
      body: JSON.stringify({ roomId, players: playersToInit, rules: rules as GameRules, mapType: mapType ?? 'classic' }),
    })
    setStarting(false)
  }

  async function copyRoomCode() {
    if (!roomId) return
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="game-root h-screen overflow-hidden bg-[#F7F0E4] px-4 pt-4 text-zinc-900 lg:px-6 lg:pt-6">
      <ConnectionBanner />
      <BankruptcyOverlay />

      <div className={`mx-auto flex h-full max-w-[1400px] gap-5 justify-center relative ${
        gamePhase === 'lobby' ? 'items-center' : 'items-stretch'
      }`}>
        {/* Left Side: Room settings during lobby phase (collapses smoothly via width and opacity transitions) */}
        <aside className={`hidden lg:flex flex-col transition-all duration-500 ease-in-out overflow-hidden min-h-0 pb-4 flex-shrink-0 ${
          gamePhase === 'lobby'
            ? 'w-[300px] opacity-100 mr-2'
            : 'w-0 opacity-0 pointer-events-none mr-0'
        }`}>
          <div className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-5 text-zinc-900 shadow-xl w-[300px] max-h-[85vh] overflow-y-auto overflow-x-hidden">
            {/* Room Code section */}
            <div className="flex items-center justify-between gap-3 border-b border-[#e58a74]/30 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase tracking-widest font-black text-zinc-700">Room Code</span>
                <h2 className="text-3xl font-black text-zinc-900 tracking-wider leading-none mt-1">{roomId}</h2>
              </div>
              <button
                onClick={copyRoomCode}
                className="rounded-md border border-[#e58a74]/40 bg-white/20 hover:bg-white/40 px-3 py-1.5 text-xs font-bold text-zinc-800 active:scale-95 transition-all shadow-sm"
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            {/* Visibility Toggle */}
            <div className="mb-5 rounded border border-[#e58a74]/30 bg-white/20 p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-black text-zinc-900">Visibility</h3>
                  <p className="text-[10px] text-zinc-700 font-semibold">{isPublic ? 'Public game list' : 'Invite code only'}</p>
                </div>
                {isHost ? (
                  <label className="flex items-center gap-2 text-xs font-black text-zinc-900 cursor-pointer select-none">
                    Public
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => void togglePublic(e.target.checked)}
                      className="h-4.5 w-4.5 rounded accent-[#2f4d20] cursor-pointer"
                    />
                  </label>
                ) : (
                  <span className={`text-[10px] font-black uppercase rounded-full px-2.5 py-0.5 ${isPublic ? 'bg-[#BAED91] text-[#2f4d20]' : 'bg-zinc-300 text-zinc-700'}`}>
                    {isPublic ? 'Public' : 'Private'}
                  </span>
                )}
              </div>
            </div>

            {/* Settings section */}
            <div className="border-t border-[#e58a74]/35 pt-3">
              <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider mb-3">Lobby Settings</h2>
              
              {/* Map Selection */}
              <div className="mb-4 flex items-center justify-between gap-3 text-xs font-bold text-zinc-800">
                <span>Map</span>
                <select
                  disabled={!isHost}
                  value={mapType}
                  onChange={(e) => updateMapType(e.target.value)}
                  className="rounded border border-[#e58a74]/40 bg-white/20 px-2 py-1 text-zinc-800 outline-none focus:border-[#2f4d20] font-bold text-xs disabled:opacity-80 cursor-pointer w-[130px]"
                >
                  {maps.map((map) => (
                    <option key={map.id} value={map.id} disabled={!map.enabled}>
                      {map.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rules settings */}
              {rules && (
                <div className="grid gap-3 pt-2">
                  <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-800">
                    <span>Starting Cash</span>
                    <select
                      disabled={!isHost}
                      value={rules.startingCash}
                      onChange={(e) => updateRule('startingCash', Number(e.target.value))}
                      className="rounded border border-[#e58a74]/40 bg-white/20 px-2 py-1 text-zinc-800 outline-none focus:border-[#2f4d20] font-bold text-xs disabled:opacity-80 cursor-pointer w-[130px]"
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
                      onChange={(e) => updateRule('maxPlayers', Number(e.target.value))}
                      className="rounded border border-[#e58a74]/40 bg-white/20 px-2 py-1 text-zinc-800 outline-none focus:border-[#2f4d20] font-bold text-xs disabled:opacity-80 cursor-pointer w-[130px]"
                    >
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-800 cursor-pointer select-none">
                    <span>Free Parking Jackpot</span>
                    <input
                      type="checkbox"
                      disabled={!isHost}
                      checked={rules.freeParkingJackpot}
                      onChange={(e) => updateRule('freeParkingJackpot', e.target.checked)}
                      className="h-4.5 w-4.5 rounded border-[#e58a74]/30 accent-[#2f4d20] disabled:opacity-80"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-800 cursor-pointer select-none">
                    <span>Auction on Pass</span>
                    <input
                      type="checkbox"
                      disabled={!isHost}
                      checked={rules.auctionOnPass}
                      onChange={(e) => updateRule('auctionOnPass', e.target.checked)}
                      className="h-4.5 w-4.5 rounded border-[#e58a74]/30 accent-[#2f4d20] disabled:opacity-80"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-bold text-zinc-800 cursor-pointer select-none">
                    <span>Speed Die</span>
                    <input
                      type="checkbox"
                      disabled={!isHost}
                      checked={rules.speedDie}
                      onChange={(e) => updateRule('speedDie', e.target.checked)}
                      className="h-4.5 w-4.5 rounded border-[#e58a74]/30 accent-[#2f4d20] disabled:opacity-80"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center: The Board itself */}
        <section className="flex-1 min-w-0 self-center flex flex-col items-center justify-center pb-4">
          <Board />
        </section>

        {/* Right Side: Players List / Lobby info (in lobby) OR normal Dashboard (in game) */}
        {gamePhase === 'lobby' ? (
          <aside className="hidden min-h-0 lg:flex flex-col w-[360px] flex-shrink-0 self-center">
            <div className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-5 text-zinc-900 shadow-xl flex flex-col justify-between max-h-[85vh] overflow-y-auto">
              <div>
                <div className="flex items-center justify-between gap-3 border-b border-[#e58a74]/30 pb-2 mb-4">
                  <h2 className="font-black text-zinc-900 text-lg uppercase tracking-wider">Players</h2>
                  <span className="text-xs text-zinc-700 font-bold">{connectedPlayers.length} in room</span>
                </div>

                {/* Connected Players list */}
                <div className="grid gap-2.5">
                  {connectedPlayers.map((player) => (
                    <div key={player.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e58a74]/30 bg-white/20 px-3.5 py-2.5 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: player.color }} />
                        <div>
                          <p className="text-sm font-black text-zinc-900 flex items-center gap-1.5 leading-none">
                            {player.username}
                            {player.isHost && <span className="text-[9px] font-bold bg-[#2f4d20] text-[#BAED91] rounded px-1.5 py-0.5 leading-none uppercase scale-90">Host</span>}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase ${player.isReady ? 'text-emerald-800 font-extrabold' : 'text-rose-800'}`}>
                          {player.isReady ? 'Ready' : 'Not Ready'}
                        </span>
                        {player.isSelf && (
                          <button
                            onClick={() => updatePresence({ isReady: !player.isReady })}
                            className="rounded border border-[#e58a74]/40 bg-white/20 hover:bg-white/40 px-2 py-1 text-[10px] font-black text-[#2f4d20] active:scale-95 transition-all shadow-sm"
                          >
                            {player.isReady ? 'Unready' : 'Ready'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Start game footer button */}
              <div className="mt-6 pt-4 border-t border-[#e58a74]/30">
                {isHost ? (
                  <>
                    <button
                      onClick={() => void startGame()}
                      disabled={!canStart || starting}
                      className="w-full rounded-md bg-[#2f4d20] px-6 py-3.5 text-sm font-black tracking-wider uppercase text-[#BAED91] hover:bg-[#2f4d20]/90 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 shadow-md shadow-[#2f4d20]/10"
                    >
                      {starting ? 'Starting...' : 'Start Game'}
                    </button>
                    {!canStart && (
                      <p className="mt-2 text-center text-[10px] font-bold text-rose-800 leading-normal">
                        Needs at least 1 player, and everyone must be ready.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="bg-white/20 border border-[#e58a74]/20 rounded-lg p-3.5 text-center text-xs font-black text-zinc-800">
                    Waiting for Host to start game...
                  </div>
                )}
              </div>
            </div>
          </aside>
        ) : (
          <aside className="hidden min-h-0 pb-4 lg:flex flex-col gap-4 w-[360px] flex-shrink-0 h-full overflow-hidden">
            <ActionPanel roomId={roomId} onOpenTrade={() => setTradeOpen(true)} onOpenProperties={() => setPropertiesOpen(true)} placement="sidebar" />
            <PlayerDashboard roomId={roomId} />
            <GameLog />
          </aside>
        )}

        {/* Mobile bottom sections */}
        <section className="lg:hidden w-full">
          {gamePhase === 'lobby' ? (
            <div className="space-y-4 pb-16">
              {/* Tab Selector */}
              <div className="mb-3 grid grid-cols-2 rounded-md border border-[#e58a74]/30 bg-[#EFA38F] p-1 shadow-sm">
                <button
                  onClick={() => setMobilePanel('players')}
                  className={`rounded px-3 py-2 text-sm font-bold transition-all ${mobilePanel === 'players' ? 'bg-[#2f4d20] text-white shadow-sm' : 'text-zinc-800 hover:text-zinc-950'}`}
                >
                  Players
                </button>
                <button
                  onClick={() => setMobilePanel('settings')}
                  className={`rounded px-3 py-2 text-sm font-bold transition-all ${mobilePanel === 'settings' ? 'bg-[#2f4d20] text-white shadow-sm' : 'text-zinc-800 hover:text-zinc-950'}`}
                >
                  Settings
                </button>
              </div>

              {/* Render Players list or Settings based on active tab */}
              {mobilePanel === 'players' ? (
                <div className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-5 text-zinc-900 shadow-xl flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 border-b border-[#e58a74]/30 pb-2 mb-2">
                    <div>
                      <span className="text-[10px] uppercase tracking-widest font-black text-zinc-700">Room Code</span>
                      <h2 className="text-2xl font-black text-zinc-900 tracking-wider leading-none mt-1">{roomId}</h2>
                    </div>
                    <button
                      onClick={copyRoomCode}
                      className="rounded-md border border-[#e58a74]/40 bg-white/20 hover:bg-white/40 px-3 py-1 text-xs font-black text-zinc-800 active:scale-95"
                    >
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <div className="rounded border border-[#e58a74]/30 bg-white/20 p-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xs font-black text-zinc-900">Visibility</h3>
                      </div>
                      {isHost ? (
                        <label className="flex items-center gap-2 text-xs font-black text-zinc-900">
                          Public
                          <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => void togglePublic(e.target.checked)}
                            className="h-4 w-4 rounded accent-[#2f4d20]"
                          />
                        </label>
                      ) : (
                        <span className={`text-[10px] font-black uppercase rounded-full px-2 py-0.5 ${isPublic ? 'bg-[#BAED91] text-[#2f4d20]' : 'bg-zinc-300 text-zinc-700'}`}>
                          {isPublic ? 'Public' : 'Private'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {connectedPlayers.map((player) => (
                      <div key={player.id} className="flex items-center justify-between gap-2 rounded border border-[#e58a74]/30 bg-white/20 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: player.color }} />
                          <span className="text-xs font-black text-zinc-900">
                            {player.username} {player.isHost && '(Host)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold ${player.isReady ? 'text-emerald-800 font-extrabold' : 'text-rose-800'}`}>
                            {player.isReady ? 'Ready' : 'Not Ready'}
                          </span>
                          {player.isSelf && (
                            <button
                              onClick={() => updatePresence({ isReady: !player.isReady })}
                              className="rounded border border-[#e58a74]/40 bg-white/20 px-2 py-0.5 text-[9px] font-black text-zinc-800"
                            >
                              {player.isReady ? 'Unready' : 'Ready'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#e58a74]/30">
                    {isHost ? (
                      <button
                        onClick={() => void startGame()}
                        disabled={!canStart || starting}
                        className="w-full rounded bg-[#2f4d20] py-3 text-xs font-black text-[#BAED91] uppercase"
                      >
                        {starting ? 'Starting...' : 'Start Game'}
                      </button>
                    ) : (
                      <div className="bg-white/20 rounded p-2 text-center text-xs font-black text-zinc-800">
                        Waiting for Host to start game...
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#e58a74]/40 bg-[#EFA38F] p-5 text-zinc-900 shadow-xl flex flex-col gap-4">
                  {/* Settings selectors */}
                  <div>
                    <span className="text-xs font-bold text-zinc-700">Map</span>
                    <select
                      disabled={!isHost}
                      value={mapType}
                      onChange={(e) => updateMapType(e.target.value)}
                      className="mt-1 w-full rounded border border-[#e58a74]/40 bg-white/20 p-2 text-xs font-black text-zinc-800 outline-none"
                    >
                      <option value="classic">Classic (10x10)</option>
                    </select>
                  </div>

                  {rules && (
                    <div className="space-y-3 pt-2 border-t border-[#e58a74]/35">
                      <label className="flex items-center justify-between text-xs font-bold text-zinc-800">
                        <span>Starting Cash</span>
                        <select
                          disabled={!isHost}
                          value={rules.startingCash}
                          onChange={(e) => updateRule('startingCash', Number(e.target.value))}
                          className="rounded border border-[#e58a74]/40 bg-white/20 px-2 py-1 text-xs font-black"
                        >
                          <option value={1000}>$1000</option>
                          <option value={1500}>$1500</option>
                          <option value={2000}>$2000</option>
                        </select>
                      </label>

                      <label className="flex items-center justify-between text-xs font-bold text-zinc-800">
                        <span>Max Players</span>
                        <select
                          disabled={!isHost}
                          value={rules.maxPlayers ?? 4}
                          onChange={(e) => updateRule('maxPlayers', Number(e.target.value))}
                          className="rounded border border-[#e58a74]/40 bg-white/20 px-2 py-1 text-xs font-black"
                        >
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>

                      <label className="flex items-center justify-between text-xs font-bold text-zinc-800">
                        <span>Free Parking Jackpot</span>
                        <input
                          type="checkbox"
                          disabled={!isHost}
                          checked={rules.freeParkingJackpot}
                          onChange={(e) => updateRule('freeParkingJackpot', e.target.checked)}
                          className="h-4 w-4 accent-[#2f4d20]"
                        />
                      </label>

                      <label className="flex items-center justify-between text-xs font-bold text-zinc-800">
                        <span>Auction on Pass</span>
                        <input
                          type="checkbox"
                          disabled={!isHost}
                          checked={rules.auctionOnPass}
                          onChange={(e) => updateRule('auctionOnPass', e.target.checked)}
                          className="h-4 w-4 accent-[#2f4d20]"
                        />
                      </label>

                      <label className="flex items-center justify-between text-xs font-bold text-zinc-800">
                        <span>Speed Die</span>
                        <input
                          type="checkbox"
                          disabled={!isHost}
                          checked={rules.speedDie}
                          onChange={(e) => updateRule('speedDie', e.target.checked)}
                          className="h-4 w-4 accent-[#2f4d20]"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="pb-16">
              <div className="mb-3 grid grid-cols-2 rounded-md border border-[#e58a74]/30 bg-[#EFA38F] p-1 shadow-sm">
                <button
                  onClick={() => setMobilePanel('players')}
                  className={`rounded px-3 py-2 text-sm font-bold transition-all ${mobilePanel === 'players' ? 'bg-[#2f4d20] text-white shadow-sm' : 'text-zinc-800 hover:text-zinc-950'}`}
                >
                  Players
                </button>
                <button
                  onClick={() => setMobilePanel('log')}
                  className={`rounded px-3 py-2 text-sm font-bold transition-all ${mobilePanel === 'log' ? 'bg-[#2f4d20] text-white shadow-sm' : 'text-zinc-800 hover:text-zinc-950'}`}
                >
                  Log
                </button>
              </div>
              {mobilePanel === 'players' ? <PlayerDashboard roomId={roomId} /> : <GameLog />}
            </div>
          )}
        </section>
      </div>

      {gamePhase !== 'lobby' && (
        <ActionPanel roomId={roomId} onOpenTrade={() => setTradeOpen(true)} onOpenProperties={() => setPropertiesOpen(true)} placement="mobile" />
      )}
      <TradeOfferModal roomId={roomId} />

      {tradeOpen ? <TradePanel roomId={roomId} onClose={() => setTradeOpen(false)} /> : null}
      {propertiesOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8 text-white">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
            <PropertyManager roomId={roomId} playerId={selfPlayer?.id ?? ''} onClose={() => setPropertiesOpen(false)} />
          </div>
        </div>
      ) : null}
    </main>
  )
}
