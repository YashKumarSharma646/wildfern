import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { sceneState, pointerIsLive } from '../lib/sceneState'
import { frame } from './frame'
import { CAFE_Z, CAMERA_END_Z, CAMERA_START_Z, pathX } from './layout'

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Drives the cinematic dolly through the forest from scroll progress, layered with
 * pointer-driven parallax and a slow "handheld" drift. All motion is critically
 * damped so nothing ever snaps.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)

  const tmp = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      cafeLook: new THREE.Vector3(0, 2.3, CAFE_Z),
      lookCurrent: new THREE.Vector3(0, 4, -10),
      ndc: new THREE.Vector3(),
      lastPointer: new THREE.Vector2(),
    }),
    [],
  )

  // Wider lens on portrait screens so the composition survives on phones.
  useEffect(() => {
    const aspect = size.width / size.height
    camera.fov = aspect < 0.8 ? 68 : aspect < 1.2 ? 58 : 48
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  useFrame((_, rawDt) => {
    // Exponential easing is stable at any step size, so only guard against huge gaps
    // (tab switches). A tight clamp would make the camera crawl whenever fps dips.
    // Then low-pass the delta so rAF timing noise doesn't turn into visible stutter.
    frame.dt += (Math.min(rawDt, 1 / 8) - frame.dt) * 0.15
    const dt = frame.dt
    const reduced = sceneState.reducedMotion
    frame.timeScale = reduced ? 0.35 : 1
    frame.time += dt * frame.timeScale

    // Ease scroll progress — inertia gives the dolly a heavy, cinematic feel.
    const target = sceneState.journey
    frame.journey += (target - frame.journey) * (1 - Math.exp(-dt * (reduced ? 12 : 4)))
    const p = frame.journey

    // Pointer: live input, or a slow figure-eight drift on touch / idle.
    const live = pointerIsLive()
    frame.pointerLive = live
    const t = frame.time
    const px = live ? sceneState.pointer.x : Math.sin(t * 0.21) * 0.45
    const py = live ? sceneState.pointer.y : Math.sin(t * 0.13) * 0.25
    const k = 1 - Math.exp(-dt * (live ? 6 : 1.5))
    tmp.lastPointer.copy(frame.pointer)
    frame.pointer.x += (px - frame.pointer.x) * k
    frame.pointer.y += (py - frame.pointer.y) * k
    const speed = tmp.lastPointer.distanceTo(frame.pointer) / Math.max(dt, 1e-3)
    frame.pointerSpeed += (speed - frame.pointerSpeed) * (1 - Math.exp(-dt * 4))

    // Dolly along the trail; ease-in-out on the journey so it starts and lands gently.
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    // Portrait screens stop further back so the whole café fits the narrow frame.
    const portrait = THREE.MathUtils.clamp((1.2 - camera.aspect) / 0.75, 0, 1)
    const z = THREE.MathUtils.lerp(CAMERA_START_Z, CAMERA_END_Z + portrait * 8, eased)
    const parallax = reduced ? 0 : 1
    const handheld = reduced ? 0 : 1
    tmp.pos.set(
      pathX(z) * 0.85 + frame.pointer.x * 1.1 * parallax + Math.sin(t * 0.37) * 0.12 * handheld,
      THREE.MathUtils.lerp(3.6, 2.15, eased) + frame.pointer.y * 0.45 * parallax + Math.sin(t * 0.53) * 0.06 * handheld,
      z,
    )
    camera.position.lerp(tmp.pos, 1 - Math.exp(-dt * 5))

    // Look ahead down the trail, then settle on the café as it is revealed.
    const ahead = z - 18
    tmp.look.set(pathX(ahead) * 0.6 + frame.pointer.x * 1.6 * parallax, THREE.MathUtils.lerp(4.6, 2.6, eased) + portrait * 1.4 + frame.pointer.y * 0.9 * parallax, ahead)
    tmp.look.lerp(tmp.cafeLook, smoothstep(0.55, 1, p))
    tmp.lookCurrent.lerp(tmp.look, 1 - Math.exp(-dt * 4))
    camera.lookAt(tmp.lookCurrent)
    camera.updateMatrixWorld()

    // Pointer ray for birds, pollen and leaves.
    tmp.ndc.set(frame.pointer.x, frame.pointer.y, 0.5).unproject(camera)
    frame.rayOrigin.copy(camera.position)
    frame.rayDir.copy(tmp.ndc).sub(camera.position).normalize()
    frame.pointerWorld.copy(frame.rayOrigin).addScaledVector(frame.rayDir, 12)
  }, -10)

  return null
}
