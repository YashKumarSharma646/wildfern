import * as THREE from 'three'

/**
 * Per-frame derived values computed once by <CameraRig> (which runs first,
 * at a negative useFrame priority) and consumed by every other system.
 */
export const frame = {
  time: 0,
  /** eased journey progress 0..1 */
  journey: 0,
  /** eased pointer in NDC — ambient drift when no pointer is live */
  pointer: new THREE.Vector2(),
  pointerLive: false,
  /** world-space ray through the pointer */
  rayOrigin: new THREE.Vector3(),
  rayDir: new THREE.Vector3(0, 0, -1),
  /** point on that ray ~12 units in front of the camera */
  pointerWorld: new THREE.Vector3(),
  /** smoothed pointer speed, used to make gestures feel like a gust */
  pointerSpeed: 0,
  /** global time scale (slower when reduced motion is requested) */
  timeScale: 1,
  /**
   * Low-pass-filtered frame delta. Raw rAF deltas wobble by a few ms even at a steady
   * 60 fps; feeding that wobble into motion is what reads as micro-stutter.
   */
  dt: 1 / 60,
  /** Last click "shock" in world space (startles birds); time in frame.time units. */
  shock: new THREE.Vector3(0, -999, 0),
  shockTime: -999,
}
