'use client'

import { useConnectionStatus } from '@/hooks/useConnectionStatus'

export default function ConnectionBanner() {
  const status = useConnectionStatus()

  if (status === 'connected') return null

  if (status === 'disconnected') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 text-white">
        <div className="rounded-lg border border-red-500/40 bg-zinc-950 px-6 py-5 text-center shadow-2xl">
          <p className="text-lg font-bold">Connection lost</p>
          <p className="mt-2 text-sm text-zinc-300">Attempting to reconnect.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center border-b border-amber-400/20 bg-amber-950/90 px-4 py-2 text-sm font-semibold text-amber-100">
      <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-amber-200 border-t-transparent" />
      Reconnecting...
    </div>
  )
}
