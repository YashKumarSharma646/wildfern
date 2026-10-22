import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../lib/random'
import { frame } from './frame'
import { useDisposable } from './useDisposable'

/*
 * A Boids flock (separation · alignment · cohesion) rendered as ONE instanced mesh.
 * The simulation runs on typed arrays with zero per-frame allocations; wing flapping
 * is done in the vertex shader from a per-bird phase/amplitude attribute.
 * Birds treat the ray under the cursor as a predator: they scatter, then regroup.
 */

const PARAMS = {
  neighbourRadius: 4.2,
  separationRadius: 1.35,
  separation: 2.1,
  alignment: 1.0,
  cohesion: 0.55,
  wander: 0.11,
  bounds: 1.6,
  avoid: 34,
  minSpeed: 3.2,
  maxSpeed: 7.4,
  panicSpeed: 11.5,
  maxForce: 16,
}

function createBirdGeometry() {
  // Facing +Z, wings span along X. aWing = how much a vertex follows the flap (0 body → 1 tip).
  const v: number[] = []
  const w: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => {
    for (const p of [a, b, c]) {
      v.push(p[0], p[1], p[2])
      w.push(p[3])
    }
  }
  // Body + tail
  tri([0, 0, 0.55, 0], [-0.08, 0, 0.05, 0], [0, 0, -0.42, 0])
  tri([0, 0, 0.55, 0], [0, 0, -0.42, 0], [0.08, 0, 0.05, 0])
  tri([0, 0, -0.32, 0], [-0.15, 0, -0.62, 0], [0.15, 0, -0.62, 0])
  // Wings (swept, with an elbow so the flap bends)
  for (const s of [-1, 1]) {
    const rootF = [0.05 * s, 0, 0.2, 0]
    const rootB = [0.05 * s, 0, -0.16, 0]
    const elbow = [0.55 * s, 0, 0.08, 0.5]
    const tip = [1.15 * s, 0, -0.34, 1]
    tri(rootF, rootB, elbow)
    tri(elbow, rootB, tip)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(w, 1))
  return g
}

const vertex = /* glsl */ `
  attribute float aWing;
  attribute vec2 aFlap; // x: phase, y: amplitude
  varying float vWing;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    float s = sin(aFlap.x);
    float lag = sin(aFlap.x - 0.7);
    p.y += (s * aWing * 0.55 + lag * aWing * aWing * 0.3) * aFlap.y;
    p.x *= 1.0 - abs(s) * 0.12 * aWing * aFlap.y;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vWing = aWing;
    #include <fog_vertex>
  }
`
const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRim;
  varying float vWing;
  #include <fog_pars_fragment>
  void main() {
    // Sun catching the wingtips.
    vec3 col = mix(uColor, uRim, vWing * vWing * 0.35);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function Birds({ count }: { count: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  const geometry = useDisposable(() => {
    const g = createBirdGeometry()
    g.setAttribute('aFlap', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage))
    return g
  }, [count])
  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        fog: true,
        side: THREE.DoubleSide,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { uColor: { value: new THREE.Color('#141a14') }, uRim: { value: new THREE.Color('#a88a5a') } },
        ]),
      }),
  )

  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, count)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    return m
  }, [geometry, material, count])
  useEffect(() => () => mesh.dispose(), [mesh])

  const sim = useMemo(() => {
    const rand = mulberry32(42)
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    const amp = new Float32Array(count)
    const bank = new Float32Array(count)
    const seed = new Float32Array(count)
    const scale = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 24
      pos[i * 3 + 1] = 8 + rand() * 5
      pos[i * 3 + 2] = -10 + (rand() - 0.5) * 16
      vel[i * 3] = 4 + rand() * 2
      vel[i * 3 + 1] = (rand() - 0.5) * 0.5
      vel[i * 3 + 2] = (rand() - 0.5) * 2
      phase[i] = rand() * Math.PI * 2
      seed[i] = rand()
      scale[i] = 0.42 + rand() * 0.22
      amp[i] = 0.6
    }
    return {
      pos, vel, phase, amp, bank, seed, scale,
      lastCamZ: camera.position.z,
      m: new THREE.Matrix4(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    }
  }, [count, camera])

  useFrame(() => {
    const dt = Math.min(frame.dt, 1 / 30) * frame.timeScale
    const { pos, vel, phase, amp, bank, seed, scale, m, x, y, z, up } = sim
    const t = frame.time
    const P = PARAMS

    // Carry the flock along with the camera dolly so it stays in the shot.
    const camDz = camera.position.z - sim.lastCamZ
    sim.lastCamZ = camera.position.z

    // Flight volume, in front of the camera, sized to the viewport aspect.
    const cx = camera.position.x * 0.5
    const cy = 9.4
    const cz = camera.position.z - 20
    const hx = 9 + 11 * Math.min(camera.aspect, 1.7) / 1.7
    const hy = 3.2
    const hz = 11
    const wx = cx + Math.sin(t * 0.11) * hx * 0.55
    const wy = cy + Math.sin(t * 0.23) * 1.4
    const wz = cz + Math.sin(t * 0.07 + 1) * 7

    const ro = frame.rayOrigin
    const rd = frame.rayDir
    const live = frame.pointerLive
    const nr2 = P.neighbourRadius ** 2
    const sr2 = P.separationRadius ** 2

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const px = pos[i3], py = pos[i3 + 1]
      const pz = pos[i3 + 2] + camDz * 0.92
      pos[i3 + 2] = pz
      const vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2]

      let sx = 0, sy = 0, sz = 0
      let ax = 0, ay = 0, az = 0
      let gx = 0, gy = 0, gz = 0
      let n = 0
      for (let j = 0; j < count; j++) {
        if (j === i) continue
        const j3 = j * 3
        const dx = pos[j3] - px, dy = pos[j3 + 1] - py, dz = pos[j3 + 2] - pz
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > nr2) continue
        n++
        ax += vel[j3]; ay += vel[j3 + 1]; az += vel[j3 + 2]
        gx += pos[j3]; gy += pos[j3 + 1]; gz += pos[j3 + 2]
        if (d2 < sr2 && d2 > 1e-6) {
          const inv = 1 / d2
          sx -= dx * inv; sy -= dy * inv; sz -= dz * inv
        }
      }

      let fx = sx * P.separation, fy = sy * P.separation, fz = sz * P.separation
      if (n > 0) {
        fx += (ax / n - vx) * P.alignment
        fy += (ay / n - vy) * P.alignment
        fz += (az / n - vz) * P.alignment
        fx += (gx / n - px) * P.cohesion
        fy += (gy / n - py) * P.cohesion
        fz += (gz / n - pz) * P.cohesion
      }
      // Wander toward a slowly moving flock goal.
      fx += (wx - px) * P.wander
      fy += (wy - py) * P.wander
      fz += (wz - pz) * P.wander
      // Soft volume boundary.
      const ox = px - cx, oy = py - cy, oz = pz - cz
      if (Math.abs(ox) > hx) fx -= Math.sign(ox) * (Math.abs(ox) - hx) * P.bounds
      if (Math.abs(oy) > hy) fy -= Math.sign(oy) * (Math.abs(oy) - hy) * P.bounds * 2
      if (Math.abs(oz) > hz) fz -= Math.sign(oz) * (Math.abs(oz) - hz) * P.bounds
      if (py < 4.5) fy += (4.5 - py) * 6

      // Predator: the pointer ray. Distance from bird to ray, with a radius that
      // grows with depth so it matches the cursor's on-screen footprint.
      let panic = 0
      if (live) {
        const vxr = px - ro.x, vyr = py - ro.y, vzr = pz - ro.z
        const tr = vxr * rd.x + vyr * rd.y + vzr * rd.z
        if (tr > 0) {
          const qx = vxr - rd.x * tr, qy = vyr - rd.y * tr, qz = vzr - rd.z * tr
          const d = Math.sqrt(qx * qx + qy * qy + qz * qz)
          const radius = Math.min(6.5, Math.max(2, tr * 0.12))
          if (d < radius) {
            panic = 1 - d / radius
            const k = (panic * panic * P.avoid) / Math.max(d, 0.05)
            fx += qx * k
            fy += qy * k + panic * 6
            fz += qz * k
          }
        }
      }

      // A click "shock" (sky ripple / leaf burst) startles birds nearby for a moment.
      const shockAge = t - frame.shockTime
      if (shockAge < 1.4) {
        const sx2 = px - frame.shock.x, sy2 = py - frame.shock.y, sz2 = pz - frame.shock.z
        const sd = Math.sqrt(sx2 * sx2 + sy2 * sy2 + sz2 * sz2)
        if (sd < 11 && sd > 0.01) {
          const k = (1 - sd / 11) * (1 - shockAge / 1.4)
          panic = Math.max(panic, k)
          fx += (sx2 / sd) * k * 40
          fy += (sy2 / sd) * k * 40 + k * 8
          fz += (sz2 / sd) * k * 40
        }
      }

      // Clamp steering force.
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz)
      const maxF = P.maxForce * (1 + panic * 2)
      if (fl > maxF) {
        const s = maxF / fl
        fx *= s; fy *= s; fz *= s
      }

      let nvx = vx + fx * dt, nvy = vy + fy * dt, nvz = vz + fz * dt
      const sp = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) || 1
      const maxS = P.maxSpeed + (P.panicSpeed - P.maxSpeed) * panic
      const clamped = Math.min(maxS, Math.max(P.minSpeed, sp))
      nvx *= clamped / sp; nvy *= clamped / sp; nvz *= clamped / sp

      // Bank into turns (turn rate around the world up axis).
      const turn = (vx * nvz - vz * nvx) / Math.max(vx * vx + vz * vz, 0.01)
      bank[i] += (Math.max(-0.9, Math.min(0.9, -turn * 9)) - bank[i]) * Math.min(1, dt * 4)

      vel[i3] = nvx; vel[i3 + 1] = nvy; vel[i3 + 2] = nvz
      pos[i3] = px + nvx * dt
      pos[i3 + 1] = py + nvy * dt
      pos[i3 + 2] = pz + nvz * dt

      // Flapping: hard when climbing or startled, occasional glides when cruising.
      const glide = Math.sin(t * 0.35 + seed[i] * 40) > 0.55 ? 0.12 : 1
      const targetAmp = panic > 0.05 ? 1 : nvy > 0.6 ? 0.95 : nvy < -0.6 ? 0.1 : 0.6 * glide
      amp[i] += (targetAmp - amp[i]) * Math.min(1, dt * 3)
      phase[i] += dt * (9 + seed[i] * 3 + panic * 9) * (0.4 + amp[i] * 0.6)

      // Orientation basis from velocity + bank.
      z.set(nvx, nvy, nvz).normalize()
      x.crossVectors(up, z).normalize()
      y.crossVectors(z, x)
      const cb = Math.cos(bank[i]), sb = Math.sin(bank[i])
      const xx = x.x * cb + y.x * sb, xy = x.y * cb + y.y * sb, xz = x.z * cb + y.z * sb
      const yx = y.x * cb - x.x * sb, yy = y.y * cb - x.y * sb, yz = y.z * cb - x.z * sb
      const s = scale[i]
      m.set(
        xx * s, yx * s, z.x * s, pos[i3],
        xy * s, yy * s, z.y * s, pos[i3 + 1],
        xz * s, yz * s, z.z * s, pos[i3 + 2],
        0, 0, 0, 1,
      )
      mesh.setMatrixAt(i, m)
    }

    const flap = geometry.getAttribute('aFlap') as THREE.InstancedBufferAttribute
    const arr = flap.array as Float32Array
    for (let i = 0; i < count; i++) {
      arr[i * 2] = phase[i]
      arr[i * 2 + 1] = amp[i]
    }
    flap.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive object={mesh} />
}
