'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import ActionPanel from '@/components/game/ActionPanel'
import AuctionPanel from '@/components/game/AuctionPanel'
import BankruptcyOverlay from '@/components/game/BankruptcyOverlay'
import Board from '@/components/game/Board'
import ConnectionBanner from '@/components/game/ConnectionBanner'
import GameLog from '@/components/game/GameLog'
import PlayerDashboard from '@/components/game/PlayerDashboard'
import PropertyManager from '@/components/game/PropertyManager'
import TradeOfferModal from '@/components/game/TradeOfferModal'
import TradePanel from '@/components/game/TradePanel'
import TurnTimer from '@/components/game/TurnTimer'
import DebtOverlay from '@/components/game/DebtOverlay'
import LobbySettings from '@/components/lobby/LobbySettings'
import PlayerList from '@/components/lobby/PlayerList'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { resolveLocalPlayer, postJson } from '@/components/game/helpers'
import { ensurePlayerToken, getStoredHostToken } from '@/lib/game-client/tokens'
import { useSelf, useStorage, useOthers, useUpdateMyPresence } from '@/lib/liveblocks.config'
import type { GameRules, Player } from '@/lib/liveblocks.config'
import { supabase } from '@/lib/supabase/client'

const seatColors = ['#EF4444', '#3B82F6', '#FACC15', '#22C55E']
const tokens = ['car', 'hat', 'dog', 'ship']

type MobilePanel = 'players' | 'log' | 'settings'

export default function GameBoard() {
  const params = useParams<{ roomId: string }>()
  const roomId = params.roomId
  const self = useSelf()
  const others = useOthers()
  const updatePresence = useUpdateMyPresence()
  const { toast } = useToast()

  const gamePhase = useStorage((root) => root.gamePhase) ?? 'lobby'
  const rules = useStorage((root) => root.rules)
  const mapType = useStorage((root) => root.mapType) ?? 'classic'
  const storedPlayers = useStorage((root) => root.players) ?? []
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const auctionPropertyId = useStorage((root) => root.auctionPropertyId) ?? null

  const activePlayer = storedPlayers[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(storedPlayers, self, activePlayer?.id)

  const [tradeOpen, setTradeOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('players')
  const [isPublic, setIsPublic] = useState(true)
  const [hostUsername, setHostUsername] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const isLobby = gamePhase === 'lobby'
  const hasHostToken = useMemo(() => Boolean(roomId && getStoredHostToken(roomId)), [roomId])

  // Claim this seat's action token once the game has started and our player is resolved.
  const selfPlayerId = selfPlayer?.id
  const selfUsername = self?.presence?.username
  useEffect(() => {
    if (isLobby || !selfPlayerId || !selfUsername) return
    void ensurePlayerToken(roomId, selfPlayerId, selfUsername)
  }, [isLobby, selfPlayerId, selfUsername, roomId])

  // Heartbeat loop: ping room activity every 40 seconds to keep active rooms alive
  useEffect(() => {
    if (!roomId) return
    const pingHeartbeat = () => {
      void postJson('/api/lobby/heartbeat', { roomCode: roomId }).catch(() => undefined)
    }
    pingHeartbeat()
    const timer = setInterval(pingHeartbeat, 40000)
    return () => clearInterval(timer)
  }, [roomId])

  // Sync isPublic status and host_username from Supabase
  useEffect(() => {
    async function loadRoomDetails() {
      if (!roomId) return
      const { data } = await supabase.from('public_rooms').select('status, host_username').eq('id', roomId).maybeSingle()
      if (data) {
        setIsPublic(data.status === 'waiting')
        if (data.host_username) setHostUsername(data.host_username)
      }
    }
    void loadRoomDetails()
  }, [roomId])

  // Derive lobby players from presence (deduplicated by username)
  const connectedPlayers = useMemo(() => {
    const everyone = [
      ...(self ? [{ connectionId: self.connectionId, presence: self.presence, isSelf: true }] : []),
      ...others.map((other) => ({ connectionId: other.connectionId, presence: other.presence, isSelf: false })),
    ].sort((first, second) => first.connectionId - second.connectionId)

    const uniqueByUsername = new Map<string, (typeof everyone)[0]>()
    for (const person of everyone) {
      const uname = (person.presence?.username ?? 'Anonymous').trim()
      const key = uname.toLowerCase()
      const existing = uniqueByUsername.get(key)
      if (!existing || person.isSelf || person.connectionId > existing.connectionId) {
        uniqueByUsername.set(key, person)
      }
    }

    const uniqueList = Array.from(uniqueByUsername.values()).sort(
      (first, second) => first.connectionId - second.connectionId,
    )

    return uniqueList.map((person, index) => {
      const uname = person.presence?.username ?? 'Anonymous'
      const isCurrentHost =
        (hostUsername && uname.toLowerCase() === hostUsername.toLowerCase()) ||
        (person.isSelf && hasHostToken)

      return {
        id: `player-${person.connectionId}`,
        username: uname,
        color: seatColors[index % seatColors.length],
        token: tokens[index % tokens.length],
        isReady: Boolean(person.presence?.isReady),
        isHost: Boolean(isCurrentHost),
        isSelf: person.isSelf,
      }
    })
  }, [others, self, hostUsername, hasHostToken])

  const isHost = connectedPlayers.some((player) => player.isHost && player.isSelf)
  const canStart = connectedPlayers.length >= 1 && connectedPlayers.every((player) => player.isReady)

  function updateRule(key: keyof GameRules, value: GameRules[keyof GameRules]) {
    void postJson('/api/game/lobby-settings', { roomId, rulesPatch: { [key]: value } }).catch((err) =>
      toast(err instanceof Error ? err.message : 'Could not update the rule', 'error'),
    )
  }

  function updateMapType(value: string) {
    void postJson('/api/game/lobby-settings', { roomId, mapType: value }).catch((err) =>
      toast(err instanceof Error ? err.message : 'Could not update the map', 'error'),
    )
  }

  async function togglePublic(nextPublic: boolean) {
    if (!isHost) return
    setIsPublic(nextPublic)
    try {
      const response = await fetch('/api/lobby/update-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomId, isPublic: nextPublic }),
      })
      if (!response.ok) throw new Error('Could not update visibility')
    } catch (err) {
      setIsPublic(!nextPublic)
      toast(err instanceof Error ? err.message : 'Could not update visibility', 'error')
    }
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

    try {
      await postJson('/api/game/init', { roomId, players: playersToInit, rules: rules as GameRules, mapType: mapType ?? 'classic' })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not start the game', 'error')
    } finally {
      setStarting(false)
    }
  }

  const lobbySettingsProps = {
    roomId,
    isHost,
    isPublic,
    onTogglePublic: (next: boolean) => void togglePublic(next),
    mapType,
    rules: rules ?? null,
    onUpdateRule: updateRule,
    onUpdateMapType: updateMapType,
  }

  const playerListProps = {
    players: connectedPlayers,
    canStart,
    starting,
    isHost,
    hostUsername,
    onToggleReady: (ready: boolean) => updatePresence({ isReady: ready }),
    onStartGame: () => void startGame(),
  }

  return (
    <main className="game-root h-screen overflow-hidden bg-parchment px-4 pt-4 text-zinc-900 lg:px-6 lg:pt-6">
      <ConnectionBanner />
      <BankruptcyOverlay />

      <div
        className={`relative mx-auto flex h-full max-w-[1400px] justify-center gap-5 ${
          isLobby ? 'items-center' : 'items-stretch'
        }`}
      >
        {/* Left rail: lobby settings (desktop only, lobby phase only) */}
        <aside
          className={`hidden lg:flex flex-col overflow-hidden pb-4 transition-all duration-500 ease-in-out ${
            isLobby ? 'w-[300px] opacity-100 mr-2' : 'pointer-events-none w-0 opacity-0'
          }`}
        >
          <div className="max-h-[85vh] w-[300px] overflow-y-auto">
            <LobbySettings {...lobbySettingsProps} />
          </div>
        </aside>

        {/* Center: the board */}
        <section className="flex min-w-0 flex-1 flex-col items-center justify-center self-center pb-4">
          <Board />
        </section>

        {/* Right rail (desktop) */}
        {isLobby ? (
          <aside className="hidden w-[360px] flex-shrink-0 self-center lg:block">
            <div className="max-h-[85vh] overflow-y-auto">
              <PlayerList {...playerListProps} />
            </div>
          </aside>
        ) : (
          <aside className="hidden h-full w-[360px] flex-shrink-0 flex-col gap-4 overflow-hidden pb-4 lg:flex">
            <ActionPanel roomId={roomId} onOpenTrade={() => setTradeOpen(true)} onOpenProperties={() => setPropertiesOpen(true)} placement="sidebar" />
            <PlayerDashboard roomId={roomId} />
            <GameLog />
          </aside>
        )}

        {/* Mobile: tabbed panel below the board */}
        <section className="w-full lg:hidden">
          <div className="space-y-4 pb-16">
            <div className="grid grid-cols-2 rounded-md border border-salmon-line/40 bg-salmon p-1 shadow-sm">
              <button
                onClick={() => setMobilePanel('players')}
                className={`rounded px-3 py-2 text-sm font-bold transition-all ${
                  mobilePanel === 'players' ? 'bg-pine text-white shadow-sm' : 'text-zinc-800 hover:text-zinc-950'
                }`}
              >
                Players
              </button>
              <button
                onClick={() => setMobilePanel(isLobby ? 'settings' : 'log')}
                className={`rounded px-3 py-2 text-sm font-bold transition-all ${
                  mobilePanel !== 'players' ? 'bg-pine text-white shadow-sm' : 'text-zinc-800 hover:text-zinc-950'
                }`}
              >
                {isLobby ? 'Settings' : 'Log'}
              </button>
            </div>

            {isLobby ? (
              mobilePanel === 'players' ? <PlayerList {...playerListProps} /> : <LobbySettings {...lobbySettingsProps} />
            ) : mobilePanel === 'players' ? (
              <PlayerDashboard roomId={roomId} />
            ) : (
              <GameLog />
            )}
          </div>
        </section>
      </div>

      {!isLobby ? (
        <>
          {/* Always mounted (not inside a hidden rail) so the timer keeps enforcing on every viewport. */}
          <TurnTimer roomId={roomId} selfPlayerId={selfPlayer?.id} isActivePlayer={activePlayer?.id === selfPlayer?.id} />
          <DebtOverlay roomId={roomId} onManage={() => setPropertiesOpen(true)} />
          <ActionPanel roomId={roomId} onOpenTrade={() => setTradeOpen(true)} onOpenProperties={() => setPropertiesOpen(true)} placement="mobile" />
        </>
      ) : null}

      {/* Single mounts for room-wide overlays */}
      {gamePhase === 'auction' && auctionPropertyId ? <AuctionPanel roomId={roomId} onClose={() => undefined} /> : null}
      <TradeOfferModal roomId={roomId} />

      {tradeOpen ? <TradePanel roomId={roomId} onClose={() => setTradeOpen(false)} /> : null}
      {propertiesOpen ? (
        <Modal title="Manage properties" onClose={() => setPropertiesOpen(false)} width="max-w-3xl" hideHeader>
          <PropertyManager roomId={roomId} playerId={selfPlayer?.id ?? ''} onClose={() => setPropertiesOpen(false)} />
        </Modal>
      ) : null}
    </main>
  )
}
