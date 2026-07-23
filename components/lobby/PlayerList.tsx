'use client'

import Button from '@/components/ui/Button'
import { truncateUsername } from '@/components/game/helpers'

export type LobbyPlayer = {
  id: string
  username: string
  color: string
  isReady: boolean
  isHost: boolean
  isSelf: boolean
}

type PlayerListProps = {
  players: LobbyPlayer[]
  canStart: boolean
  starting: boolean
  isHost: boolean
  hostUsername?: string | null
  onToggleReady: (ready: boolean) => void
  onStartGame: () => void
}

/** The lobby players card — one implementation for every viewport. */
export default function PlayerList({ players, canStart, starting, isHost, hostUsername, onToggleReady, onStartGame }: PlayerListProps) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-salmon-line/60 bg-salmon p-5 text-zinc-900 shadow-card">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-salmon-line/40 pb-2">
          <h2 className="font-display text-lg uppercase tracking-wider text-zinc-900">Players</h2>
          <span className="text-xs font-bold text-zinc-700">{players.length} in room</span>
        </div>

        <ul className="grid gap-2.5">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-salmon-line/40 bg-white/25 px-3.5 py-2.5 shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{ background: player.color }}
                />
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span title={player.username} className="text-sm font-extrabold leading-snug text-zinc-900 break-words">
                    {truncateUsername(player.username, 10)}
                  </span>
                  {player.isHost ? (
                    <span className="inline-flex items-center rounded bg-pine px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-felt shrink-0">
                      Host
                    </span>
                  ) : null}
                  {player.isSelf ? (
                    <span className="inline-flex items-center text-[9px] font-bold uppercase text-zinc-600 shrink-0">
                      (you)
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-extrabold uppercase ${player.isReady ? 'text-success' : 'text-danger'}`}>
                  {player.isReady ? '✓ Ready' : 'Not Ready'}
                </span>
                {player.isSelf ? (
                  <Button variant="secondary" size="sm" onClick={() => onToggleReady(!player.isReady)}>
                    {player.isReady ? 'Unready' : 'Ready'}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 border-t border-salmon-line/40 pt-4">
        {isHost ? (
          <>
            <Button className="w-full" size="lg" disabled={!canStart} loading={starting} onClick={onStartGame}>
              {starting ? 'Starting…' : 'Start Game'}
            </Button>
            {!canStart ? (
              <p className="mt-2 text-center text-[10px] font-bold leading-normal text-danger">
                Everyone must be ready before the game can start.
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-salmon-line/30 bg-white/25 p-3.5 text-center text-xs font-extrabold text-zinc-800">
            Waiting for {hostUsername ? <span className="font-black text-pine">{truncateUsername(hostUsername, 10)}</span> : 'the host'} to start the game…
          </div>
        )}
      </div>
    </div>
  )
}
