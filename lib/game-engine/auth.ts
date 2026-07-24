import { createHmac, timingSafeEqual } from 'node:crypto'
import type { JsonStorage, Player } from '@/lib/liveblocks.config'

/**
 * Server-side player/host authentication for the game API routes.
 *
 * A token is a stateless HMAC over `roomId:subject`, where `subject` is either a
 * playerId (`player-<n>`) or the literal HOST_SUBJECT. Tokens are never stored in
 * Liveblocks storage (which is client-readable) — only a `tokenClaimed` flag is.
 * The secret falls back to LIVEBLOCKS_SECRET_KEY so no new env var is required,
 * though GAME_TOKEN_SECRET is recommended in production.
 */

export const HOST_SUBJECT = 'host'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

function tokenSecret(): string {
  const secret = process.env.GAME_TOKEN_SECRET ?? process.env.LIVEBLOCKS_SECRET_KEY
  if (!secret) throw new Error('GAME_TOKEN_SECRET (or LIVEBLOCKS_SECRET_KEY) is not configured')
  return secret
}

export function signGameToken(roomId: string, subject: string): string {
  return createHmac('sha256', tokenSecret()).update(`${roomId}:${subject}`).digest('hex')
}

export function verifyToken(roomId: string, subject: string, token: string | null | undefined): boolean {
  if (!token) return false
  const expected = Buffer.from(signGameToken(roomId, subject), 'utf8')
  const provided = Buffer.from(token, 'utf8')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

/** Reads the bearer token clients attach to every game action. */
export function readPlayerToken(req: Request): string | null {
  return req.headers.get('x-player-token')
}

/**
 * Verifies the caller holds the token for `playerId` and returns that player from
 * storage. Throws AuthError (→ 403) otherwise. This is the single source of truth
 * for "who is calling" — routes must derive the acting player from here, never from
 * an unauthenticated body field.
 */
export function authenticatePlayer(
  storage: JsonStorage,
  roomId: string,
  playerId: string | undefined,
  token: string | null | undefined,
): Player {
  if (!playerId) throw new AuthError('Missing playerId')
  if (!verifyToken(roomId, playerId, token)) throw new AuthError('Invalid player token')
  const player = storage.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new AuthError('Player is not seated in this room')
  return player
}

/** Verifies the caller holds the room's host token. Throws AuthError (→ 403) otherwise. */
export function authenticateHost(roomId: string, token: string | null | undefined): void {
  if (!verifyToken(roomId, HOST_SUBJECT, token)) throw new AuthError('Invalid host token')
}
