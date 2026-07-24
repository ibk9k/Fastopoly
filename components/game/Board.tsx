/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Tile from '@/components/game/Tile'
import PlayerToken from '@/components/game/PlayerToken'
import PropertyDetailModal from '@/components/game/PropertyDetailModal'
import { BOARD, getTile } from '@/lib/game-engine/board'
import { tileIndexToGridPosition } from '@/lib/game-engine/board-layout'
import { formatMoney, resolveLocalPlayer } from '@/components/game/helpers'
import { useSelf, useStorage } from '@/lib/liveblocks.config'
import { useParams } from 'next/navigation'
import CardsListModal from '@/components/game/CardsListModal'
import FlyingCard from '@/components/game/FlyingCard'
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from '@/lib/game-engine/cards'
import DiceRoller from '@/components/game/DiceRoller'
import { useGameActions } from '@/hooks/useGameActions'

export default function Board() {
  const params = useParams<{ roomId: string }>()
  const roomId = params.roomId
  const properties = useStorage((root) => root.properties)
  const storedPlayers = useStorage((root) => root.players)
  const players = useMemo(() => storedPlayers ?? [], [storedPlayers])
  const mapType = useStorage((root) => root.mapType) ?? 'classic'
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const lastDiceRoll = useStorage((root) => root.lastDiceRoll)
  const hasRolled = useStorage((root) => root.hasRolled) ?? false
  const self = useSelf()

  const activePlayer = players[currentPlayerIndex]
  const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)
  const isActivePlayer = Boolean(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id)

  const ownersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [activeCardList, setActiveCardList] = useState<'chance' | 'community_chest' | null>(null)

  // 3D Dice states
  const [isRolling, setIsRolling] = useState(false)
  const rollCompleteResolverRef = useRef<(() => void) | null>(null)
  const gamePhase = useStorage((root) => root.gamePhase)

  function waitForDiceRollComplete(): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        rollCompleteResolverRef.current = null
        resolve()
      }
      rollCompleteResolverRef.current = finish
      // Failsafe: the server has already resolved the roll, so the animation is
      // purely cosmetic. If it never reports completion — e.g. the tab was
      // backgrounded and the WebGL context stalled — don't leave isRolling (and
      // therefore the dice) stuck. 3.5s comfortably exceeds a normal ~1.9s roll.
      window.setTimeout(finish, 3500)
    })
  }

  function handleDiceRollComplete() {
    rollCompleteResolverRef.current?.()
  }

  const canRoll = Boolean(selfPlayer && gamePhase === 'playing' && isActivePlayer && !isRolling && !hasRolled && (selfPlayer.cash ?? 0) >= 0)

  const actions = useGameActions(roomId, selfPlayer?.id)
  const isSubmitting = actions.busyAction !== null
  const rules = useStorage((root) => root.rules)

  const pendingBuy = useMemo(() => {
    if (gamePhase !== 'buy_decision' || !activePlayer) return null
    const tile = BOARD[activePlayer.position]
    if (!tile || (tile.type !== 'property' && tile.type !== 'railroad' && tile.type !== 'utility')) return null
    const prop = properties?.[tile.id]
    if (prop?.ownerId) return null
    return {
      propertyId: tile.id,
      name: tile.name,
      price: tile.price ?? 0,
    }
  }, [gamePhase, activePlayer, properties])

  const isInDebt = Boolean(selfPlayer && selfPlayer.cash < 0)
  const showEndTurn = Boolean(
    isActivePlayer &&
    !selfPlayer?.inJail &&
    !isInDebt &&
    (
      (gamePhase === 'playing' && hasRolled && !pendingBuy) ||
      (gamePhase === 'buy_decision' && !(rules?.auctionOnPass))
    )
  )
  const showJailActions = Boolean(isActivePlayer && selfPlayer?.inJail && gamePhase === 'playing' && !hasRolled)

  async function handleBuy() {
    if (!selfPlayer || !pendingBuy || isSubmitting) return
    await actions.buy(pendingBuy.propertyId, pendingBuy.name)
  }

  async function handleAuction() {
    if (!selfPlayer || isSubmitting) return
    await actions.passPurchase()
  }

  async function handleJailAction(action: 'pay' | 'use_card') {
    if (!selfPlayer || isSubmitting) return
    await actions.jail(action)
  }

  async function handleEndTurn() {
    if (!selfPlayer || isSubmitting) return
    if (gamePhase === 'buy_decision') {
      await actions.passPurchase()
    } else {
      await actions.endTurn()
    }
  }

  // Handle dice click. The server resolves movement AND the landing (rent/card/tax)
  // in one atomic call — the dice animation is purely visual and gates nothing.
  async function handleDiceClick() {
    if (!canRoll) return

    setIsRolling(true)
    const rollCompletePromise = waitForDiceRollComplete()
    try {
      if (selfPlayer?.inJail) {
        const result = await actions.jail('roll')
        if (result?.dice) {
          await rollCompletePromise
        } else {
          rollCompleteResolverRef.current = null
        }
      } else {
        const result = await actions.roll()
        if (result) {
          await rollCompletePromise
        } else {
          rollCompleteResolverRef.current = null
        }
      }
    } finally {
      setIsRolling(false)
    }
  }

  const selectedTile = selectedTileId ? getTile(selectedTileId) : undefined
  const selectedProperty = selectedTileId && properties ? properties[selectedTileId] : undefined
  const selectedOwner = selectedProperty?.ownerId ? ownersById.get(selectedProperty.ownerId) : undefined

  return (
    <>
      <div className="board-wrapper relative mx-auto w-full rounded-2xl border-[5px] border-[#2f4d20] bg-[#BAED91] shadow-[0_15px_45px_rgba(47,77,32,0.18),_0_4px_12px_rgba(0,0,0,0.08),_inset_0_1px_1px_rgba(255,255,255,0.25)]">
        <div className="board-grid grid h-full w-full gap-[3px] p-[3px] bg-[#2f4d20]/30 rounded-[11px]" style={{
          gridTemplateColumns: '1.5fr repeat(9, 1fr) 1.5fr',
          gridTemplateRows: '1.5fr repeat(9, 1fr) 1.5fr',
        }}>
          {/* Center area */}
          <div
            className="relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-[#BAED91] text-center shadow-[inset_0_4px_10px_rgba(0,0,0,0.06)]"
            style={{ gridColumn: '2 / span 9', gridRow: '2 / span 9' }}
          >
            <div className="absolute inset-[2.5cqw] border border-[#2f4d20]/20" />

            {/* Card decks */}
            <div className="relative z-10 flex w-full items-center justify-center gap-[3.5cqw] px-[3cqw]">
              {/* Community Chest deck button */}
              <button
                id="community-chest-deck-btn"
                className="group relative cursor-pointer focus:outline-none transition-transform duration-200 z-20"
                onClick={() => setActiveCardList('community_chest')}
                title="View Community Chest Cards"
              >
                {/* Stacked card shadows */}
                <div className="absolute left-[0.4cqw] top-[0.4cqw] rotate-[4deg] h-[15.5cqw] w-[11cqw] rounded-[1cqw] border border-[#a2c8fd]/60 bg-[#a2c8fd] transition-transform duration-200 group-hover:translate-x-[0.1cqw] group-hover:translate-y-[0.1cqw]" />
                <div className="absolute left-[0.2cqw] top-[0.2cqw] rotate-[2deg] h-[15.5cqw] w-[11cqw] rounded-[1cqw] border border-[#a2c8fd]/80 bg-[#cfe2fe] transition-transform duration-200 group-hover:translate-x-[0.05cqw] group-hover:translate-y-[0.05cqw]" />
                <div className="relative flex h-[15.5cqw] w-[11cqw] flex-col items-center justify-center rounded-[1cqw] border-[0.2cqw] border-[#6ca5fc] bg-gradient-to-br from-[#cfe2fe] to-[#a2c8fd] shadow-md transition-all duration-200 group-hover:-translate-y-[0.3cqw] group-hover:scale-105 group-hover:shadow-[0_8px_16px_rgba(108,165,252,.4)]">
                  <img
                    src="/Chest.png"
                    alt="Community Chest"
                    className="h-[6.5cqw] w-[6.5cqw] object-contain"
                  />
                  <p className="mt-[1cqw] text-center text-[0.9cqw] font-black uppercase leading-[1.1] tracking-wider text-[#204a87]">
                    Community<br />Chest
                  </p>
                </div>
              </button>

              {/* Game title spacer and absolute logo */}
              <div className="relative flex flex-col items-center justify-center w-[27cqw] h-[11.5cqw] flex-shrink-0">
                <img
                  src="/Logo.png"
                  alt="FASTOPOLY"
                  className="absolute w-[38cqw] h-[15.75cqw] max-w-none object-contain drop-shadow-[0_0.5cqw_0.8cqw_rgba(0,0,0,0.15)] pointer-events-none z-0"
                />
                
                {/* 3D Dice Roller floating on the green felt */}
                <div className="absolute top-[112%] z-30 pointer-events-auto flex flex-col items-center gap-[1.5cqw]">
                  <DiceRoller
                    size="5.5cqw"
                    rollTrigger={lastDiceRoll}
                    turnIndex={currentPlayerIndex}
                    onClick={canRoll ? handleDiceClick : undefined}
                    onRollComplete={handleDiceRollComplete}
                    disabled={!canRoll}
                    glow={isActivePlayer && (gamePhase === 'playing' || gamePhase === 'buy_decision')}
                  />

                  {/* Buttons below the dice */}
                  {isActivePlayer && (
                    <div className="flex gap-[1.4cqw] justify-center mt-[1.8cqw] z-30">
                      {showJailActions ? (
                        <>
                          <button
                            onClick={() => handleJailAction('pay')}
                            disabled={isSubmitting || (selfPlayer?.cash ?? 0) < 50}
                            className="rounded-[0.8cqw] bg-[#FDE68A] hover:bg-[#FCD34D] text-[#78350F] font-black px-[2.4cqw] py-[0.95cqw] text-[0.95cqw] uppercase shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.15)] border-[0.15cqw] border-[#FCD34D]/40 transition duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Pay $50
                          </button>
                          <button
                            onClick={() => handleJailAction('use_card')}
                            disabled={isSubmitting || (selfPlayer?.getOutOfJailCards ?? 0) === 0}
                            className="rounded-[0.8cqw] bg-[#FBCFE8] hover:bg-[#F9A8D4] text-[#831843] font-black px-[2.4cqw] py-[0.95cqw] text-[0.95cqw] uppercase shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.15)] border-[0.15cqw] border-[#F472B6]/40 transition duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Use Card
                          </button>
                          <button
                            onClick={handleDiceClick}
                            disabled={isSubmitting || isRolling}
                            className="rounded-[0.8cqw] bg-[#BFDBFE] hover:bg-[#93C5FD] text-[#1E3A8A] font-black px-[2.4cqw] py-[0.95cqw] text-[0.95cqw] uppercase shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.15)] border-[0.15cqw] border-[#60A5FA]/40 transition duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Roll Doubles
                          </button>
                        </>
                      ) : (
                        <>
                          {pendingBuy ? (
                            <button
                              onClick={handleBuy}
                              disabled={isSubmitting || (selfPlayer?.cash ?? 0) < pendingBuy.price}
                              className="rounded-[0.8cqw] bg-[#A7F3D0] hover:bg-[#6EE7B7] text-[#064E3B] font-black px-[2.4cqw] py-[0.95cqw] text-[0.95cqw] uppercase shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.15)] border-[0.15cqw] border-[#34D399]/40 transition duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Buy {formatMoney(pendingBuy.price)}
                            </button>
                          ) : null}

                          {rules?.auctionOnPass && pendingBuy ? (
                            <button
                              onClick={handleAuction}
                              disabled={isSubmitting}
                              className="rounded-[0.8cqw] bg-[#FBCFE8] hover:bg-[#F9A8D4] text-[#831843] font-black px-[2.4cqw] py-[0.95cqw] text-[0.95cqw] uppercase shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.15)] border-[0.15cqw] border-[#F472B6]/40 transition duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Auction
                            </button>
                          ) : showEndTurn ? (
                            <button
                              onClick={handleEndTurn}
                              disabled={isSubmitting}
                              className="rounded-[0.8cqw] bg-[#BFDBFE] hover:bg-[#93C5FD] text-[#1E3A8A] font-black px-[2.4cqw] py-[0.95cqw] text-[0.95cqw] uppercase shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.15)] border-[0.15cqw] border-[#60A5FA]/40 transition duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              End Turn
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Chance deck button */}
              <button
                id="chance-deck-btn"
                className="group relative cursor-pointer focus:outline-none transition-transform duration-200 z-20"
                onClick={() => setActiveCardList('chance')}
                title="View Chance Cards"
              >
                {/* Stacked card shadows */}
                <div className="absolute left-[0.4cqw] top-[0.4cqw] rotate-[4deg] h-[15.5cqw] w-[11cqw] rounded-[1cqw] border border-[#fcb78f]/60 bg-[#fcb78f] transition-transform duration-200 group-hover:translate-x-[0.1cqw] group-hover:translate-y-[0.1cqw]" />
                <div className="absolute left-[0.2cqw] top-[0.2cqw] rotate-[2deg] h-[15.5cqw] w-[11cqw] rounded-[1cqw] border border-[#fcb78f]/80 bg-[#fedec9] transition-transform duration-200 group-hover:translate-x-[0.05cqw] group-hover:translate-y-[0.05cqw]" />
                <div className="relative flex h-[15.5cqw] w-[11cqw] flex-col items-center justify-center rounded-[1cqw] border-[0.2cqw] border-[#f89e6c] bg-gradient-to-br from-[#fedec9] to-[#fcb78f] shadow-md transition-all duration-200 group-hover:-translate-y-[0.3cqw] group-hover:scale-105 group-hover:shadow-[0_8px_16px_rgba(248,158,108,.4)]">
                  <img
                    src="/Chance.png"
                    alt="Chance"
                    className="h-[6.5cqw] w-[6.5cqw] object-contain"
                  />
                  <p className="mt-[1cqw] text-center text-[1.0cqw] font-black uppercase leading-[1.1] tracking-wider text-[#7f3d17]">
                    Chance
                  </p>
                </div>
              </button>
            </div>
          </div>

          {BOARD.map((tile) => {
            const pos = tileIndexToGridPosition(tile.index)
            const property = properties?.[tile.id]
            const owner = property?.ownerId ? ownersById.get(property.ownerId) : undefined
            return (
              <Tile
                key={tile.id}
                tile={tile}
                property={property}
                owner={owner}
                gridPos={pos}
                onClick={() => setSelectedTileId(tile.id)}
              />
            )
          })}
        </div>
        <PlayerToken />
      </div>

      {selectedTile && properties ? (
        <PropertyDetailModal
          tile={selectedTile}
          property={selectedProperty}
          owner={selectedOwner}
          selfPlayer={selfPlayer}
          isActivePlayer={isActivePlayer}
          allProperties={properties}
          roomId={roomId}
          onClose={() => setSelectedTileId(null)}
        />
      ) : null}

      {activeCardList ? (
        <CardsListModal
          type={activeCardList}
          cards={activeCardList === 'chance' ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS}
          onClose={() => setActiveCardList(null)}
        />
      ) : null}

      <FlyingCard />
    </>
  )
}
