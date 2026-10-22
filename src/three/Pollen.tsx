import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../lib/random'
import { frame } from './frame'
import { useDisposable } from './useDisposable'

/*
 * Floating pollen & dust, fully animated on the GPU. Particles live in a volume that
 * wraps around the camera, drift on layered sine "currents", and are swept aside by
 * the pointer ray. Additive, soft-edged sprites catch the sunlight.
 */

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uCam;
  uniform vec3 uRayOrigin;
  uniform vec3 uRayDir;
  uniform float uPush;
  attribute vec4 aData; // seed, size, speed, brightness
  varying float vAlpha;
  varying float vWarm;

  void main() {
    float seed = aData.x;
    vec3 p = position;
    float t = uTime * aData.z;
    p.x += sin(t * 0.7 + seed * 40.0) * 0.9 + sin(t * 0.23 + seed * 13.0) * 1.6;
    p.y += t * 0.18 + sin(t * 0.9 + seed * 9.0) * 0.4;
    p.z += cos(t * 0.5 + seed * 27.0) * 0.9;

    // Wrap the volume around the camera so the air is always full.
    p.x = uCam.x + mod(p.x - uCam.x + 18.0, 36.0) - 18.0;
    p.z = uCam.z + mod(p.z - uCam.z + 34.0, 44.0) - 34.0;
    p.y = mod(p.y, 13.0) + 0.2;

    // Swept aside by the pointer.
    vec3 v = p - uRayOrigin;
    float tr = max(dot(v, uRayDir), 0.0);
    vec3 diff = p - (uRayOrigin + uRayDir * tr);
    float d = length(diff);
    float radius = 1.0 + tr * 0.1;
    p += normalize(diff + vec3(0.0001)) * (1.0 - smoothstep(0.0, radius, d)) * radius * 0.9 * uPush;

    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = -mv.z;
    gl_PointSize = min(uSize * aData.y * uPixelRatio * (10.0 / max(depth, 0.5)), 40.0 * uPixelRatio);
    // Fade near the lens and into the fog.
    vAlpha = aData.w * smoothstep(0.6, 2.5, depth) * (1.0 - smoothstep(18.0, 34.0, depth));
    vAlpha *= 0.65 + 0.35 * sin(uTime * 1.7 + seed * 50.0);
    vWarm = fract(seed * 7.13);
  }
`
const fragment = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    a = a * a;
    gl_FragColor = vec4(mix(uColorA, uColorB, vWarm), a * vAlpha);
    #include <colorspace_fragment>
  }
`

export function Pollen({ count }: { count: number }) {
  const dpr = useThree((s) => s.viewport.dpr)

  const geometry = useDisposable(() => {
    const rand = mulberry32(99)
    const positions = new Float32Array(count * 3)
    const data = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 36
      positions[i * 3 + 1] = rand() * 13
      positions[i * 3 + 2] = (rand() - 0.5) * 44
      data[i * 4] = rand()
      data[i * 4 + 1] = 0.4 + Math.pow(rand(), 3) * 1.8
      data[i * 4 + 2] = 0.5 + rand() * 0.9
      data[i * 4 + 3] = 0.35 + rand() * 0.65
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4))
    return g
  }, [count])

  const material = useDisposable(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uSize: { value: 9 },
          uCam: { value: new THREE.Vector3() },
          uRayOrigin: { value: new THREE.Vector3() },
          uRayDir: { value: new THREE.Vector3(0, 0, -1) },
          uPush: { value: 0 },
          uColorA: { value: new THREE.Color('#fff1c8') },
          uColorB: { value: new THREE.Color('#e9c46a') },
        },
      }),
  )

  const points = useMemo(() => {
    const p = new THREE.Points(geometry, material)
    p.frustumCulled = false
    return p
  }, [geometry, material])

  useFrame(({ camera }) => {
    const u = material.uniforms
    u.uTime.value = frame.time
    u.uPixelRatio.value = dpr
    u.uCam.value.copy(camera.position)
    u.uRayOrigin.value.copy(frame.rayOrigin)
    u.uRayDir.value.copy(frame.rayDir)
    const target = frame.pointerLive ? 1 : 0
    u.uPush.value += (target - u.uPush.value) * 0.08
  })

  return <primitive object={points} />
}
