'use client'

/**
 * Client-side storage for the HMAC action tokens the server issues.
 *
 * - Player tokens are claimed (once) per seat via /api/game/claim-token and stored
 *   keyed by roomId + playerId, so they survive reloads/reconnects.
 * - The host token is handed to the room creator by /api/lobby/create.
 *
 * `postJson` (in components/game/helpers.ts) reads these to attach `x-player-token`
 * to every game action. Nothing here is secret-derivation — the server owns the secret.
 */

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function playerTokenKey(roomId: string, playerId: string): string {
  return `fastopoly-token-${roomId}-${playerId}`
}

export function hostTokenKey(roomId: string): string {
  return `fastopoly-host-${roomId}`
}

export function getStoredPlayerToken(roomId: string, playerId: string): string | null {
  return safeLocalStorage()?.getItem(playerTokenKey(roomId, playerId)) ?? null
}

export function setStoredPlayerToken(roomId: string, playerId: string, token: string): void {
  safeLocalStorage()?.setItem(playerTokenKey(roomId, playerId), token)
}

export function getStoredHostToken(roomId: string): string | null {
  return safeLocalStorage()?.getItem(hostTokenKey(roomId)) ?? null
}

export function setStoredHostToken(roomId: string, token: string): void {
  safeLocalStorage()?.setItem(hostTokenKey(roomId), token)
}

export function getStoredUsername(): string | null {
  const store = safeLocalStorage()
  try {
    return (
      (typeof window !== 'undefined' ? window.sessionStorage.getItem('fastopoly_username') : null) ??
      store?.getItem('fastopoly_username') ??
      null
    )
  } catch {
    return store?.getItem('fastopoly_username') ?? null
  }
}

// De-duplicate concurrent claims for the same seat so a burst of actions issues one request.
const inFlightClaims = new Map<string, Promise<string | null>>()

/** Returns the cached player token, or claims it once and caches it. */
export async function ensurePlayerToken(
  roomId: string,
  playerId: string,
  username: string,
): Promise<string | null> {
  const existing = getStoredPlayerToken(roomId, playerId)
  if (existing) return existing

  const key = playerTokenKey(roomId, playerId)
  const pending = inFlightClaims.get(key)
  if (pending) return pending

  const claim = (async () => {
    try {
      const response = await fetch('/api/game/claim-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, playerId, username }),
      })
      const data = (await response.json().catch(() => ({}))) as { token?: string }
      if (response.ok && data.token) {
        setStoredPlayerToken(roomId, playerId, data.token)
        return data.token
      }
      return null
    } catch {
      return null
    } finally {
      inFlightClaims.delete(key)
    }
  })()

  inFlightClaims.set(key, claim)
  return claim
}
