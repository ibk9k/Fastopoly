'use client'

import { useEffect, useRef } from 'react'
import { cueForLogMessage } from '@/lib/audio/cues'
import { playCue } from '@/lib/game-client/audio'
import { useOthers, useStorage } from '@/lib/liveblocks.config'

/**
 * Storage-derived cues that have no single component to hang off.
 *
 * Renders nothing; it exists so the cue fires from the same storage delta that
 * produces the visual change, for every client — including one that reconnects
 * mid-turn — rather than from a broadcast that could arrive out of order.
 */
export default function GameSounds({ isMyTurn }: { isMyTurn: boolean }) {
  const properties = useStorage((root) => root.properties)
  const gamePhase = useStorage((root) => root.gamePhase)
  const players = useStorage((root) => root.players)
  const log = useStorage((root) => root.log)
  const peerCount = useOthers().length
  const owners = useRef<Map<string, string | null> | null>(null)
  const wasMyTurn = useRef<boolean | null>(null)
  const jailed = useRef<Map<string, boolean> | null>(null)
  const lastLogId = useRef<string | null>(null)
  const lastPeerCount = useRef<number | null>(null)

  // Private to the player whose turn it is: with a 25 s deadline and a server that
  // auto-rolls on expiry, a player who looked away loses the turn outright.
  const inPlay = gamePhase !== 'lobby' && gamePhase !== 'ended'
  useEffect(() => {
    if (!inPlay) {
      wasMyTurn.current = null
      return
    }
    // Seed silently: arriving on a board where it is already your turn (reload,
    // reconnect) is not the turn *starting*.
    if (wasMyTurn.current === null) {
      wasMyTurn.current = isMyTurn
      return
    }
    const previous = wasMyTurn.current
    wasMyTurn.current = isMyTurn
    // Rolling doubles keeps isMyTurn true, so an extra roll doesn't re-announce.
    if (isMyTurn && !previous) playCue('turn-start')
  }, [isMyTurn, inPlay])

  // Jail, both directions. Derived from the flag rather than the landing, so a
  // card ("Go directly to jail") and three doubles both cue, and everyone hears it.
  useEffect(() => {
    if (!players) return
    const next = new Map(players.map((player) => [player.id, Boolean(player.inJail)]))

    if (jailed.current === null) {
      jailed.current = next
      return
    }
    const previous = jailed.current
    jailed.current = next

    for (const [id, isJailed] of next) {
      const before = previous.get(id)
      if (before === undefined || before === isJailed) continue
      playCue(isJailed ? 'jail' : 'jail-out')
      break
    }
  }, [players])

  // Log-derived cues (see cueForLogMessage): only the log line separates a trade
  // that was accepted from one that was rejected.
  useEffect(() => {
    if (!log || log.length === 0) return
    const latest = log[log.length - 1]

    // Seed silently — a reload must not replay the tail of the log.
    if (lastLogId.current === null) {
      lastLogId.current = latest.id
      return
    }
    if (lastLogId.current === latest.id) return
    lastLogId.current = latest.id

    const cue = cueForLogMessage(latest.message)
    if (cue) playCue(cue)
  }, [log])

  // Lobby arrivals, announced to whoever is already sitting there. The person
  // arriving seeds their own count on mount, so they don't chime at themselves.
  useEffect(() => {
    if (gamePhase !== 'lobby') {
      lastPeerCount.current = null
      return
    }
    if (lastPeerCount.current === null) {
      lastPeerCount.current = peerCount
      return
    }
    const previous = lastPeerCount.current
    lastPeerCount.current = peerCount
    if (peerCount > previous) playCue('player-join')
  }, [gamePhase, peerCount])

  useEffect(() => {
    if (!properties) return

    const next = new Map(
      Object.entries(properties).map(([id, property]) => [id, property.ownerId]),
    )

    // The first snapshot after mount is the existing board, not a purchase —
    // seed it silently or a reload would replay every deed ever bought.
    if (owners.current === null) {
      owners.current = next
      return
    }

    const previous = owners.current
    owners.current = next

    for (const [id, ownerId] of next) {
      // Unowned → owned covers both a direct buy and an auction win. A transfer
      // between players (trade, bankruptcy) is not a purchase and stays silent.
      if (ownerId && previous.get(id) === null) {
        playCue('buy')
        break
      }
    }
  }, [properties])

  return null
}
