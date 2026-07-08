import * as THREE from 'three'

export const SPIN_MIN_MS = 450
export const SETTLE_MS = 750
export const BOUNCE_MS = 700

export type RollPhase = 'idle' | 'spin' | 'settle' | 'bounce'

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function createSpinVelocity(): THREE.Vector3 {
  return new THREE.Vector3(
    8 + Math.random() * 6,
    10 + Math.random() * 8,
    6 + Math.random() * 6,
  )
}

export function slerpQuaternion(
  from: THREE.Quaternion,
  to: THREE.Quaternion,
  t: number,
): THREE.Quaternion {
  return from.clone().slerp(to, easeOutCubic(t))
}

/** Upward bounce offset on Y axis (0–1 progress). */
export function bounceOffset(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0
  const p = progress
  if (p < 0.25) return 0.22 * (p / 0.25)
  if (p < 0.45) return 0.22 - 0.3 * ((p - 0.25) / 0.2)
  if (p < 0.6) return -0.08 + 0.14 * Math.sin(((p - 0.45) / 0.15) * Math.PI)
  if (p < 0.75) return 0.04 * Math.sin(((p - 0.6) / 0.15) * Math.PI)
  return 0.01 * (1 - (p - 0.75) / 0.25)
}
