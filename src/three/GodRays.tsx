import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../lib/random'
import { SUN_DIR } from './Atmosphere'
import { frame } from './frame'
import { useDisposable } from './useDisposable'

/*
 * Volumetric-looking sunbeams: long additive cards aligned with the sun direction,
 * spun around their own axis every frame so they read as shafts from any angle.
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uFade;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
    across = pow(across, 1.6);
    float along = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
    // Slow shimmer, as if leaves high above were moving in the wind.
    float shimmer = 0.75 + 0.25 * sin(uTime * 0.6 + uSeed * 20.0 + vUv.y * 3.0);
    float streaks = 0.8 + 0.2 * sin(vUv.x * 40.0 + uSeed * 9.0);
    gl_FragColor = vec4(uColor * across * along * shimmer * streaks * uIntensity * uFade, 1.0);
    #include <colorspace_fragment>
  }
`

interface Beam {
  x: number
  z: number
  width: number
  length: number
  seed: number
  intensity: number
}

export function GodRays({ count = 9 }: { count?: number }) {
  const group = useRef<THREE.Group>(null)
  const beams = useMemo<Beam[]>(() => {
    const rand = mulberry32(8)
    return Array.from({ length: count }, (_, i) => ({
      x: (rand() - 0.5) * 26,
      z: 4 - i * (70 / count) - rand() * 4,
      width: 1.8 + rand() * 4.5,
      length: 44 + rand() * 14,
      seed: rand(),
      intensity: 0.07 + rand() * 0.09,
    }))
  }, [count])

  const geometry = useDisposable(() => new THREE.PlaneGeometry(1, 1))
  const materials = useMemo(
    () =>
      beams.map(
        (b) =>
          new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: fragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            uniforms: {
              uTime: { value: 0 },
              uSeed: { value: b.seed },
              uIntensity: { value: b.intensity },
              uFade: { value: 1 },
              uColor: { value: new THREE.Color('#ffd9a0') },
            },
          }),
      ),
    [beams],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const tmp = useMemo(
    () => ({ toCam: new THREE.Vector3(), side: new THREE.Vector3(), normal: new THREE.Vector3(), m: new THREE.Matrix4() }),
    [],
  )

  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    const warm = frame.journey
    g.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      const u = materials[i].uniforms
      u.uTime.value = frame.time
      u.uColor.value.setRGB(1, 0.85 - warm * 0.1, 0.62 - warm * 0.18)
      // Rotate the card around the sun axis so its face points at the camera.
      tmp.toCam.subVectors(camera.position, mesh.position)
      // Fade beams the camera is about to pass through, so a card never smears across the lens.
      const along = tmp.toCam.dot(SUN_DIR)
      const dist = tmp.side.copy(tmp.toCam).addScaledVector(SUN_DIR, -along).length()
      u.uFade.value = THREE.MathUtils.smoothstep(dist, 2.5, 9)
      tmp.side.crossVectors(SUN_DIR, tmp.toCam).normalize()
      tmp.normal.crossVectors(tmp.side, SUN_DIR).normalize()
      tmp.m.makeBasis(tmp.side, SUN_DIR, tmp.normal)
      mesh.quaternion.setFromRotationMatrix(tmp.m)
    })
  })

  return (
    <group ref={group}>
      {beams.map((b, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={materials[i]}
          // Centre each beam on the sun axis so its lower end lands on the forest floor.
          position={[b.x + SUN_DIR.x * b.length * 0.5, SUN_DIR.y * b.length * 0.5, b.z + SUN_DIR.z * b.length * 0.5]}
          scale={[b.width, b.length, 1]}
          frustumCulled={false}
          renderOrder={2}
        />
      ))}
    </group>
  )
}
