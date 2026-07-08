'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import DiceScene, { type DiceSceneProps } from './DiceScene'

type DiceCanvasProps = DiceSceneProps

export default function DiceCanvas(props: DiceCanvasProps) {
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 2]}
      shadows
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 3.8, 2.6], fov: 30, near: 0.1, far: 50 }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0)
        gl.shadowMap.enabled = true
        gl.shadowMap.type = THREE.PCFSoftShadowMap
        camera.lookAt(0, 0, 0)
      }}
    >
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.35} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[3, 7, 4]}
          intensity={1.35}
          castShadow
          shadow-mapSize={[512, 512]}
        />
        <directionalLight position={[-4, 3, -2]} intensity={0.45} />
        <pointLight position={[0, 2, 3]} intensity={0.25} color="#fff8e7" />
        <DiceScene {...props} />
      </Suspense>
    </Canvas>
  )
}
