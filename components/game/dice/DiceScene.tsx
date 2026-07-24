'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Die from './Die'
import { getQuaternionForFace } from './dice-orientations'
import {
  BOUNCE_MS,
  SETTLE_MS,
  SPIN_MIN_MS,
  bounceOffset,
  createSpinVelocity,
  slerpQuaternion,
  type RollPhase,
} from './dice-roll-animation'

export type DiceSceneProps = {
  rollTrigger?: { d1: number; d2: number; timestamp: number } | null
  onRollingChange?: (rolling: boolean) => void
  onRollComplete?: () => void
  startRollSignal?: number
}

type DieAnimState = {
  phase: RollPhase
  quaternion: THREE.Quaternion
  spinVelocity: THREE.Vector3
  settleFrom: THREE.Quaternion
  settleTo: THREE.Quaternion
  targetValue: number
}

function createDieState(value: number): DieAnimState {
  return {
    phase: 'idle',
    quaternion: getQuaternionForFace(value).clone(),
    spinVelocity: new THREE.Vector3(),
    settleFrom: new THREE.Quaternion(),
    settleTo: new THREE.Quaternion(),
    targetValue: value,
  }
}

function applySpin(state: DieAnimState, delta: number) {
  const axis = state.spinVelocity
  const speed = axis.length() * delta
  if (speed <= 0) return
  const normalized = axis.clone().normalize()
  const spinQuat = new THREE.Quaternion().setFromAxisAngle(normalized, speed)
  state.quaternion.multiply(spinQuat)
  state.spinVelocity.multiplyScalar(0.985)
}

export default function DiceScene({
  rollTrigger,
  onRollingChange,
  onRollComplete,
  startRollSignal = 0,
}: DiceSceneProps) {
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const die1GroupRef = useRef<THREE.Group>(null)
  const die2GroupRef = useRef<THREE.Group>(null)
  const die1Ref = useRef(createDieState(rollTrigger?.d1 ?? 3))
  const die2Ref = useRef(createDieState(rollTrigger?.d2 ?? 4))
  const rollStartRef = useRef(0)
  const settleStartRef = useRef(0)
  const bounceStartRef = useRef(0)
  const targetRef = useRef<{ d1: number; d2: number } | null>(null)
  const lastTimestampRef = useRef(rollTrigger?.timestamp ?? 0)
  const isInitializedRef = useRef(false)
  const completeFiredRef = useRef(false)
  const phaseRef = useRef<RollPhase>('idle')
  const bounceYRef = useRef(0)

  const notifyRolling = useCallback(
    (rolling: boolean) => {
      onRollingChange?.(rolling)
    },
    [onRollingChange],
  )

  const beginRoll = useCallback(
    (initialTarget?: { d1: number; d2: number }) => {
      targetRef.current = initialTarget ?? null
      rollStartRef.current = performance.now()
      settleStartRef.current = 0
      bounceStartRef.current = 0
      completeFiredRef.current = false
      phaseRef.current = 'spin'
      bounceYRef.current = 0

      die1Ref.current.phase = 'spin'
      die1Ref.current.spinVelocity = createSpinVelocity()
      die2Ref.current.phase = 'spin'
      die2Ref.current.spinVelocity = createSpinVelocity()

      notifyRolling(true)
      // Kick the render loop: in frameloop="demand" the canvas is otherwise idle.
      invalidate()
    },
    [notifyRolling, invalidate],
  )

  useEffect(() => {
    if (!rollTrigger) return

    if (!isInitializedRef.current) {
      isInitializedRef.current = true
      lastTimestampRef.current = rollTrigger.timestamp
      die1Ref.current = createDieState(rollTrigger.d1)
      die2Ref.current = createDieState(rollTrigger.d2)
      applyGroupTransforms()
      invalidate()
      return
    }

    if (rollTrigger.timestamp !== lastTimestampRef.current) {
      lastTimestampRef.current = rollTrigger.timestamp
      targetRef.current = { d1: rollTrigger.d1, d2: rollTrigger.d2 }
      if (phaseRef.current === 'idle') {
        beginRoll(targetRef.current)
      }
    }
  }, [rollTrigger, beginRoll, invalidate])

  useEffect(() => {
    if (startRollSignal === 0) return
    targetRef.current = null
    beginRoll()
  }, [startRollSignal, beginRoll])

  // Recover from WebGL context loss (common when a tab is backgrounded for a while):
  // preventDefault lets the browser restore it, and we force a repaint on restore /
  // when the tab becomes visible — otherwise frameloop="demand" leaves stale/black dice.
  useEffect(() => {
    const canvas = gl.domElement
    const onContextLost = (event: Event) => event.preventDefault()
    const onContextRestored = () => invalidate()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') invalidate()
    }
    canvas.addEventListener('webglcontextlost', onContextLost as EventListener, false)
    canvas.addEventListener('webglcontextrestored', onContextRestored, false)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost as EventListener)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [gl, invalidate])

  function applyGroupTransforms() {
    die1GroupRef.current?.quaternion.copy(die1Ref.current.quaternion)
    die2GroupRef.current?.quaternion.copy(die2Ref.current.quaternion)
    if (die1GroupRef.current) die1GroupRef.current.position.y = bounceYRef.current
    if (die2GroupRef.current) die2GroupRef.current.position.y = bounceYRef.current
  }

  useFrame((_, delta) => {
    const now = performance.now()
    const elapsed = now - rollStartRef.current
    const target = targetRef.current
    const phase = phaseRef.current

    if (phase === 'spin') {
      applySpin(die1Ref.current, delta)
      applySpin(die2Ref.current, delta)

      const canSettle = target && elapsed >= SPIN_MIN_MS

      if (canSettle) {
        const d1 = target?.d1 ?? die1Ref.current.targetValue
        const d2 = target?.d2 ?? die2Ref.current.targetValue

        die1Ref.current.settleFrom.copy(die1Ref.current.quaternion)
        die1Ref.current.settleTo.copy(getQuaternionForFace(d1))
        die1Ref.current.targetValue = d1
        die1Ref.current.phase = 'settle'

        die2Ref.current.settleFrom.copy(die2Ref.current.quaternion)
        die2Ref.current.settleTo.copy(getQuaternionForFace(d2))
        die2Ref.current.targetValue = d2
        die2Ref.current.phase = 'settle'

        settleStartRef.current = now
        phaseRef.current = 'settle'
      }
    } else if (phase === 'settle') {
      const settleElapsed = now - settleStartRef.current
      const t = Math.min(settleElapsed / SETTLE_MS, 1)

      die1Ref.current.quaternion.copy(
        slerpQuaternion(die1Ref.current.settleFrom, die1Ref.current.settleTo, t),
      )
      die2Ref.current.quaternion.copy(
        slerpQuaternion(die2Ref.current.settleFrom, die2Ref.current.settleTo, t),
      )

      if (t >= 1) {
        die1Ref.current.quaternion.copy(die1Ref.current.settleTo)
        die2Ref.current.quaternion.copy(die2Ref.current.settleTo)
        phaseRef.current = 'bounce'
        bounceStartRef.current = now
      }
    } else if (phase === 'bounce') {
      const bounceElapsed = now - bounceStartRef.current
      const t = Math.min(bounceElapsed / BOUNCE_MS, 1)
      bounceYRef.current = bounceOffset(t) * 0.35

      if (t >= 1) {
        bounceYRef.current = 0
        phaseRef.current = 'idle'
        notifyRolling(false)
        if (!completeFiredRef.current) {
          completeFiredRef.current = true
          onRollComplete?.()
        }
      }
    }

    applyGroupTransforms()

    // Keep the demand-driven loop alive only while an animation is in progress.
    if (phaseRef.current !== 'idle') invalidate()
  })

  const identityQuat = new THREE.Quaternion()

  return (
    <group>
      <group ref={die1GroupRef} position={[-0.75, 0, 0]}>
        <Die quaternion={identityQuat} />
      </group>
      <group ref={die2GroupRef} position={[0.75, 0, 0]}>
        <Die quaternion={identityQuat} />
      </group>
    </group>
  )
}
