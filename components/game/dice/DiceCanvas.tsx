'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import DiceScene, { type DiceSceneProps } from './DiceScene'

type DiceCanvasProps = DiceSceneProps

export default function DiceCanvas(props: DiceCanvasProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 3.8, 2.6], fov: 30, near: 0.1, far: 50 }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0)
        camera.lookAt(0, 0, 0)
      }}
    >
      <Suspense fallback={null}>
        {/* Lightweight rig — no HDRI environment or shadow maps (decorative dice don't need them). */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 7, 4]} intensity={1.4} />
        <directionalLight position={[-4, 3, -2]} intensity={0.5} />
        <pointLight position={[0, 2, 3]} intensity={0.3} color="#fff8e7" />
        <DiceScene {...props} />
      </Suspense>
    </Canvas>
  )
}
