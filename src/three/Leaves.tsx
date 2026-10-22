import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../lib/random'
import { frame } from './frame'
import { createLeafTexture } from './textures'
import { useDisposable } from './useDisposable'

/* ------------------------------------------------------------------ */
/* Falling leaves — tumbling, drifting, caught by gusts of the pointer */
/* ------------------------------------------------------------------ */

export function FallingLeaves({ count }: { count: number }) {
  const camera = useThree((s) => s.camera)
  const texture = useDisposable(() => createLeafTexture(0))
  const geometry = useDisposable(() => new THREE.PlaneGeometry(0.16, 0.3))
  const material = useDisposable(
    () => new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.4, side: THREE.DoubleSide, color: '#d9c48a' }),
    [texture],
  )
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, count)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    const rand = mulberry32(64)
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      // Autumnal accents among the greens.
      c.setHSL(0.12 + rand() * 0.14, 0.45 + rand() * 0.2, 0.42 + rand() * 0.15)
      m.setColorAt(i, c)
    }
    return m
  }, [geometry, material, count])
  useEffect(() => () => mesh.dispose(), [mesh])

  const state = useMemo(() => {
    const rand = mulberry32(12)
    const leaves = Array.from({ length: count }, () => ({
      p: new THREE.Vector3((rand() - 0.5) * 24, rand() * 12, -rand() * 28 + 8),
      v: new THREE.Vector3(),
      spin: new THREE.Vector3(rand() * 6, rand() * 6, rand() * 6),
      spinSpeed: new THREE.Vector3(0.6 + rand() * 1.4, 0.8 + rand() * 1.6, 0.4 + rand()),
      fall: 0.45 + rand() * 0.5,
      seed: rand() * 100,
      scale: 0.8 + rand() * 0.9,
    }))
    return { leaves, rand, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), tmp: new THREE.Vector3() }
  }, [count])

  useFrame(() => {
    const dt = Math.min(frame.dt, 1 / 30) * frame.timeScale
    const t = frame.time
    const { leaves, rand, m, q, e, s, tmp } = state
    const gustStrength = frame.pointerLive ? Math.min(frame.pointerSpeed, 6) : 0
    leaves.forEach((leaf, i) => {
      // Flutter: lateral swing that couples to the tumble, like a real leaf.
      const swing = Math.sin(t * 1.6 + leaf.seed) * 0.9
      leaf.v.x += (swing + Math.sin(t * 0.3) * 0.4 - leaf.v.x) * dt * 1.5
      leaf.v.y += (-leaf.fall - leaf.v.y) * dt * 2
      leaf.v.z += (Math.cos(t * 1.1 + leaf.seed) * 0.4 - leaf.v.z) * dt * 1.5

      if (gustStrength > 0.2) {
        tmp.subVectors(leaf.p, frame.rayOrigin)
        const along = tmp.dot(frame.rayDir)
        if (along > 0) {
          tmp.addScaledVector(frame.rayDir, -along)
          const d = tmp.length()
          const radius = 1.5 + along * 0.1
          if (d < radius) leaf.v.addScaledVector(tmp.normalize(), (1 - d / radius) * gustStrength * dt * 6)
        }
      }

      leaf.p.addScaledVector(leaf.v, dt)
      leaf.spin.addScaledVector(leaf.spinSpeed, dt)

      // Recycle leaves that land or fall out of the shot.
      const rel = leaf.p.z - camera.position.z
      if (leaf.p.y < 0 || rel > -2 || rel < -34) {
        leaf.p.set(camera.position.x + (rand() - 0.5) * 22, 9 + rand() * 4, camera.position.z - 7 - rand() * 26)
        leaf.v.set(0, 0, 0)
      }

      e.set(leaf.spin.x, leaf.spin.y, leaf.spin.z)
      q.setFromEuler(e)
      // Shrink away as the camera reaches a leaf instead of letting it pop out of view.
      s.setScalar(leaf.scale * (1 - THREE.MathUtils.smoothstep(rel, -6, -2.5)))
      m.compose(leaf.p, q, s)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive object={mesh} />
}

/* ---------------------------------------------------------------------- */
/* Foreground framing — large, defocused leaves hanging at the frame edges */
/* ---------------------------------------------------------------------- */

interface FramingLeaf {
  /** Anchor in viewport units (-1..1) */
  ax: number
  ay: number
  depth: number
  size: number
  rot: number
  seed: number
}

const FRAMING: FramingLeaf[] = [
  { ax: -1.02, ay: 1.05, depth: 2.2, size: 1.25, rot: -2.4, seed: 0.1 },
  { ax: -0.82, ay: 1.12, depth: 2.6, size: 1.05, rot: -2.9, seed: 0.4 },
  { ax: -1.08, ay: 0.55, depth: 2.4, size: 0.9, rot: -1.9, seed: 0.7 },
  { ax: 1.05, ay: -1.02, depth: 2.1, size: 1.35, rot: 0.75, seed: 0.2 },
  { ax: 0.86, ay: -1.12, depth: 2.5, size: 1.0, rot: 0.25, seed: 0.55 },
  { ax: 1.1, ay: 0.95, depth: 2.8, size: 0.85, rot: 2.6, seed: 0.9 },
]

export function ForegroundLeaves() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const group = useRef<THREE.Group>(null)
  const texture = useDisposable(() => createLeafTexture(2))
  const geometry = useDisposable(() => {
    const g = new THREE.PlaneGeometry(0.5, 1)
    g.translate(0, 0.5, 0) // pivot at the stem
    return g
  })
  const material = useDisposable(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        fog: false,
        color: '#3a4f30',
        side: THREE.DoubleSide,
      }),
    [texture],
  )
  // Spring state per leaf: angle offset + angular velocity.
  const springs = useMemo(() => FRAMING.map(() => ({ a: 0, v: 0 })), [])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const dt = Math.min(frame.dt, 1 / 30)
    g.position.copy(camera.position)
    g.quaternion.copy(camera.quaternion)
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const halfW = halfH * camera.aspect
    // Fade the framing out as we step into the café clearing.
    material.opacity = 0.96 * (1 - THREE.MathUtils.smoothstep(frame.journey, 0.82, 1))
    g.children.forEach((child, i) => {
      const f = FRAMING[i]
      const sp = springs[i]
      child.position.set(f.ax * halfW * f.depth, f.ay * halfH * f.depth, -f.depth)
      // Push away when the pointer comes near this corner of the screen.
      const dx = frame.pointer.x - f.ax * 0.85
      const dy = frame.pointer.y - f.ay * 0.85
      const near = Math.max(0, 1 - Math.hypot(dx, dy) / 0.75)
      const push = frame.pointerLive ? near * Math.sign(dx * f.ay - dy * f.ax || 1) * 0.35 : 0
      const breeze = Math.sin(frame.time * 0.8 + f.seed * 10) * 0.05 + Math.sin(frame.time * 1.9 + f.seed * 30) * 0.02
      // Damped spring toward the target angle — gives inertia and a gentle settle.
      sp.v += ((push + breeze) - sp.a) * 22 * dt
      sp.v *= Math.exp(-dt * 5)
      sp.a += sp.v * dt
      child.rotation.set(0, 0, f.rot + sp.a)
    })
  })

  return (
    <group ref={group}>
      {FRAMING.map((f, i) => (
        <mesh key={i} geometry={geometry} material={material} scale={[f.size * 0.62, f.size * 0.62, 1]} renderOrder={10} />
      ))}
    </group>
  )
}
