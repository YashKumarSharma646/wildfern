import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { frame } from './frame'

export const SUN_DIR = new THREE.Vector3(0.42, 0.5, -1).normalize()

/* Light-space axes of the (fixed-direction) sun's shadow camera, and one texel's size. */
const SHADOW_SIZE = 80
const SHADOW_MAP = 2048
const SHADOW_TEXEL = SHADOW_SIZE / SHADOW_MAP
const SHADOW_X = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
const SHADOW_Y = new THREE.Vector3().crossVectors(SUN_DIR, SHADOW_X)
const shadowTmp = { center: new THREE.Vector3() }

/* Colour script: cool morning mist at the forest edge, warming to golden hour at the café. */
const PALETTE = {
  fogStart: new THREE.Color('#4f6255'),
  fogEnd: new THREE.Color('#5e5641'),
  zenithStart: new THREE.Color('#1f2d25'),
  zenithEnd: new THREE.Color('#2b2a20'),
  sunStart: new THREE.Color('#ffe2b0'),
  sunEnd: new THREE.Color('#ffb066'),
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = smoothstep(-0.05, 0.65, dir.y);
    vec3 col = mix(uHorizon, uZenith, h);
    float s = max(dot(dir, uSunDir), 0.0);
    col += uSun * (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.9 + pow(s, 600.0) * 2.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function Atmosphere({ shadows }: { shadows: boolean }) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const sky = useRef<THREE.Mesh>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)

  const fog = useMemo(() => new THREE.FogExp2(PALETTE.fogStart.clone(), 0.034), [])
  const background = useMemo(() => PALETTE.fogStart.clone(), [])
  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: PALETTE.fogStart.clone() },
          uZenith: { value: PALETTE.zenithStart.clone() },
          uSun: { value: PALETTE.sunStart.clone() },
          uSunDir: { value: SUN_DIR },
        },
      }),
    [],
  )

  useEffect(() => {
    scene.fog = fog
    scene.background = background
    return () => {
      scene.fog = null
      scene.background = null
      skyMaterial.dispose()
    }
  }, [scene, fog, background, skyMaterial])

  useFrame(() => {
    const p = frame.journey
    fog.color.lerpColors(PALETTE.fogStart, PALETTE.fogEnd, p)
    // Mist thins slightly as we approach the clearing.
    fog.density = THREE.MathUtils.lerp(0.043, 0.028, Math.pow(p, 0.8))
    background.copy(fog.color)
    const u = skyMaterial.uniforms
    u.uHorizon.value.copy(fog.color)
    u.uZenith.value.lerpColors(PALETTE.zenithStart, PALETTE.zenithEnd, p)
    u.uSun.value.lerpColors(PALETTE.sunStart, PALETTE.sunEnd, p)

    if (sky.current) sky.current.position.copy(camera.position)
    if (sun.current) {
      sun.current.color.copy(u.uSun.value)
      sun.current.intensity = THREE.MathUtils.lerp(2.4, 2.9, p)
      // Keep the shadow frustum centred on what the camera sees, snapped to whole
      // shadow-map texels in light space so shadow edges don't crawl while scrolling.
      const c = shadowTmp.center.set(0, 0, camera.position.z - 18)
      const sx = Math.round(c.dot(SHADOW_X) / SHADOW_TEXEL) * SHADOW_TEXEL
      const sy = Math.round(c.dot(SHADOW_Y) / SHADOW_TEXEL) * SHADOW_TEXEL
      const sz = c.dot(SUN_DIR)
      c.copy(SHADOW_X).multiplyScalar(sx).addScaledVector(SHADOW_Y, sy).addScaledVector(SUN_DIR, sz)
      sun.current.target.position.copy(c)
      sun.current.position.copy(c).addScaledVector(SUN_DIR, 60)
      sun.current.target.updateMatrixWorld()
    }
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.lerp(0.9, 0.75, p)
  })

  return (
    <>
      <mesh ref={sky} material={skyMaterial} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[190, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#c9d4b0', '#16200f', 0.9]} />
      <ambientLight intensity={0.12} color="#9fb28f" />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-SHADOW_SIZE / 2}
        shadow-camera-right={SHADOW_SIZE / 2}
        shadow-camera-top={SHADOW_SIZE / 2}
        shadow-camera-bottom={-SHADOW_SIZE / 2}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
    </>
  )
}
