'use client'

import { useEffect } from 'react'
import { resolveLocalPlayer } from '@/components/game/helpers'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { useSelf, useStorage, useUpdateMyPresence } from '@/lib/liveblocks.config'

export function useTurnSync(): void {
  const updateMyPresence = useUpdateMyPresence()
  const self = useSelf()
  const players = useStorage((root) => root.players) ?? []
  const currentPlayerIndex = useStorage((root) => root.currentPlayerIndex) ?? 0
  const connectionStatus = useConnectionStatus()

  useEffect(() => {
    const activePlayer = players[currentPlayerIndex]
    const selfPlayer = resolveLocalPlayer(players, self, activePlayer?.id)

    updateMyPresence({
      isMyTurn: Boolean(activePlayer && selfPlayer && activePlayer.id === selfPlayer.id),
      currentTile: selfPlayer?.position ?? 0,
    })
  }, [connectionStatus, currentPlayerIndex, players, self?.connectionId, updateMyPresence])
}
