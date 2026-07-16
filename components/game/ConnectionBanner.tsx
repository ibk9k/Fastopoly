'use client'

import { useConnectionStatus } from '@/hooks/useConnectionStatus'

export default function ConnectionBanner() {
  const status = useConnectionStatus()

  if (status === 'connected') return null

  if (status === 'disconnected') {
    return (
      <div className="fixed inset-0 z-critical flex items-center justify-center bg-black/60 px-6">
        <div
          role="alert"
        className="rounded-xl border-[3px] border-danger-line bg-parchment-raised px-6 py-5 text-center shadow-overlay"
        >
          <p className="font-display text-lg uppercase tracking-wide text-danger">Connection lost</p>
          <p className="mt-2 text-sm font-bold text-pine/70">Trying to reconnect you to the game…</p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="fixed left-0 right-0 top-0 z-critical flex items-center justify-center gap-2 border-b-2 border-salmon-line/50 bg-salmon px-4 py-2 text-sm font-extrabold text-zinc-900"
    >
      <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-pine border-t-transparent" />
      Reconnecting…
    </div>
  )
}
