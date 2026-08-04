'use client'

import Button from '@/components/ui/Button'
import { useAudioPreference } from '@/hooks/useAudioPreference'
import { toggleMuted } from '@/lib/game-client/audio'

/**
 * Sound on/off, persisted in localStorage. Accessibility parity with the
 * `prefers-reduced-motion` handling in globals.css: audio is never something the
 * player is stuck with.
 */
export default function SoundToggle({ className = '' }: { className?: string }) {
  const { muted } = useAudioPreference()

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => toggleMuted()}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
      className={`!rounded-full !px-2.5 !py-2 backdrop-blur-none ${className}`}
    >
      <SpeakerIcon muted={muted} />
    </Button>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {muted ? (
        <>
          <path d="m17 9 4 6" />
          <path d="m21 9-4 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a9 9 0 0 1 0 12" />
        </>
      )}
    </svg>
  )
}
