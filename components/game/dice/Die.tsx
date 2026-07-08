'use client'

import { useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { FACE_NORMALS } from './dice-orientations'

const PIP_LAYOUTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const GRID_SPACING = 0.26
const PIP_RADIUS = 0.048
const HALF = 0.5
/** Embed pip spheres so their outer surface is flush with the die face. */
const PIP_INSET = PIP_RADIUS * 0.92
const DICE_RADIUS = 0.14

function gridIndexToLocal(idx: number): [number, number] {
  const col = idx % 3
  const row = Math.floor(idx / 3)
  return [(col - 1) * GRID_SPACING, (1 - row) * GRID_SPACING]
}

function pipPosition(faceValue: number, gridIdx: number): THREE.Vector3 {
  const [lx, ly] = gridIndexToLocal(gridIdx)
  const normal = FACE_NORMALS[faceValue]
  const pos = new THREE.Vector3()

  if (normal.z === 1) {
    pos.set(lx, ly, HALF - PIP_INSET)
  } else if (normal.y === 1) {
    pos.set(lx, HALF - PIP_INSET, -ly)
  } else if (normal.x === -1) {
    pos.set(-HALF + PIP_INSET, ly, -lx)
  } else if (normal.x === 1) {
    pos.set(HALF - PIP_INSET, ly, lx)
  } else if (normal.y === -1) {
    pos.set(lx, -HALF + PIP_INSET, ly)
  } else {
    pos.set(-lx, ly, -HALF + PIP_INSET)
  }

  return pos
}

type DieProps = {
  quaternion: THREE.Quaternion
}

export default function Die({ quaternion }: DieProps) {
  const pipPositions = useMemo(() => {
    const positions: THREE.Vector3[] = []
    for (let face = 1; face <= 6; face++) {
      for (const idx of PIP_LAYOUTS[face]) {
        positions.push(pipPosition(face, idx))
      }
    }
    return positions
  }, [])

  return (
    <group quaternion={quaternion}>
      <RoundedBox args={[1, 1, 1]} radius={DICE_RADIUS} smoothness={8} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#faf8f0"
          roughness={0.28}
          metalness={0.04}
          clearcoat={0.45}
          clearcoatRoughness={0.22}
          envMapIntensity={0.85}
        />
      </RoundedBox>
      {pipPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[PIP_RADIUS, 16, 16]} />
          <meshStandardMaterial color="#141414" roughness={0.5} metalness={0.05} />
        </mesh>
      ))}
    </group>
  )
}
