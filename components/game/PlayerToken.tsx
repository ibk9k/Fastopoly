'use client'

import { useEffect, useReducer, useRef } from 'react'
import type { CSSProperties } from 'react'
import { tileIndexToFractionalCenter } from '@/lib/game-engine/board-layout'
import { playCue } from '@/lib/game-client/audio'
import { useStorage } from '@/lib/liveblocks.config'

const FAN_OFFSETS = [
  [0, 0],
  [-7, -7],
  [7, -7],
  [-7, 7],
  [7, 7],
  [0, -11],
  [0, 11],
] as const

/** How long the token dwells on the dice landing tile before a card/jail relocation. */
const STAGE_HOLD_MS = 1000

export default function PlayerToken() {
  const players = useStorage((root) => root.players) ?? []
  const lastDiceRoll = useStorage((root) => root.lastDiceRoll)
  const [, bump] = useReducer((x: number) => x + 1, 0)

  // Staging: when the server relocates a player in the same write as the roll
  // (card move, Go To Jail), `lastDiceRoll.landedOn` arrives in that SAME storage
  // delta as the final position. Deriving the hold at render time (not from a
  // separate broadcast event, which races the delta) means the token goes to the
  // landing tile FIRST, dwells, then hops to its destination — never the reverse.
  const stageRef = useRef<{ ts: number; firstSeen: number } | null>(null)
  if (lastDiceRoll) {
    if (stageRef.current === null) {
      // A roll that predates this mount (page load / reconnect) is not re-staged.
      stageRef.current = { ts: lastDiceRoll.timestamp, firstSeen: 0 }
    } else if (stageRef.current.ts !== lastDiceRoll.timestamp) {
      stageRef.current = { ts: lastDiceRoll.timestamp, firstSeen: Date.now() }
    }
  }

  const stageActive =
    typeof lastDiceRoll?.landedOn === 'number' &&
    Boolean(lastDiceRoll?.playerId) &&
    stageRef.current !== null &&
    Date.now() - stageRef.current.firstSeen < STAGE_HOLD_MS

  // Re-render once the hold expires so the token completes its second hop.
  useEffect(() => {
    if (!stageActive || !stageRef.current) return
    const remaining = STAGE_HOLD_MS - (Date.now() - stageRef.current.firstSeen)
    const timer = setTimeout(bump, Math.max(remaining, 0) + 20)
    return () => clearTimeout(timer)
  }, [stageActive, lastDiceRoll?.timestamp])

  const activePlayers = players.filter((player) => !player.isBankrupt)
  const tileCounts = new Map<string, number>()

  // One tap per move, not per tile: the token CSS-transitions straight to its
  // destination (400 ms), so there are no intermediate hops to voice. A staged
  // card/jail relocation moves twice and correctly taps twice.
  const positionSignature = activePlayers
    .map((player) => {
      const staged = stageActive && lastDiceRoll?.playerId === player.id
      return `${player.id}:${staged ? lastDiceRoll!.landedOn! : player.position}`
    })
    .join('|')
  const lastPositionsRef = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    const next = new Map(
      positionSignature
        .split('|')
        .filter(Boolean)
        .map((pair) => {
          const separator = pair.lastIndexOf(':')
          return [pair.slice(0, separator), pair.slice(separator + 1)] as const
        }),
    )

    // Seed silently on mount: a reload must not tap for positions it merely read.
    if (lastPositionsRef.current === null) {
      lastPositionsRef.current = next
      return
    }

    const previous = lastPositionsRef.current
    lastPositionsRef.current = next

    // Only an existing token that actually moved taps — a player joining, leaving
    // or going bankrupt changes the set without moving anything.
    for (const [id, position] of next) {
      const before = previous.get(id)
      if (before !== undefined && before !== position) {
        playCue('token-step')
        break
      }
    }
  }, [positionSignature])

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {activePlayers.map((player) => {
        const isStagedPlayer = stageActive && lastDiceRoll?.playerId === player.id
        const displayPosition = isStagedPlayer ? lastDiceRoll!.landedOn! : player.position
        // While held on the landing tile, don't show jail placement/styling yet —
        // the player is only "in jail" once the token completes its second hop.
        const showAsJailed = player.inJail && !isStagedPlayer

        let { x, y } = tileIndexToFractionalCenter(displayPosition)
        let key = String(displayPosition)

        if (displayPosition === 10) {
          if (showAsJailed) {
            key = '10_jail'
            // Top-right corner of the bottom-left corner tile (In Jail box)
            x = (0.75 + 0.22) / 12
            y = (11.25 - 0.22) / 12
          } else {
            key = '10_visiting'
            // Bottom-left area of the bottom-left corner tile (Just Visiting strip)
            x = (0.75 - 0.2) / 12
            y = (11.25 + 0.2) / 12
          }
        }

        const stackIndex = tileCounts.get(key) ?? 0
        tileCounts.set(key, stackIndex + 1)
        const offset = FAN_OFFSETS[stackIndex % FAN_OFFSETS.length]
        const style: CSSProperties = {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          marginLeft: offset[0],
          marginTop: offset[1],
          backgroundColor: player.color,
          transition: 'top 400ms ease-in-out, left 400ms ease-in-out, margin 400ms ease-in-out',
        }

        return (
          <div
            key={player.id}
            className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[8px] font-black uppercase text-white shadow-lg transition-all duration-300 sm:h-7 sm:w-7 sm:text-xs ${
              showAsJailed
                ? 'border-[2px] border-red-600 shadow-red-500/60 ring-1 ring-black/40'
                : 'border-2 border-white/85 shadow-black/60'
            }`}
            style={style}
            title={showAsJailed ? `${player.username} (In Jail)` : player.username}
          >
            {player.username.slice(0, 1)}
          </div>
        )
      })}
    </div>
  )
}
