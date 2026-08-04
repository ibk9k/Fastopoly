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
        // A square glow centered on the dice, sized off canvasHeight (not the wide 2:1
        // container) — inset-0 on that non-square box clipped the circular gradient into
        // a pill/ring at the top and bottom. This one has room to stay a full soft circle.
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse"
          style={{
            width: `calc(${canvasHeight} * 1.8)`,
            height: `calc(${canvasHeight} * 1.8)`,
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
      // The dice have their own cue; a UI click on top of it just muddies the roll.
      data-cue="none"
      disabled={!isClickable}
      aria-label={isRolling ? 'Rolling the dice' : isClickable ? 'Roll the dice' : 'Dice (waiting for your turn)'}
      // No focus ring here: Modal restores focus programmatically, which browsers treat
      // as :focus-visible — that painted a dark pine ring around the dice on the felt.
      // The golden glow + hover scale carry the affordance instead.
      className={`flex select-none flex-col items-center justify-center appearance-none border-0 bg-transparent p-0 outline-none focus:outline-none ${
        isClickable ? 'cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95' : 'cursor-default opacity-90'
      }`}
    >
      {inner}
    </button>
  )
}
