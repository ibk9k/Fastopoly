'use client'

import { nanoid } from 'nanoid'
import { useMemo, useState } from 'react'
import type { TradeOffer } from '@/lib/liveblocks.config'
import { useOthers, useSelf, useStorage } from '@/lib/liveblocks.config'
import { colorForGroup, formatMoney, isTradableProperty, playerIdFromConnection, postJson, propertyDisplayName, resolveLocalPlayer } from '@/components/game/helpers'
import { getTile } from '@/lib/game-engine/board'

type TradePanelProps = {
  roomId: string
  onClose: () => void
}

type TradeResponse = {
  success: boolean
}

function clampCash(value: string, max: number): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 0
  return Math.min(Math.max(parsed, 0), Math.max(max, 0))
}

function toggleSelection(current: string[], propertyId: string): string[] {
  return current.includes(propertyId) ? current.filter((id) => id !== propertyId) : [...current, propertyId]
}

export default function TradePanel({ roomId, onClose }: TradePanelProps) {
  const self = useSelf()
  const others = useOthers()
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const properties = useStorage((root) => root.properties)
  const selfPlayer = resolveLocalPlayer(players, self)
  const [targetPlayerId, setTargetPlayerId] = useState('')
  const [offeredProperties, setOfferedProperties] = useState<string[]>([])
  const [requestedProperties, setRequestedProperties] = useState<string[]>([])
  const [offeredCashInput, setOfferedCashInput] = useState('0')
  const [requestedCashInput, setRequestedCashInput] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  const connectedTargets = useMemo(() => {
    return others
      .map((other) => {
        const connectionPlayerId = playerIdFromConnection(other.connectionId)
        const exactMatch = players.find((player) => player.id === connectionPlayerId)
        if (exactMatch) return exactMatch

        const username = other.presence?.username
        if (username) {
          return players.find((player) => player.username === username)
        }
        return undefined
      })
      .filter((player): player is NonNullable<typeof player> => Boolean(player && !player.isBankrupt))
  }, [others, players])

  const targetPlayer = players.find((player) => player.id === targetPlayerId)
  const offeredCash = clampCash(offeredCashInput, selfPlayer?.cash ?? 0)
  const requestedCash = clampCash(requestedCashInput, targetPlayer?.cash ?? 0)

  const ownTradableProperties = useMemo(() => {
    if (!selfPlayer || !properties) return []
    return selfPlayer.properties.filter((propertyId) => isTradableProperty(properties[propertyId]))
  }, [properties, selfPlayer])

  const targetTradableProperties = useMemo(() => {
    if (!targetPlayer || !properties) return []
    return targetPlayer.properties.filter((propertyId) => isTradableProperty(properties[propertyId]))
  }, [properties, targetPlayer])

  const validationError = useMemo(() => {
    if (!selfPlayer) return 'You are not seated in this game.'
    if (!targetPlayer) return 'Choose a player to trade with.'
    if (selfPlayer.id === targetPlayer.id) return 'Choose a different player.'
    if (offeredCash > selfPlayer.cash) return 'You do not have enough cash for this offer.'
    if (requestedCash > targetPlayer.cash) return `${targetPlayer.username} does not have enough cash.`
    if (!properties) return 'Property state is still loading.'

    const invalidOffered = offeredProperties.some((propertyId) => {
      const property = properties[propertyId]
      return property?.ownerId !== selfPlayer.id || !isTradableProperty(property)
    })
    if (invalidOffered) return 'You can only offer your unmortgaged, building-free properties.'

    const invalidRequested = requestedProperties.some((propertyId) => {
      const property = properties[propertyId]
      return property?.ownerId !== targetPlayer.id || !isTradableProperty(property)
    })
    if (invalidRequested) return 'You can only request unmortgaged, building-free target properties.'

    const givesNothing = offeredProperties.length === 0 && offeredCash === 0
    const getsNothing = requestedProperties.length === 0 && requestedCash === 0
    if (givesNothing && getsNothing) return 'Add cash or at least one property to the offer.'

    return ''
  }, [offeredCash, offeredProperties, properties, requestedCash, requestedProperties, selfPlayer, targetPlayer])

  async function sendOffer() {
    if (!selfPlayer || !targetPlayer || validationError) return
    setSubmitting(true)
    setServerError('')

    const offer: TradeOffer = {
      id: nanoid(),
      fromPlayerId: selfPlayer.id,
      toPlayerId: targetPlayer.id,
      offeredProperties,
      requestedProperties,
      offeredCash,
      requestedCash,
      status: 'pending',
    }

    try {
      await postJson<TradeResponse>('/api/game/trade', { roomId, offer, action: 'propose' })
      onClose()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Trade offer failed')
    } finally {
      setSubmitting(false)
    }
  }

  function renderPropertyCheckbox(propertyId: string, selected: boolean, onToggle: () => void) {
    const tile = getTile(propertyId)
    return (
      <label key={propertyId} className="flex cursor-pointer items-center gap-3 rounded-md border border-[#e58a74]/30 bg-white/60 px-3 py-2 text-sm text-zinc-900 hover:border-[#d28b7a]">
        <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-emerald-700" />
        <span className="h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: colorForGroup(tile?.colorGroup) }} />
        <span className="min-w-0 flex-1 truncate font-semibold">{propertyDisplayName(propertyId)}</span>
      </label>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8 text-zinc-900">
      <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#d28b7a] bg-[#F7F0E4] p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-zinc-900">Trade</h2>
            <p className="text-sm text-zinc-700">Choose a connected player, then shape the offer.</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-[#d28b7a] bg-white/20 px-3 py-2 text-sm font-bold text-zinc-800 hover:border-[#b86e5e] hover:bg-white/40">
            Cancel
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-700">Target player</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {connectedTargets.length === 0 ? <p className="text-sm text-zinc-700">No connected opponents are available.</p> : null}
            {connectedTargets.map((player) => (
              <button
                key={player.id}
                onClick={() => {
                  setTargetPlayerId(player.id)
                  setRequestedProperties([])
                  setRequestedCashInput('0')
                }}
                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold transition ${
                  targetPlayerId === player.id ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-[#d28b7a]/40 bg-[#EFA38F]/30 text-zinc-800 hover:border-[#d28b7a]'
                }`}
              >
                <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: player.color }} />
                {player.username}
              </button>
            ))}
          </div>
        </div>

        {targetPlayer ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-[#e58a74]/30 bg-white/50 p-4">
              <h3 className="font-bold text-zinc-900">You give</h3>
              <label className="mt-3 block text-sm font-semibold text-zinc-700">
                Cash
                <input
                  type="number"
                  min={0}
                  max={selfPlayer?.cash ?? 0}
                  value={offeredCashInput}
                  onChange={(event) => setOfferedCashInput(String(clampCash(event.target.value, selfPlayer?.cash ?? 0)))}
                  className="mt-1 w-full rounded-md border border-[#d28b7a] bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-600"
                />
              </label>
              <div className="mt-4 grid gap-2">
                {ownTradableProperties.length === 0 ? <p className="text-sm text-zinc-700">No tradable properties.</p> : null}
                {ownTradableProperties.map((propertyId) =>
                  renderPropertyCheckbox(propertyId, offeredProperties.includes(propertyId), () =>
                    setOfferedProperties((current) => toggleSelection(current, propertyId)),
                  ),
                )}
              </div>
            </div>

            <div className="rounded-md border border-[#e58a74]/30 bg-white/50 p-4">
              <h3 className="font-bold text-zinc-900">You get</h3>
              <label className="mt-3 block text-sm font-semibold text-zinc-700">
                Cash from {targetPlayer.username}
                <input
                  type="number"
                  min={0}
                  max={targetPlayer.cash}
                  value={requestedCashInput}
                  onChange={(event) => setRequestedCashInput(String(clampCash(event.target.value, targetPlayer.cash)))}
                  className="mt-1 w-full rounded-md border border-[#d28b7a] bg-white px-3 py-2 text-zinc-900 outline-none focus:border-emerald-600"
                />
              </label>
              <div className="mt-4 grid gap-2">
                {targetTradableProperties.length === 0 ? <p className="text-sm text-zinc-700">No tradable properties.</p> : null}
                {targetTradableProperties.map((propertyId) =>
                  renderPropertyCheckbox(propertyId, requestedProperties.includes(propertyId), () =>
                    setRequestedProperties((current) => toggleSelection(current, propertyId)),
                  ),
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black text-red-900">{serverError || validationError}</p>
          <button
            onClick={() => void sendOffer()}
            disabled={Boolean(validationError) || submitting}
            className="rounded-md bg-[#1a472a] px-5 py-3 text-sm font-black text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Send Offer'}
          </button>
        </div>
      </section>
    </div>
  )
}
