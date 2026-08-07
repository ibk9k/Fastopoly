import type { ChatMessage } from '@/lib/liveblocks.config'

/**
 * Pure rules for player chat. Kept out of the route so the limits are testable —
 * they are the only thing standing between a shared storage document and someone
 * pasting a novel into it 200 times.
 */

export const MAX_MESSAGE_LENGTH = 200

/**
 * Messages retained per room. Chat lives in the same Liveblocks document as the
 * game, and every client holds the whole document in memory, so this is a hard
 * memory and bandwidth bound rather than a cosmetic scrollback limit.
 */
export const MAX_MESSAGES = 100

/** Minimum gap between two messages from the same author. */
export const MIN_MESSAGE_INTERVAL_MS = 1_000

export type ChatRejection = 'empty' | 'too-long' | 'too-fast'

/**
 * Collapses runs of whitespace and trims. Newlines are flattened deliberately:
 * the panel is a single-line feed, and a 200-character message made entirely of
 * newlines would otherwise scroll the log off the screen.
 */
export function normalizeMessage(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

export function validateMessage(
  raw: string,
  authorId: string,
  existing: readonly ChatMessage[],
  now: number,
): { ok: true; text: string } | { ok: false; reason: ChatRejection } {
  const text = normalizeMessage(raw)
  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' }

  // Rate limit read from the document itself, not from process memory: serverless
  // instances don't share memory, so an in-process counter would reset whenever a
  // request landed on a cold instance.
  const lastFromAuthor = lastMessageFrom(existing, authorId)
  if (lastFromAuthor && now - lastFromAuthor.timestamp < MIN_MESSAGE_INTERVAL_MS) {
    return { ok: false, reason: 'too-fast' }
  }

  return { ok: true, text }
}

export function lastMessageFrom(
  messages: readonly ChatMessage[],
  authorId: string,
): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].authorId === authorId) return messages[index]
  }
  return undefined
}

/** Appends and drops the oldest overflow in one step. */
export function appendMessage(
  messages: readonly ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  const next = [...messages, message]
  return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
}

export function rejectionMessage(reason: ChatRejection): string {
  switch (reason) {
    case 'empty':
      return 'Message is empty'
    case 'too-long':
      return `Keep it under ${MAX_MESSAGE_LENGTH} characters`
    case 'too-fast':
      return 'Slow down a moment'
  }
}
