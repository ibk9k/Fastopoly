import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/lib/liveblocks.config'
import {
  MAX_MESSAGES,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_INTERVAL_MS,
  appendMessage,
  normalizeMessage,
  validateMessage,
} from '@/lib/game-engine/chat'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    authorId: 'user-a',
    username: 'Alex',
    text: 'hi',
    timestamp: 1_000,
    ...overrides,
  }
}

describe('normalizeMessage', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeMessage('  hello   there  ')).toBe('hello there')
  })

  it('flattens newlines, so one message cannot scroll the panel', () => {
    expect(normalizeMessage('a\n\n\n\n\nb')).toBe('a b')
  })
})

describe('validateMessage', () => {
  it('accepts an ordinary message', () => {
    const result = validateMessage('want to trade?', 'user-a', [], 5_000)
    expect(result).toEqual({ ok: true, text: 'want to trade?' })
  })

  it('rejects whitespace-only messages', () => {
    expect(validateMessage('   \n  ', 'user-a', [], 5_000)).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects anything over the length cap', () => {
    const long = 'x'.repeat(MAX_MESSAGE_LENGTH + 1)
    expect(validateMessage(long, 'user-a', [], 5_000)).toEqual({ ok: false, reason: 'too-long' })
  })

  it('accepts a message exactly at the cap', () => {
    const exact = 'x'.repeat(MAX_MESSAGE_LENGTH)
    expect(validateMessage(exact, 'user-a', [], 5_000)).toEqual({ ok: true, text: exact })
  })

  it('rate limits the same author', () => {
    const history = [message({ authorId: 'user-a', timestamp: 5_000 })]
    expect(validateMessage('again', 'user-a', history, 5_500)).toEqual({
      ok: false,
      reason: 'too-fast',
    })
  })

  it('allows the same author once the interval has passed', () => {
    const history = [message({ authorId: 'user-a', timestamp: 5_000 })]
    const result = validateMessage('again', 'user-a', history, 5_000 + MIN_MESSAGE_INTERVAL_MS)
    expect(result).toEqual({ ok: true, text: 'again' })
  })

  it('does not rate limit a different author', () => {
    // One chatty player must not mute everyone else in the room.
    const history = [message({ authorId: 'user-a', timestamp: 5_000 })]
    expect(validateMessage('hello', 'user-b', history, 5_100)).toEqual({
      ok: true,
      text: 'hello',
    })
  })
})

describe('appendMessage', () => {
  it('appends in order', () => {
    const result = appendMessage([message({ id: 'm1' })], message({ id: 'm2' }))
    expect(result.map((entry) => entry.id)).toEqual(['m1', 'm2'])
  })

  it('drops the oldest once the retention cap is reached', () => {
    // Chat shares the game's storage document, which every client holds in memory,
    // so unbounded history is a real memory and bandwidth cost.
    const full = Array.from({ length: MAX_MESSAGES }, (_, index) =>
      message({ id: `m${index}`, timestamp: index }),
    )
    const result = appendMessage(full, message({ id: 'newest' }))
    expect(result).toHaveLength(MAX_MESSAGES)
    expect(result[0].id).toBe('m1')
    expect(result[result.length - 1].id).toBe('newest')
  })
})
