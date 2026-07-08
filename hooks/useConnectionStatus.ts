'use client'

import { useEffect, useState } from 'react'
import { useRoom } from '@/lib/liveblocks.config'

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected'

type RoomStatus = ConnectionStatus | 'initial'

type RoomStatusReader = {
  getConnectionState?: () => RoomStatus
  getStatus?: () => RoomStatus
  subscribe?: (type: 'status', listener: (status: RoomStatus) => void) => (() => void) | void
}

function normalizeStatus(status: RoomStatus | string | undefined): ConnectionStatus {
  if (status === 'connected' || status === 'reconnecting' || status === 'disconnected') return status
  return 'connecting'
}

export function useConnectionStatus(): ConnectionStatus {
  const room = useRoom()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const roomStatus = room as unknown as RoomStatusReader
    const readStatus = () => normalizeStatus(roomStatus.getConnectionState?.() ?? roomStatus.getStatus?.())

    setStatus(readStatus())

    const unsubscribe = roomStatus.subscribe?.('status', (nextStatus) => {
      setStatus(normalizeStatus(nextStatus))
    })

    if (unsubscribe) return unsubscribe

    const intervalId = window.setInterval(() => {
      setStatus(readStatus())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [room])

  return status
}
