/**
 * The sound-cue registry and the pure rules around it.
 *
 * Deliberately free of browser APIs so the mapping and volume logic can be unit
 * tested like the rest of the engine. The playback side lives in
 * `lib/game-client/audio.ts`.
 */

export type SoundCue =
  | 'dice'
  | 'token-step'
  | 'buy'
  | 'card-draw'
  | 'turn-start'
  | 'timer-warn'
  | 'trade-offer'
  | 'trade-accept'
  | 'trade-reject'
  | 'bid'
  | 'player-join'
  | 'jail'
  | 'jail-out'
  | 'ui-click'
  | 'ui-error'

export type CueDefinition = {
  /** Path under `public/`. */
  src: string
  /** Per-cue trim, 0–1, applied on top of the master volume. */
  gain: number
  /**
   * How many copies of this cue may sound at once. A second roll can never
   * overlap the first (the dice are busy), so one voice is enough.
   */
  voices: number
}

export const CUES: Record<SoundCue, CueDefinition> = {
  dice: { src: '/audio/dice-roll.mp3', gain: 0.55, voices: 1 },
  // Two voices: a card/jail relocation moves the token twice inside the staging
  // hold, and the second tap must not cut the first off.
  //
  // Louder than a soft tap would suggest: the token starts moving on the same
  // storage delta that the dice are still clattering over, so at a lower gain it
  // was firing (verified) but sitting underneath the dice clip.
  'token-step': { src: '/audio/token-step.mp3', gain: 0.6, voices: 2 },
  buy: { src: '/audio/buy.mp3', gain: 0.6, voices: 1 },
  'card-draw': { src: '/audio/card-draw.mp3', gain: 0.55, voices: 1 },
  // Both of these are private to the active player — everyone hearing someone
  // else's countdown would be maddening. See GameSounds / TurnTimer.
  // Pushed high: it peaks at -11.7 dBFS, quiet for a cue whose whole job is to be
  // noticed by someone not looking at the screen.
  'turn-start': { src: '/audio/turn-start.mp3', gain: 0.9, voices: 1 },
  'timer-warn': { src: '/audio/timer-warn.mp3', gain: 0.6, voices: 1 },
  // Recipient-only, and it has to cut through whatever they were looking at, so
  // it sits at the 1.0 ceiling — the source peaks at -16.3 dBFS and volume can
  // only attenuate. If it still reads quiet, the file has to be regenerated hotter.
  'trade-offer': { src: '/audio/trade-offer.mp3', gain: 1, voices: 1 },
  // Fires for everyone watching the auction except the bidder, who already got a
  // click from the button. Two voices: bids land back-to-back in the last seconds.
  //
  // Trimmed hard: this file arrived at -0.5 dBFS, hotter than the dice, and it is
  // the most repeated cue in the game. 0.3 puts it alongside the token tap.
  bid: { src: '/audio/bid.mp3', gain: 0.3, voices: 2 },
  'trade-accept': { src: '/audio/trade-accept.mp3', gain: 0.8, voices: 1 },
  // A comedic cue fires on every declined trade, so it is tuned to sit just under
  // its pair: the joke has to survive being heard ten times in one game. The file
  // peaks at -8.1 dBFS, hotter than the accept, so the gain pulls it back down.
  'trade-reject': { src: '/audio/trade-reject.mp3', gain: 0.45, voices: 1 },
  // Two voices: a lobby can fill faster than the chime is long. Left quiet on
  // purpose — it can fire several times in a row as a room fills.
  'player-join': { src: '/audio/player-join.mp3', gain: 0.5, voices: 2 },
  // The pair arrived 5 dB apart (jail -9.8 dBFS, jail-out -4.5). Going to jail is
  // the bigger moment of the two, so it gets the higher gain to land level with it.
  jail: { src: '/audio/jail.mp3', gain: 0.9, voices: 1 },
  'jail-out': { src: '/audio/jail-out.mp3', gain: 0.6, voices: 1 },
  // The UI cues are trimmed low on purpose: they fire far more often than the
  // game cues, and anything punchy becomes fatiguing within a single turn.
  //
  // These gains are calibrated against each clip's measured peak, not picked by
  // feel — the source files are mastered 20+ dB apart. This one peaks at -29 dBFS
  // (the quietest in the pack), so it needs 0.5 to sit where the old click sat at
  // 0.25. Volume can only attenuate, so 1.0 is the ceiling: re-measure and re-tune
  // this number whenever the file is swapped.
  'ui-click': { src: '/audio/ui-click.mp3', gain: 0.5, voices: 2 },
  'ui-error': { src: '/audio/ui-error.mp3', gain: 0.45, voices: 1 },
}

/** Considerate default — loud enough to register, quiet enough to leave on. */
export const DEFAULT_MASTER_VOLUME = 0.7

export type VolumeState = {
  muted: boolean
  master: number
}

/**
 * Final HTMLAudioElement volume for a cue. Clamped, because a corrupted
 * persisted preference must not throw inside the audio element setter.
 */
export function resolveVolume(cue: SoundCue, state: VolumeState): number {
  if (state.muted) return 0
  const master = clamp01(state.master)
  return clamp01(master * CUES[cue].gain)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Cues that are only distinguishable from the game log.
 *
 * A trade acceptance and a rejection look identical in storage from the outside —
 * both clear `tradeOffer` and return to `playing`. The log line written in the same
 * transaction is the only signal that separates them, and it arrives in the same
 * delta as the state change, so it carries no ordering risk.
 *
 * This couples the cue to a message string in `app/api/game/trade/route.ts`. That
 * is deliberate and tested: an exact match, so a reworded log line fails the test
 * here rather than silently going quiet in production.
 */
const LOG_CUES: ReadonlyArray<readonly [string, SoundCue]> = [
  ['Trade accepted.', 'trade-accept'],
  ['Trade rejected.', 'trade-reject'],
]

export function cueForLogMessage(message: string): SoundCue | null {
  for (const [text, cue] of LOG_CUES) {
    if (message === text) return cue
  }
  return null
}

/** Parses a persisted preference blob, falling back to the defaults on any junk. */
export function parseStoredPreference(raw: string | null): VolumeState {
  const fallback: VolumeState = { muted: false, master: DEFAULT_MASTER_VOLUME }
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<VolumeState>
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : fallback.muted,
      master: typeof parsed.master === 'number' ? clamp01(parsed.master) : fallback.master,
    }
  } catch {
    return fallback
  }
}
