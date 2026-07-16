'use client'

import { useCallback, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { postJson } from '@/components/game/helpers'

export type GameAction =
  | 'roll'
  | 'buy'
  | 'pass'
  | 'jail-pay'
  | 'jail-card'
  | 'jail-roll'
  | 'end-turn'
  | 'bankrupt'
  | 'build'
  | 'mortgage'

export type JailResponse = {
  success: boolean
  dice?: [number, number]
  canRoll?: boolean
}

export type RollResponse = {
  dice: [number, number]
  newPosition: number
  passedGo: boolean
  action: string
  amount?: number
}

/**
 * The single owner of every in-game API action: request wiring (postJson
 * attaches the player token), a busy flag per action, success toasts, and —
 * critically — error toasts. No caller may swallow a failure silently.
 */
export function useGameActions(roomId: string, playerId: string | undefined) {
  const { toast } = useToast()
  const [busyAction, setBusyAction] = useState<GameAction | null>(null)

  const run = useCallback(
    async <T,>(action: GameAction, task: () => Promise<T>, successMessage?: string | ((result: T) => string)) => {
      if (busyAction) return null
      setBusyAction(action)
      try {
        const result = await task()
        if (successMessage) {
          toast(typeof successMessage === 'function' ? successMessage(result) : successMessage, 'success')
        }
        return result
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Action failed', 'error')
        return null
      } finally {
        setBusyAction(null)
      }
    },
    [busyAction, toast],
  )

  const roll = useCallback(
    () => run('roll', () => postJson<RollResponse>('/api/game/roll', { roomId, playerId })),
    [run, roomId, playerId],
  )

  const buy = useCallback(
    (propertyId: string, name: string) =>
      run('buy', () => postJson('/api/game/buy', { roomId, playerId, propertyId }), `Bought ${name}.`),
    [run, roomId, playerId],
  )

  const passPurchase = useCallback(
    () => run('pass', () => postJson('/api/game/pass-purchase', { roomId, playerId })),
    [run, roomId, playerId],
  )

  const jail = useCallback(
    (action: 'pay' | 'use_card' | 'roll') => {
      const busy: GameAction = action === 'pay' ? 'jail-pay' : action === 'use_card' ? 'jail-card' : 'jail-roll'
      return run(busy, () => postJson<JailResponse>('/api/game/jail', { roomId, playerId, action }))
    },
    [run, roomId, playerId],
  )

  const endTurn = useCallback(
    () => run('end-turn', () => postJson('/api/game/end-turn', { roomId, playerId })),
    [run, roomId, playerId],
  )

  const declareBankruptcy = useCallback(
    () => run('bankrupt', () => postJson('/api/game/bankrupt', { roomId, playerId }), 'You declared bankruptcy.'),
    [run, roomId, playerId],
  )

  return { busyAction, roll, buy, passPurchase, jail, endTurn, declareBankruptcy }
}
