'use client'

import { useRef, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import type { DiceSceneProps } from '@/components/game/dice/DiceScene'

const DiceCanvas = dynamic(() => import('@/components/game/dice/DiceCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-[70%] w-[70%] animate-pulse rounded-lg bg-[#fcfaf2]/40" />
    </div>
  ),
})

export type DiceRollerProps = {
  rollTrigger?: { d1: number; d2: number; timestamp: number } | null
  turnIndex?: number
  onClick?: () => void
  size?: number | string
  disabled?: boolean
  glow?: boolean
  onRollComplete?: () => void
}

export default function DiceRoller({
  rollTrigger,
  onClick,
  size = 64,
  disabled = false,
  glow = false,
  onRollComplete,
}: DiceRollerProps) {
  const [startRollSignal, setStartRollSignal] = useState(0)
  const [isRolling, setIsRolling] = useState(false)
  const rollCompleteRef = useRef(onRollComplete)

  rollCompleteRef.current = onRollComplete

  const sizeValue = typeof size === 'number' ? `${size}px` : size
  const canvasHeight =
    typeof size === 'number' ? `${size * 1.6}px` : `calc(${size} * 1.6)`

  const handleRollComplete = useCallback(() => {
    rollCompleteRef.current?.()
  }, [])

  const handleLocalClick = () => {
    if (disabled || isRolling) return
    setStartRollSignal((n) => n + 1)
    onClick?.()
  }

  const isClickable = onClick && !isRolling && !disabled

  const sceneProps: DiceSceneProps = {
    rollTrigger,
    startRollSignal,
    onRollingChange: setIsRolling,
    onRollComplete: handleRollComplete,
  }

  return (
    <div
      onClick={isClickable ? handleLocalClick : undefined}
      className={`flex flex-col items-center justify-center select-none transition-all duration-200 ${
        isClickable ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default opacity-90'
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dice-glow-pulse {
          from { filter: drop-shadow(0 0 8px rgba(255, 235, 120, 0.75)) drop-shadow(0 0 3px rgba(255, 235, 120, 0.5)); }
          to { filter: drop-shadow(0 0 20px rgba(255, 235, 120, 0.98)) drop-shadow(0 0 8px rgba(255, 235, 120, 0.8)); }
        }
        .dice-glow {
          animation: dice-glow-pulse 1.2s infinite alternate;
        }
      `}} />

      <div
        className={`flex items-center justify-center ${glow ? 'dice-glow' : ''}`}
        style={{ width: `calc(${sizeValue} * 3.2)`, height: canvasHeight }}
      >
        <DiceCanvas {...sceneProps} />
      </div>
    </div>
  )
}
