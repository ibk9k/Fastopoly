'use client'

import { useState } from 'react'
import type { Tile } from '@/lib/game-engine/board'
import { COLOR_GROUPS } from '@/lib/game-engine/board'
import type { PlayerView, PropertyView } from '@/components/game/helpers'
import { colorForGroup, formatMoney, ownsFullColorGroup, postJson } from '@/components/game/helpers'

type PropertyDetailModalProps = {
  tile: Tile
  property?: PropertyView
  owner?: PlayerView
  selfPlayer?: PlayerView
  isActivePlayer: boolean
  allProperties: Record<string, PropertyView>
  roomId: string
  onClose: () => void
}

type ActionResponse = {
  success: boolean
}

/* ── Tile description for non‑purchasable tiles ─────────────────────── */
const TILE_DESCRIPTIONS: Record<string, string> = {
  go: 'Collect $200 salary as you pass.',
  jail: 'Just visiting — relax!',
  free_parking: 'Take a breather. Nothing happens.',
  go_to_jail: 'Go directly to Jail. Do not pass Go.',
  chance: 'Draw a Chance card.',
  community_chest: 'Draw a Community Chest card.',
  tax: 'Pay your taxes!',
}

export function TileTooltip({ tile }: { tile: Tile }) {
  const desc =
    TILE_DESCRIPTIONS[tile.type] ??
    (tile.tax ? `Pay ${formatMoney(tile.tax)} tax.` : tile.name)

  return (
    <div className="absolute bottom-full left-1/2 z-panel mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#d28b7a] bg-[#EFA38F] px-3 py-1.5 text-xs font-semibold text-zinc-900 shadow-xl">
      {desc}
      <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#d28b7a]" />
    </div>
  )
}

export default function PropertyDetailModal({
  tile,
  property,
  owner,
  selfPlayer,
  isActivePlayer,
  allProperties,
  roomId,
  onClose,
}: PropertyDetailModalProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  const isPurchasable = tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility'
  if (!isPurchasable) return null

  const isOwnProperty = Boolean(selfPlayer && property?.ownerId === selfPlayer.id)
  const canAct = isOwnProperty && isActivePlayer

  const mortgageValue = tile.mortgage ?? 0
  const unmortgageCost = Math.ceil(mortgageValue * 1.1)
  const sellPrice = Math.floor((tile.price ?? 0) / 2)
  const hasBuildings = (property?.houses ?? 0) > 0 || (property?.hotels ?? 0) > 0
  const fullGroup = selfPlayer && property?.ownerId === selfPlayer.id
    ? ownsFullColorGroup(selfPlayer.id, tile.id, allProperties)
    : false
  const isEligibleToBuild = isOwnProperty && !property?.mortgaged && fullGroup && tile.type === 'property'

  async function runAction(propertyId: string, action: string, endpoint: string) {
    setBusyKey(`${propertyId}:${action}`)
    setError('')
    try {
      await postJson<ActionResponse>(endpoint, {
        roomId,
        playerId: selfPlayer?.id,
        propertyId,
        action,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyKey(null)
    }
  }

  /* ── Rent table rows ──────────────────────────────────────────────── */
  function rentRows() {
    if (tile.type === 'railroad') {
      return (
        <>
          <tr><td className="pr-4 text-zinc-700 font-semibold py-1">1 Railroad owned</td><td className="text-right font-bold text-zinc-900">{formatMoney(25)}</td></tr>
          <tr><td className="pr-4 text-zinc-700 font-semibold py-1">2 Railroads owned</td><td className="text-right font-bold text-zinc-900">{formatMoney(50)}</td></tr>
          <tr><td className="pr-4 text-zinc-700 font-semibold py-1">3 Railroads owned</td><td className="text-right font-bold text-zinc-900">{formatMoney(100)}</td></tr>
          <tr><td className="pr-4 text-zinc-700 font-semibold py-1">4 Railroads owned</td><td className="text-right font-bold text-zinc-900">{formatMoney(200)}</td></tr>
        </>
      )
    }
    if (tile.type === 'utility') {
      return (
        <>
          <tr><td className="pr-4 text-zinc-700 font-semibold py-1">1 Utility owned</td><td className="text-right font-bold text-zinc-900">4× dice roll</td></tr>
          <tr><td className="pr-4 text-zinc-700 font-semibold py-1">2 Utilities owned</td><td className="text-right font-bold text-zinc-900">10× dice roll</td></tr>
        </>
      )
    }
    const ladder = tile.rentLadder ?? []
    const baseRent = ladder[0] ?? 0
    return (
      <>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">Base rent (no houses)</td><td className="text-right font-bold text-zinc-900">{formatMoney(baseRent)}</td></tr>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">With 1 house</td><td className="text-right font-bold text-zinc-900">{formatMoney(ladder[1] ?? 0)}</td></tr>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">With 2 houses</td><td className="text-right font-bold text-zinc-900">{formatMoney(ladder[2] ?? 0)}</td></tr>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">With 3 houses</td><td className="text-right font-bold text-zinc-900">{formatMoney(ladder[3] ?? 0)}</td></tr>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">With 4 houses</td><td className="text-right font-bold text-zinc-900">{formatMoney(ladder[4] ?? 0)}</td></tr>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">With hotel</td><td className="text-right font-bold text-zinc-900">{formatMoney(ladder[5] ?? 0)}</td></tr>
        <tr><td className="pr-4 text-zinc-700 font-semibold py-1">Color group owned (no houses)</td><td className="text-right font-bold text-zinc-900">{formatMoney(baseRent * 2)}</td></tr>
      </>
    )
  }

  /* ── Current status text ──────────────────────────────────────────── */
  function statusText() {
    if (!property?.ownerId) return 'Unowned — available for purchase'
    const ownerName = owner?.username ?? 'Unknown'
    const parts = [`Owned by ${ownerName}`]
    if (property.mortgaged) parts.push('(Mortgaged)')
    if (property.hotels > 0) parts.push('· Hotel')
    else if (property.houses > 0) parts.push(`· ${property.houses} house${property.houses > 1 ? 's' : ''}`)
    return parts.join(' ')
  }

  /* ── Count owned in color group (for railroads/utilities display) ─ */
  function ownedInGroupCount(): number {
    if (!property?.ownerId || !tile.colorGroup) return 0
    const groupIds = COLOR_GROUPS[tile.colorGroup] ?? []
    return groupIds.filter((id) => allProperties[id]?.ownerId === property.ownerId).length
  }

  const groupColor = colorForGroup(tile.colorGroup)

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-4 py-8 text-zinc-900" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#d28b7a] bg-[#F7F0E4] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color header bar */}
        <div className="h-3 w-full rounded-t-xl" style={{ backgroundColor: groupColor }} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 border border-[#d28b7a] text-zinc-800 transition hover:bg-white/40 hover:text-zinc-950"
        >
          ✕
        </button>

        <div className="px-5 pb-5 pt-4">
          {/* Property image area */}
          <div
            className="mt-6 flex h-20 items-center justify-center rounded-lg border border-[#e58a74]/30"
            style={{ backgroundColor: `${groupColor}22` }}
          >
            <span className="text-sm font-bold uppercase tracking-widest" style={{ color: groupColor }}>
              {tile.name}
            </span>
          </div>

          {/* Current status */}
          <div className="mt-4 rounded-md border border-[#e58a74]/30 bg-white/50 px-3 py-2">
            <p className="text-xs font-bold uppercase text-zinc-700">Status</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">{statusText()}</p>
            {(tile.type === 'railroad' || tile.type === 'utility') && property?.ownerId ? (
              <p className="mt-0.5 text-xs text-zinc-700 font-semibold">
                {ownedInGroupCount()} of {(COLOR_GROUPS[tile.colorGroup ?? ''] ?? []).length} owned by this player
              </p>
            ) : null}
          </div>

          {/* Rent table */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-700">Rent</p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#e58a74]/20">{rentRows()}</tbody>
            </table>
          </div>

          {/* Property values */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-700">Property Values</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-zinc-700 font-semibold">Purchase price</span>
              <span className="text-right font-bold text-zinc-900">{formatMoney(tile.price ?? 0)}</span>
              {tile.type === 'property' ? (
                <>
                  <span className="text-zinc-700 font-semibold">House cost</span>
                  <span className="text-right font-bold text-zinc-900">{formatMoney(tile.houseCost ?? 0)}</span>
                  <span className="text-zinc-700 font-semibold">Hotel cost</span>
                  <span className="text-right font-bold text-zinc-900">{formatMoney(tile.hotelCost ?? 0)} + 4 houses</span>
                </>
              ) : null}
            </div>
          </div>

          {/* Action buttons */}
          {isOwnProperty && property ? (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-[#e58a74]/20 pt-4">
              {!property.mortgaged && !hasBuildings ? (
                <button
                  onClick={() => void runAction(tile.id, 'mortgage', '/api/game/mortgage')}
                  disabled={!isActivePlayer || busyKey !== null}
                  className="rounded-md border border-amber-700 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mortgage (+{formatMoney(mortgageValue)})
                </button>
              ) : null}
              {property.mortgaged ? (
                <button
                  onClick={() => void runAction(tile.id, 'unmortgage', '/api/game/mortgage')}
                  disabled={!isActivePlayer || (selfPlayer?.cash ?? 0) < unmortgageCost || busyKey !== null}
                  className="rounded-md border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Unmortgage (-{formatMoney(unmortgageCost)})
                </button>
              ) : null}
              {!property.mortgaged && !hasBuildings ? (
                <button
                  onClick={() => void runAction(tile.id, 'sell', '/api/game/mortgage')}
                  disabled={!isActivePlayer || busyKey !== null}
                  className="rounded-md border border-red-700 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-950 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sell (+{formatMoney(sellPrice)})
                </button>
              ) : null}
              {isEligibleToBuild && (property.houses < 4) && property.hotels === 0 ? (
                <button
                  onClick={() => void runAction(tile.id, 'build', '/api/game/build')}
                  disabled={!isActivePlayer || (selfPlayer?.cash ?? 0) < (tile.houseCost ?? 0) || busyKey !== null}
                  className="rounded-md bg-[#1a472a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Build House (-{formatMoney(tile.houseCost ?? 0)})
                </button>
              ) : null}
              {isEligibleToBuild && property.houses === 4 ? (
                <button
                  onClick={() => void runAction(tile.id, 'build', '/api/game/build')}
                  disabled={!isActivePlayer || (selfPlayer?.cash ?? 0) < (tile.hotelCost ?? 0) || busyKey !== null}
                  className="rounded-md bg-[#1a472a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#235d38] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Build Hotel (-{formatMoney(tile.hotelCost ?? 0)})
                </button>
              ) : null}
              {hasBuildings ? (
                <button
                  onClick={() => void runAction(tile.id, 'demolish', '/api/game/build')}
                  disabled={!isActivePlayer || busyKey !== null}
                  className="rounded-md border border-amber-700 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {property.hotels > 0
                    ? `Remove Hotel (+${formatMoney(Math.floor((tile.hotelCost ?? 0) / 2))})`
                    : `Remove House (+${formatMoney(Math.floor((tile.houseCost ?? 0) / 2))})`}
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="mt-3 text-xs font-black text-red-900">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
