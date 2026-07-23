process.env.GAME_TOKEN_SECRET = 'test-secret-key'

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  HOST_SUBJECT,
  authenticateHost,
  authenticatePlayer,
  signGameToken,
  verifyToken,
} from '@/lib/game-engine/auth'
import { makePlayer, makeStorage } from './factories'

describe('signGameToken / verifyToken', () => {
  it('round-trips a valid token', () => {
    const token = signGameToken('ROOM1', 'player-0')
    expect(verifyToken('ROOM1', 'player-0', token)).toBe(true)
  })

  it('rejects a token signed for a different room', () => {
    const token = signGameToken('ROOM1', 'player-0')
    expect(verifyToken('ROOM2', 'player-0', token)).toBe(false)
  })

  it('rejects a token signed for a different subject', () => {
    const token = signGameToken('ROOM1', 'player-0')
    expect(verifyToken('ROOM1', 'player-1', token)).toBe(false)
  })

  it('rejects empty / malformed tokens without throwing', () => {
    expect(verifyToken('ROOM1', 'player-0', null)).toBe(false)
    expect(verifyToken('ROOM1', 'player-0', '')).toBe(false)
    expect(verifyToken('ROOM1', 'player-0', 'deadbeef')).toBe(false)
  })
})

describe('authenticatePlayer', () => {
  it('returns the seated player for a valid token', () => {
    const storage = makeStorage({ players: [makePlayer({ id: 'player-0' }), makePlayer({ id: 'player-1', username: 'Bob' })] })
    const token = signGameToken('ROOM1', 'player-1')
    const player = authenticatePlayer(storage, 'ROOM1', 'player-1', token)
    expect(player.id).toBe('player-1')
  })

  it('throws AuthError for a forged/absent token', () => {
    const storage = makeStorage({ players: [makePlayer({ id: 'player-0' })] })
    expect(() => authenticatePlayer(storage, 'ROOM1', 'player-0', 'forged')).toThrow(AuthError)
    expect(() => authenticatePlayer(storage, 'ROOM1', 'player-0', null)).toThrow(AuthError)
  })

  it('throws AuthError when the token is valid but the player is not seated', () => {
    const storage = makeStorage({ players: [makePlayer({ id: 'player-0' })] })
    const token = signGameToken('ROOM1', 'player-9')
    expect(() => authenticatePlayer(storage, 'ROOM1', 'player-9', token)).toThrow(AuthError)
  })

  it('prevents impersonation: a token for one player cannot authenticate another', () => {
    const storage = makeStorage({ players: [makePlayer({ id: 'player-0' }), makePlayer({ id: 'player-1' })] })
    const attackerToken = signGameToken('ROOM1', 'player-0')
    // Attacker holds player-0's token but claims to be player-1.
    expect(() => authenticatePlayer(storage, 'ROOM1', 'player-1', attackerToken)).toThrow(AuthError)
  })
})

describe('authenticateHost', () => {
  it('accepts the host token and rejects everything else', () => {
    const hostToken = signGameToken('ROOM1', HOST_SUBJECT)
    expect(() => authenticateHost('ROOM1', hostToken)).not.toThrow()
    expect(() => authenticateHost('ROOM1', signGameToken('ROOM1', 'player-0'))).toThrow(AuthError)
    expect(() => authenticateHost('ROOM1', null)).toThrow(AuthError)
  })
})

describe('token secret configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to sign in production when GAME_TOKEN_SECRET is unset', () => {
    vi.stubEnv('GAME_TOKEN_SECRET', '')
    vi.stubEnv('LIVEBLOCKS_SECRET_KEY', 'liveblocks-key')
    vi.stubEnv('NODE_ENV', 'production')
    // Falling back to the Liveblocks key in prod would couple two unrelated
    // secrets: rotating that key would invalidate every live seat token.
    expect(() => signGameToken('ROOM1', 'player-0')).toThrow(/GAME_TOKEN_SECRET/)
  })

  it('falls back to LIVEBLOCKS_SECRET_KEY outside production', () => {
    vi.stubEnv('GAME_TOKEN_SECRET', '')
    vi.stubEnv('LIVEBLOCKS_SECRET_KEY', 'liveblocks-key')
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => signGameToken('ROOM1', 'player-0')).not.toThrow()
  })
})
