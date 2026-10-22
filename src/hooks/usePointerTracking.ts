import { useEffect } from 'react'
import { sceneState } from '../lib/sceneState'

/** Feeds window-level pointer/touch input into the shared scene state. */
export function usePointerTracking() {
  useEffect(() => {
    const p = sceneState.pointer
    const update = (e: PointerEvent) => {
      p.x = (e.clientX / window.innerWidth) * 2 - 1
      p.y = -(e.clientY / window.innerHeight) * 2 + 1
      p.isTouch = e.pointerType === 'touch' || e.pointerType === 'pen'
      p.active = true
      p.lastEvent = performance.now()
    }
    const onMove = (e: PointerEvent) => {
      // A touch drag is usually a scroll; only count it while the finger is down.
      if (e.pointerType === 'touch' && e.buttons === 0) return
      update(e)
    }
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) p.active = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', update, { passive: true })
    document.addEventListener('mouseout', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', update)
      document.removeEventListener('mouseout', onLeave)
    }
  }, [])
}
