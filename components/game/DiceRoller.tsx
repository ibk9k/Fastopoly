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

  const isClickable = Boolean(onClick) && !isRolling && !disabled

  const sceneProps: DiceSceneProps = {
    rollTrigger,
    startRollSignal,
    onRollingChange: setIsRolling,
    onRollComplete: handleRollComplete,
  }

  const inner = (
    <div
      className="relative flex items-center justify-center"
      style={{ width: `calc(${sizeValue} * 3.2)`, height: canvasHeight }}
    >
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,235,120,0.55) 0%, rgba(255,235,120,0) 70%)',
          }}
        />
      )}
      <DiceCanvas {...sceneProps} />
    </div>
  )

  // ALWAYS the same element type. Switching between <button> and <div> here made
  // React remount the subtree — including the three.js <Canvas> — on every turn
  // change and roll start, leaking a WebGL context each time (browsers then kill
  // the oldest context → glitched dice + degrading performance). A single stable
  // <button> keeps the canvas mounted for the whole game; `disabled` covers the
  // non-actionable states and keeps it out of the tab order as a dead control.
  return (
    <button
      type="button"
      onClick={handleLocalClick}
      disabled={!isClickable}
      aria-label={isRolling ? 'Rolling the dice' : isClickable ? 'Roll the dice' : 'Dice (waiting for your turn)'}
      className={`flex select-none flex-col items-center justify-center rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 ${
        isClickable ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default opacity-90'
      }`}
    >
      {inner}
    </button>
  )
}
