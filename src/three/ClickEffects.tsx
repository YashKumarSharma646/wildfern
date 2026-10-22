import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../lib/random'
import { sceneState } from '../lib/sceneState'
import { frame } from './frame'
import { createLeafTexture } from './textures'
import { useDisposable } from './useDisposable'

/*
 * What happens when you click/tap the forest:
 *  - ground → a burst of leaves jumps up, tumbles, flutters down and settles, plus a dust ring
 *  - sky    → concentric light ripples spread out from the point
 *  - both   → nearby birds startle (see Birds.tsx, frame.shock)
 * Everything is pooled and pre-allocated; when nothing is animating this costs nothing.
 */

const LEAVES_PER_BURST = 24
const LEAF_POOL = LEAVES_PER_BURST * 4
const RIPPLE_POOL = 8
const MAX_GROUND_DISTANCE = 50

const rippleVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const rippleFragment = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float r = uProgress * 1.2 - float(i) * 0.22;
      if (r > 0.0 && r < 1.0) {
        float w = 0.02 + r * 0.035;
        a += smoothstep(w, 0.0, abs(d - r)) * (1.0 - r);
      }
    }
    // A soft flash at the centre right at the start.
    a += smoothstep(0.3, 0.0, d) * (1.0 - smoothstep(0.0, 0.2, uProgress)) * 0.8;
    gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`

interface Ripple {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  age: number
  life: number
  size: number
  strength: number
  active: boolean
}

interface BurstLeaf {
  p: THREE.Vector3
  v: THREE.Vector3
  spin: THREE.Vector3
  spinSpeed: THREE.Vector3
  age: number
  life: number
  scale: number
  seed: number
  landed: boolean
  active: boolean
}

export function ClickEffects() {
  /* ---------- Leaf bursts ---------- */
  const texture = useDisposable(() => createLeafTexture(0))
  const leafGeometry = useDisposable(() => new THREE.PlaneGeometry(0.3, 0.54))
  const leafMaterial = useDisposable(
    () => new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.4, side: THREE.DoubleSide }),
    [texture],
  )
  const leafMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(leafGeometry, leafMaterial, LEAF_POOL)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    const rand = mulberry32(77)
    const c = new THREE.Color()
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < LEAF_POOL; i++) {
      // Mix of fresh greens and autumn golds.
      if (rand() < 0.55) c.setHSL(0.22 + rand() * 0.08, 0.45, 0.4 + rand() * 0.12)
      else c.setHSL(0.07 + rand() * 0.06, 0.6, 0.45 + rand() * 0.1)
      m.setColorAt(i, c)
      m.setMatrixAt(i, zero)
    }
    return m
  }, [leafGeometry, leafMaterial])
  useEffect(() => () => leafMesh.dispose(), [leafMesh])

  /* ---------- Ripples ---------- */
  const rippleGeometry = useDisposable(() => new THREE.PlaneGeometry(1, 1))
  const ripples = useMemo<Ripple[]>(
    () =>
      Array.from({ length: RIPPLE_POOL }, () => {
        const material = new THREE.ShaderMaterial({
          vertexShader: rippleVertex,
          fragmentShader: rippleFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            uProgress: { value: 0 },
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color('#fff0cf') },
          },
        })
        const mesh = new THREE.Mesh(rippleGeometry, material)
        mesh.visible = false
        mesh.frustumCulled = false
        mesh.renderOrder = 5
        return { mesh, age: 0, life: 1, size: 1, strength: 1, active: false }
      }),
    [rippleGeometry],
  )
  useEffect(() => () => ripples.forEach((r) => r.mesh.material.dispose()), [ripples])

  const state = useMemo(() => {
    const rand = mulberry32(5150)
    const leaves: BurstLeaf[] = Array.from({ length: LEAF_POOL }, () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      spinSpeed: new THREE.Vector3(),
      age: 0,
      life: 1,
      scale: 1,
      seed: 0,
      landed: false,
      active: false,
    }))
    return {
      rand,
      leaves,
      nextLeaf: 0,
      nextRipple: 0,
      activeLeaves: 0,
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      s: new THREE.Vector3(),
    }
  }, [])

  function spawnRipple(position: THREE.Vector3, quaternion: THREE.Quaternion, size: number, color: string, strength: number, life: number) {
    const r = ripples[state.nextRipple]
    state.nextRipple = (state.nextRipple + 1) % RIPPLE_POOL
    r.active = true
    r.age = 0
    r.life = life
    r.size = size
    r.strength = strength
    r.mesh.position.copy(position)
    r.mesh.quaternion.copy(quaternion)
    r.mesh.material.uniforms.uColor.value.set(color)
    r.mesh.visible = true
  }

  function spawnLeafBurst(at: THREE.Vector3, distance: number) {
    const { rand, leaves } = state
    const sizeBoost = Math.max(1, distance * 0.035)
    for (let k = 0; k < LEAVES_PER_BURST; k++) {
      const leaf = leaves[state.nextLeaf]
      state.nextLeaf = (state.nextLeaf + 1) % LEAF_POOL
      if (!leaf.active) state.activeLeaves++
      const a = rand() * Math.PI * 2
      const radial = 1.2 + rand() * 2.2
      leaf.p.set(at.x + Math.cos(a) * 0.15, 0.08, at.z + Math.sin(a) * 0.15)
      leaf.v.set(Math.cos(a) * radial, 4.2 + rand() * 3.6, Math.sin(a) * radial)
      leaf.spin.set(rand() * 6, rand() * 6, rand() * 6)
      leaf.spinSpeed.set((rand() - 0.5) * 14, (rand() - 0.5) * 10, (rand() - 0.5) * 12)
      leaf.age = 0
      leaf.life = 2.6 + rand() * 1.2
      leaf.scale = (0.9 + rand() * 0.7) * sizeBoost
      leaf.seed = rand() * 100
      leaf.landed = false
      leaf.active = true
    }
  }

  useFrame(({ camera }) => {
    const dt = Math.min(frame.dt, 1 / 30) * frame.timeScale

    /* Consume clicks queued by the DOM. */
    while (sceneState.clicks.length) {
      const c = sceneState.clicks.shift()!
      state.ndc.set(c.x, c.y)
      state.raycaster.setFromCamera(state.ndc, camera)
      const ray = state.raycaster.ray
      const hitGround = ray.intersectPlane(state.ground, state.hit)
      const dist = hitGround ? state.hit.distanceTo(ray.origin) : Infinity
      if (hitGround && dist < MAX_GROUND_DISTANCE) {
        spawnLeafBurst(state.hit, dist)
        state.q.setFromEuler(state.e.set(-Math.PI / 2, 0, 0))
        state.hit.y = 0.05
        spawnRipple(state.hit, state.q, 3.2 * Math.max(1, dist * 0.04), '#e9d3a4', 0.55 * Math.exp(-dist * 0.025), 1.1)
        frame.shock.copy(state.hit)
      } else {
        // Sky: put the ripple some way out along the ray, facing the camera.
        state.hit.copy(ray.origin).addScaledVector(ray.direction, 24)
        spawnRipple(state.hit, camera.quaternion, 13, '#fff0cf', 1, 1.7)
        frame.shock.copy(state.hit)
      }
      frame.shockTime = frame.time
    }

    /* Ripples */
    for (const r of ripples) {
      if (!r.active) continue
      r.age += dt
      const t = r.age / r.life
      if (t >= 1) {
        r.active = false
        r.mesh.visible = false
        continue
      }
      const eased = 1 - Math.pow(1 - t, 3)
      r.mesh.material.uniforms.uProgress.value = eased
      r.mesh.material.uniforms.uOpacity.value = r.strength * (1 - t * t)
      r.mesh.scale.setScalar(r.size * (0.35 + eased * 0.65))
    }

    /* Leaves */
    if (state.activeLeaves === 0) return
    const { leaves, m, q, e, s } = state
    for (let i = 0; i < LEAF_POOL; i++) {
      const leaf = leaves[i]
      if (!leaf.active) continue
      leaf.age += dt
      if (leaf.age >= leaf.life) {
        leaf.active = false
        state.activeLeaves--
        leafMesh.setMatrixAt(i, m.makeScale(0, 0, 0))
        continue
      }
      if (!leaf.landed) {
        // Gravity, heavy air drag and a side-to-side flutter, like a real leaf.
        leaf.v.y -= 5.2 * dt
        leaf.v.multiplyScalar(Math.exp(-dt * 1.8))
        leaf.v.x += Math.sin(leaf.age * 7 + leaf.seed) * dt * 2.2
        leaf.v.z += Math.cos(leaf.age * 6 + leaf.seed) * dt * 1.6
        leaf.p.addScaledVector(leaf.v, dt)
        leaf.spin.addScaledVector(leaf.spinSpeed, dt)
        if (leaf.p.y <= 0.04 && leaf.v.y < 0) {
          leaf.p.y = 0.04
          leaf.landed = true
          // Settle flat-ish on the forest floor.
          leaf.spin.x = -Math.PI / 2 + (Math.sin(leaf.seed) * 0.3)
          leaf.spin.z = leaf.seed
        }
      }
      const grow = Math.min(1, leaf.age / 0.08)
      const fade = 1 - THREE.MathUtils.smoothstep(leaf.age, leaf.life - 0.7, leaf.life)
      e.set(leaf.spin.x, leaf.spin.y, leaf.spin.z)
      q.setFromEuler(e)
      s.setScalar(leaf.scale * grow * fade)
      m.compose(leaf.p, q, s)
      leafMesh.setMatrixAt(i, m)
    }
    leafMesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive object={leafMesh} />
      {ripples.map((r, i) => (
        <primitive key={i} object={r.mesh} />
      ))}
    </>
  )
}
