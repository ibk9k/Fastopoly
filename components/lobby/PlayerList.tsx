'use client'

import Button from '@/components/ui/Button'

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
  onToggleReady: (ready: boolean) => void
  onStartGame: () => void
}

/** The lobby players card — one implementation for every viewport. */
export default function PlayerList({ players, canStart, starting, isHost, onToggleReady, onStartGame }: PlayerListProps) {
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
              <div className="flex items-center gap-3">
                <span aria-hidden className="h-3 w-3 rounded-full border border-black/10" style={{ background: player.color }} />
                <p className="flex items-center gap-1.5 text-sm font-extrabold leading-none text-zinc-900">
                  {player.username}
                  {player.isHost ? (
                    <span className="rounded bg-pine px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-felt">Host</span>
                  ) : null}
                  {player.isSelf ? <span className="text-[9px] font-bold uppercase text-zinc-600">(you)</span> : null}
                </p>
              </div>

              <div className="flex items-center gap-2">
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
            Waiting for the host to start the game…
          </div>
        )}
      </div>
    </div>
  )
}
