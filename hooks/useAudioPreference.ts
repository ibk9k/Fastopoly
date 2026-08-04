'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  armAudio,
  getAudioPreference,
  subscribeToAudioPreference,
} from '@/lib/game-client/audio'
import { DEFAULT_MASTER_VOLUME, type VolumeState } from '@/lib/audio/cues'

// Stable server snapshot: localStorage is unreadable during SSR, so render the
// defaults and let hydration pick up the real preference.
const SERVER_STATE: VolumeState = { muted: false, master: DEFAULT_MASTER_VOLUME }

/** Live view of the persisted sound preference; also arms the autoplay unlock. */
export function useAudioPreference(): VolumeState {
  useEffect(() => {
    armAudio()
  }, [])

  return useSyncExternalStore(
    subscribeToAudioPreference,
    getAudioPreference,
    () => SERVER_STATE,
  )
}
