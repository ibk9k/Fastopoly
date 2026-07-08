'use client'

import type { CSSProperties } from 'react'
import { tileIndexToFractionalCenter } from '@/lib/game-engine/board-layout'
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

export default function PlayerToken() {
  const players = useStorage((root) => root.players) ?? []
  const activePlayers = players.filter((player) => !player.isBankrupt)
  const tileCounts = new Map<string, number>()

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {activePlayers.map((player) => {
        let { x, y } = tileIndexToFractionalCenter(player.position)
        let key = String(player.position)

        if (player.position === 10) {
          if (player.inJail) {
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
              player.inJail
                ? 'border-[2px] border-red-600 shadow-red-500/60 ring-1 ring-black/40'
                : 'border-2 border-white/85 shadow-black/60'
            }`}
            style={style}
            title={player.inJail ? `${player.username} (In Jail)` : `${player.username} (Just Visiting)`}
          >
            {player.username.slice(0, 1)}
          </div>
        )
      })}
    </div>
  )
}
