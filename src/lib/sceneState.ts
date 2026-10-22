/**
 * Mutable state shared between the DOM and the WebGL loop.
 * Written by event listeners / ScrollTrigger, read inside useFrame —
 * deliberately outside React so the animation loop never triggers re-renders.
 */
export const sceneState = {
  pointer: {
    /** Normalised device coordinates, -1..1 */
    x: 0,
    y: 0,
    /** A real pointer is currently steering the scene */
    active: false,
    /** performance.now() of the last pointer/touch event */
    lastEvent: 0,
    isTouch: false,
  },
  /** Journey scroll progress 0..1 (target; the scene eases towards it) */
  journey: 0,
  reducedMotion: false,
  /** Clicks/taps on the 3D scene (NDC), consumed by the scene's click effects. */
  clicks: [] as { x: number; y: number }[],
}

export function pointerIsLive(now = performance.now()): boolean {
  const p = sceneState.pointer
  if (!p.active) return false
  // Touches only "count" briefly, then the scene drifts back to ambient motion.
  return p.isTouch ? now - p.lastEvent < 1600 : true
}
