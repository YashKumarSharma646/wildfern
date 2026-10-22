import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import type { Quality } from '../lib/quality'
import { Atmosphere } from './Atmosphere'
import { Birds } from './Birds'
import { Cafe } from './Cafe'
import { CameraRig } from './CameraRig'
import { ClickEffects } from './ClickEffects'
import { Forest } from './Forest'
import { GodRays } from './GodRays'
import { FallingLeaves, ForegroundLeaves } from './Leaves'
import { Pollen } from './Pollen'

interface Props {
  quality: Quality
  /** Rendering is paused entirely while the hero is scrolled out of view. */
  active: boolean
  onReady?: () => void
}

/**
 * Compiles every shader up front (so nothing compiles mid-scroll when it first comes
 * into view), then signals readiness once a couple of real frames have rendered.
 */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0)
  const done = useRef(false)
  useFrame(({ gl, scene, camera }) => {
    if (done.current) return
    if (frames.current === 0) gl.compile(scene, camera)
    if (++frames.current > 2) {
      done.current = true
      onReady?.()
    }
  })
  return null
}

export default function ForestScene({ quality, active, onReady }: Props) {
  const [dpr, setDpr] = useState(quality.dpr[1])

  return (
    <Canvas
      className="forest-canvas"
      dpr={dpr}
      shadows={quality.shadows ? { type: THREE.PCFShadowMap } : false}
      frameloop={active ? 'always' : 'never'}
      camera={{ fov: 48, near: 0.1, far: 240, position: [0, 3.6, 16] }}
      gl={{ antialias: quality.antialias, powerPreference: 'high-performance', alpha: false, stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.outputColorSpace = THREE.SRGBColorSpace
      }}
      aria-hidden
    >
      {/*
        Steps resolution down if the frame rate struggles — never back up. Every change
        resizes the canvas, which itself causes a hitch, so oscillating would be worse
        than settling one step lower.
      */}
      <PerformanceMonitor
        bounds={(refresh) => (refresh > 90 ? [55, 90] : [45, 60])}
        onDecline={() => setDpr((d) => Math.max(quality.dpr[0], Math.round((d - 0.25) * 4) / 4))}
        flipflops={Infinity}
        onFallback={() => setDpr(quality.dpr[0])}
      />
      <CameraRig />
      <Atmosphere shadows={quality.shadows} />
      <Forest quality={quality} />
      <GodRays count={quality.tier === 'low' ? 5 : 9} />
      <Cafe />
      <Birds count={quality.birds} />
      <Pollen count={quality.pollen} />
      <FallingLeaves count={quality.fallingLeaves} />
      <ClickEffects />
      <ForegroundLeaves />
      <ReadySignal onReady={onReady} />
    </Canvas>
  )
}
