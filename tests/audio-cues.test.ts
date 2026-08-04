import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CUES,
  DEFAULT_MASTER_VOLUME,
  cueForLogMessage,
  parseStoredPreference,
  resolveVolume,
} from '@/lib/audio/cues'

describe('resolveVolume', () => {
  it('scales the cue gain by the master volume', () => {
    expect(resolveVolume('dice', { muted: false, master: 1 })).toBe(CUES.dice.gain)
    expect(resolveVolume('dice', { muted: false, master: 0.5 })).toBeCloseTo(
      CUES.dice.gain * 0.5,
    )
  })

  it('returns silence when muted, whatever the master volume', () => {
    expect(resolveVolume('dice', { muted: true, master: 1 })).toBe(0)
  })

  it('clamps out-of-range and non-finite master volumes', () => {
    expect(resolveVolume('dice', { muted: false, master: 5 })).toBe(CUES.dice.gain)
    expect(resolveVolume('dice', { muted: false, master: -1 })).toBe(0)
    expect(resolveVolume('dice', { muted: false, master: Number.NaN })).toBe(0)
  })

  it('never exceeds 1, which the audio element setter would reject', () => {
    for (const cue of Object.keys(CUES) as (keyof typeof CUES)[]) {
      expect(resolveVolume(cue, { muted: false, master: 1 })).toBeLessThanOrEqual(1)
    }
  })
})

describe('the cue registry', () => {
  it('ships a file for every registered cue', () => {
    // A registered-but-unshipped cue is silent in production and impossible to
    // tell apart from a wiring bug, so it fails here instead.
    for (const [cue, definition] of Object.entries(CUES)) {
      expect(definition.src, `${cue} must be served from /audio`).toMatch(/^\/audio\//)
      expect(
        existsSync(join(process.cwd(), 'public', definition.src)),
        `public${definition.src} is missing`,
      ).toBe(true)
    }
  })

  it('gives every cue at least one voice', () => {
    for (const definition of Object.values(CUES)) {
      expect(definition.voices).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('cueForLogMessage', () => {
  it('maps each trade outcome to its own cue', () => {
    expect(cueForLogMessage('Trade accepted.')).toBe('trade-accept')
    expect(cueForLogMessage('Trade rejected.')).toBe('trade-reject')
  })

  it('is an exact match, so a near-miss goes silent rather than sounding wrong', () => {
    expect(cueForLogMessage('Trade accepted')).toBeNull()
    expect(cueForLogMessage('Alex says: Trade accepted.')).toBeNull()
  })

  it('ignores ordinary log lines', () => {
    expect(cueForLogMessage('Alex rolled a 3 and a 4.')).toBeNull()
    expect(cueForLogMessage('')).toBeNull()
  })

  it('still matches the strings the trade route actually writes', () => {
    // The cues are coupled to log messages. If someone rewords the route, this
    // fails here instead of the sound silently disappearing in production.
    const route = readFileSync(join(process.cwd(), 'app/api/game/trade/route.ts'), 'utf8')
    expect(route).toContain("addLog(storage, 'Trade accepted.')")
    expect(route).toContain("addLog(storage, 'Trade rejected.')")
  })
})

describe('parseStoredPreference', () => {
  it('falls back to the defaults with nothing stored', () => {
    expect(parseStoredPreference(null)).toEqual({
      muted: false,
      master: DEFAULT_MASTER_VOLUME,
    })
  })

  it('round-trips a valid preference', () => {
    expect(parseStoredPreference('{"muted":true,"master":0.4}')).toEqual({
      muted: true,
      master: 0.4,
    })
  })

  it('ignores malformed JSON and wrong-typed fields', () => {
    expect(parseStoredPreference('not json')).toEqual({
      muted: false,
      master: DEFAULT_MASTER_VOLUME,
    })
    expect(parseStoredPreference('{"muted":"yes","master":"loud"}')).toEqual({
      muted: false,
      master: DEFAULT_MASTER_VOLUME,
    })
  })

  it('clamps a stored master volume that is out of range', () => {
    expect(parseStoredPreference('{"master":99}').master).toBe(1)
    expect(parseStoredPreference('{"master":-3}').master).toBe(0)
  })
})
