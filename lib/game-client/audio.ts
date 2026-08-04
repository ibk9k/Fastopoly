'use client'

/**
 * The one place that knows about browser audio.
 *
 * Everything outside this file says `playCue('dice')` and nothing else — preload,
 * the autoplay unlock dance, the voice pool and the persisted mute preference all
 * stay behind that call.
 *
 * Deliberate choices:
 * - **Nothing is fetched until the first user gesture.** The mobile page weight
 *   budget is hard-won (see assets/original/README.md); audio must not add bytes
 *   to first paint. `armAudio()` attaches one-shot gesture listeners; the clips
 *   are created, primed and cached at that point.
 * - **Cues are played locally off the rendered state**, never off a broadcast
 *   event, so a clip can't race the storage delta that visually explains it —
 *   the same failure that made tokens teleport before the animation ran.
 */

import {
  CUES,
  DEFAULT_MASTER_VOLUME,
  parseStoredPreference,
  resolveVolume,
  type SoundCue,
  type VolumeState,
} from '@/lib/audio/cues'

const STORAGE_KEY = 'fastopoly-audio'

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

let preference: VolumeState = { muted: false, master: DEFAULT_MASTER_VOLUME }
let hydrated = false
let unlocked = false
let armed = false

const listeners = new Set<(state: VolumeState) => void>()
const voices = new Map<SoundCue, HTMLAudioElement[]>()

function hydrate(): VolumeState {
  if (hydrated) return preference
  hydrated = true
  preference = parseStoredPreference(safeLocalStorage()?.getItem(STORAGE_KEY) ?? null)
  return preference
}

function persist() {
  try {
    safeLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // A full or blocked storage quota must never break playback.
  }
}

function emit() {
  for (const listener of listeners) listener(preference)
}

function loadVoices(cue: SoundCue): HTMLAudioElement[] {
  const cached = voices.get(cue)
  if (cached) return cached

  const definition = CUES[cue]
  const pool = Array.from({ length: definition.voices }, () => {
    const element = new Audio(definition.src)
    element.preload = 'auto'
    element.volume = resolveVolume(cue, hydrate())
    return element
  })
  voices.set(cue, pool)
  return pool
}

/**
 * Satisfies the autoplay policy: a muted play/pause inside the gesture handler
 * marks every cached element as user-activated, so later programmatic plays are
 * allowed. Without this the first few cues fail silently.
 */
function unlock() {
  if (unlocked) return
  unlocked = true

  for (const cue of Object.keys(CUES) as SoundCue[]) {
    for (const element of loadVoices(cue)) {
      const restore = element.volume
      element.volume = 0
      void element
        .play()
        .then(() => {
          element.pause()
          element.currentTime = 0
          element.volume = restore
        })
        .catch(() => {
          element.volume = restore
        })
    }
  }
}

/** Opt out of the global click cue: `<button data-cue="none">`. */
const CUE_OPT_OUT = '[data-cue="none"]'
const CLICKABLE = 'button:not([disabled]), [role="button"]'

/**
 * One delegated listener instead of a cue at every call site.
 *
 * The app has ~40 raw `<button>` elements alongside the `ui/Button` primitive —
 * property tiles, auction bids, panel tabs, modal dismissals. Wiring each one
 * would be a large diff that silently rots the moment someone adds a button, so
 * the cue is delegated here and controls opt out with `data-cue="none"`.
 *
 * `pointerdown` rather than `click`: it fires on press, which reads as responsive,
 * and it is suppressed on disabled controls for free.
 */
function installClickCue() {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest(CLICKABLE)
      if (!control || control.closest(CUE_OPT_OUT)) return
      playCue('ui-click')
    },
    { capture: true, passive: true },
  )
}

/**
 * Starts listening for the first user gesture and installs the global click cue.
 * Safe to call on every mount — the work is idempotent.
 */
export function armAudio(): void {
  if (armed || typeof window === 'undefined') return
  armed = true
  hydrate()

  const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart']
  const handler = () => {
    unlock()
    for (const event of events) window.removeEventListener(event, handler)
  }
  for (const event of events) {
    window.addEventListener(event, handler, { once: false, passive: true })
  }

  installClickCue()
}

/**
 * Plays a cue if audio is unlocked and unmuted. Never throws and never awaits —
 * callers sit on animation paths where a rejected play must not matter.
 */
export function playCue(cue: SoundCue): void {
  if (typeof window === 'undefined') return
  const state = hydrate()
  if (state.muted) return

  const volume = resolveVolume(cue, state)
  if (volume <= 0) return

  const pool = loadVoices(cue)
  // Prefer a free voice; if every one is busy, restart the oldest so a repeated
  // cue always sounds rather than being swallowed.
  const element = pool.find((voice) => voice.paused || voice.ended) ?? pool[0]
  element.volume = volume
  element.currentTime = 0
  void element.play().catch(() => {
    // Autoplay still blocked (no gesture yet) — the next roll will sound.
  })
}

export function getAudioPreference(): VolumeState {
  return hydrate()
}

export function setMuted(muted: boolean): void {
  hydrate()
  preference = { ...preference, muted }
  persist()

  if (muted) {
    for (const pool of voices.values()) {
      for (const element of pool) {
        element.pause()
        element.currentTime = 0
      }
    }
  }
  emit()
}

export function toggleMuted(): void {
  setMuted(!hydrate().muted)
}

export function subscribeToAudioPreference(
  listener: (state: VolumeState) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
