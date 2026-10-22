import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { frame } from './frame'
import { CAFE_Z } from './layout'
import { createGlowTexture } from './textures'
import { useDisposable } from './useDisposable'

/*
 * The hidden café: a timber-and-glass pavilion with a planted roof, a stone terrace
 * with outdoor seating and festoon lights. Built from a handful of primitives so it
 * stays cheap; its warmth comes from emissive glass and one point light, which the
 * fog swallows until the camera is close.
 */

const WOOD = '#6b4a32'
const DARK_WOOD = '#3d2a1d'
const STONE = '#8d867a'
const LANTERN_Z = [6.5, 10]
const PENDANT_X = [-3, -1, 1, 3]
const TABLES: [number, number][] = [
  [-4.2, 4.2],
  [0, 4.6],
  [4.2, 4.2],
]

function Post({ position, height = 3.4 }: { position: [number, number, number]; height?: number }) {
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]} castShadow>
      <boxGeometry args={[0.18, height, 0.18]} />
      <meshLambertMaterial color={WOOD} />
    </mesh>
  )
}

function Table({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.4, z]}>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.05, 18]} />
        <meshLambertMaterial color="#b08a62" />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.72, 8]} />
        <meshLambertMaterial color={DARK_WOOD} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.68, 0.24, 0]}>
          <boxGeometry args={[0.38, 0.48, 0.38]} />
          <meshLambertMaterial color="#5a3f2b" />
        </mesh>
      ))}
      {/* Candle */}
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.12, 8]} />
        <meshLambertMaterial color="#fff2d6" emissive="#ffb35c" emissiveIntensity={3} />
      </mesh>
    </group>
  )
}

export function Cafe() {
  const glow = useRef<THREE.Sprite>(null)
  const interior = useRef<THREE.PointLight>(null)
  const glowTexture = useDisposable(() => createGlowTexture())
  const glowMaterial = useDisposable(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: '#ffb562',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity: 0,
      }),
    [glowTexture],
  )

  // Festoon bulbs along a sagging catenary across the terrace.
  const bulbs = useMemo(() => {
    const pts: [number, number, number][] = []
    const n = 22
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const x = -6 + t * 12
      const sag = Math.cosh((t - 0.5) * 2.2) - Math.cosh(1.1)
      pts.push([x, 3.6 + sag * 0.9, 4.9])
    }
    return pts
  }, [])

  // Soft halos around every small light — a cheap stand-in for bloom.
  const halos = useDisposable(() => {
    const pts: number[] = []
    bulbs.forEach((b) => pts.push(b[0], b[1], b[2]))
    PENDANT_X.forEach((x) => pts.push(x, 3.1, -1.4))
    LANTERN_Z.forEach((z) => pts.push(-1.9, 0.98, z, 1.9, 0.98, z))
    TABLES.forEach(([x, z]) => pts.push(x, 1.25, z))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [bulbs])
  const haloMaterial = useDisposable(
    () =>
      new THREE.PointsMaterial({
        map: glowTexture,
        color: '#ffb766',
        size: 1.1,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        opacity: 0,
      }),
    [glowTexture],
  )

  useFrame(() => {
    const p = frame.journey
    haloMaterial.opacity = THREE.MathUtils.smoothstep(p, 0.45, 0.9) * (0.85 + Math.sin(frame.time * 3.1) * 0.05)
    // A faint glimmer through the trees early on, blooming as we arrive.
    if (glow.current) {
      const flicker = 0.92 + Math.sin(frame.time * 2.3) * 0.04 + Math.sin(frame.time * 5.1) * 0.03
      glowMaterial.opacity = (0.18 + THREE.MathUtils.smoothstep(p, 0.25, 0.95) * 0.5) * flicker
    }
    if (interior.current) interior.current.intensity = 50 + THREE.MathUtils.smoothstep(p, 0.4, 1) * 45
  })

  return (
    <group position={[0, 0, CAFE_Z]}>
      {/* Stone terrace + timber deck */}
      <mesh position={[0, 0.2, 1.2]} receiveShadow>
        <boxGeometry args={[15, 0.4, 11]} />
        <meshLambertMaterial color={STONE} />
      </mesh>
      <mesh position={[0, 0.42, -1]} receiveShadow>
        <boxGeometry args={[9.6, 0.06, 6.4]} />
        <meshLambertMaterial color="#8a6644" />
      </mesh>
      {/* Steps down to the trail */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[0, 0.1 - i * 0.1, 6.95 + i * 0.5]}>
          <boxGeometry args={[3.2, 0.2, 0.5]} />
          <meshLambertMaterial color={STONE} />
        </mesh>
      ))}

      {/* Timber frame */}
      {[-4.5, -1.5, 1.5, 4.5].flatMap((x) => [
        <Post key={`f${x}`} position={[x, 0.45, 2.1]} />,
        <Post key={`b${x}`} position={[x, 0.45, -4.1]} />,
      ])}
      <Post position={[-4.5, 0.45, -1]} />
      <Post position={[4.5, 0.45, -1]} />

      {/* Roof slab with a living, planted top */}
      <mesh position={[0, 4.05, -1]} castShadow>
        <boxGeometry args={[11.4, 0.32, 8.4]} />
        <meshLambertMaterial color={DARK_WOOD} />
      </mesh>
      <mesh position={[0, 4.28, -1]}>
        <boxGeometry args={[11, 0.18, 8]} />
        <meshLambertMaterial color="#3f5a2e" />
      </mesh>

      {/* Glowing glass walls */}
      <mesh position={[0, 2.15, 2.1]}>
        <planeGeometry args={[9, 3.4]} />
        <meshBasicMaterial color="#e8a35a" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      {[-4.5, 4.5].map((x) => (
        <mesh key={x} position={[x, 2.15, -1]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[6.2, 3.4]} />
          <meshBasicMaterial color="#d99550" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Warm back wall + bar */}
      <mesh position={[0, 2.15, -4.05]}>
        <planeGeometry args={[9, 3.4]} />
        <meshLambertMaterial color="#7a5333" emissive="#c9773a" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 0.95, -3.1]}>
        <boxGeometry args={[5.5, 1.05, 0.8]} />
        <meshLambertMaterial color="#5a3d27" />
      </mesh>
      {/* Indoor planters */}
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} position={[x, 1.2, -3.2]}>
          <sphereGeometry args={[0.7, 12, 10]} />
          <meshLambertMaterial color="#4e6f37" />
        </mesh>
      ))}
      {/* Pendant lights */}
      {PENDANT_X.map((x) => (
        <group key={x} position={[x, 3.1, -1.4]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.9, 4]} />
            <meshBasicMaterial color="#1a1410" />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.16, 14, 10]} />
            <meshLambertMaterial color="#fff3d9" emissive="#ffc27a" emissiveIntensity={6} />
          </mesh>
        </group>
      ))}
      <pointLight ref={interior} position={[0, 2.8, 1.2]} color="#ffb36b" intensity={50} distance={28} decay={1.6} />

      {/* Terrace seating */}
      {TABLES.map(([x, z]) => (
        <Table key={x} x={x} z={z} />
      ))}

      {/* Festoon lights */}
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 2.2, 4.9]}>
          <cylinderGeometry args={[0.05, 0.06, 4.4, 6]} />
          <meshLambertMaterial color={DARK_WOOD} />
        </mesh>
      ))}
      {bulbs.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshLambertMaterial color="#fff5dc" emissive="#ffcf86" emissiveIntensity={8} />
        </mesh>
      ))}

      {/* Lanterns guiding the last stretch of trail */}
      {LANTERN_Z.flatMap((z) =>
        [-1, 1].map((s) => (
          <group key={`${z}${s}`} position={[s * 1.9, 0, z]}>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[0.08, 0.9, 0.08]} />
              <meshLambertMaterial color={DARK_WOOD} />
            </mesh>
            <mesh position={[0, 0.98, 0]}>
              <boxGeometry args={[0.2, 0.22, 0.2]} />
              <meshLambertMaterial color="#3a2a1c" emissive="#ff9d45" emissiveIntensity={2.2} />
            </mesh>
          </group>
        )),
      )}

      <points geometry={halos} material={haloMaterial} renderOrder={4} />
      <sprite ref={glow} material={glowMaterial} position={[0, 2.6, 0]} scale={[26, 16, 1]} renderOrder={3} />
    </group>
  )
}
