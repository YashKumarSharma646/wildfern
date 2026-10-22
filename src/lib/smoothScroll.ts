import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { gsap, ScrollTrigger } from './gsap'
import { sceneState } from './sceneState'

/*
 * Smooth scrolling (desktop mouse/trackpad only).
 *
 * Why: the browser scrolls the page on its compositor thread, while scroll-linked
 * animation (ScrollTrigger scrubs, parallax, the 3D camera) updates on the main
 * thread a frame later — so animated elements shimmer against the page, and wheel
 * "notches" arrive as 100px jumps. Lenis drives the scroll position from the same
 * frame tick as GSAP, so scroll, DOM animation and WebGL all move together.
 *
 * Touch devices keep native scrolling; reduced-motion users get no smoothing.
 */

export let lenis: Lenis | null = null

export function initSmoothScroll(): () => void {
  const fine = window.matchMedia('(pointer: fine)').matches
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!fine || reduce) return () => {}

  const instance = new Lenis({
    lerp: 0.11,
    smoothWheel: true,
    wheelMultiplier: 1,
    autoRaf: false,
  })
  lenis = instance
  sceneState.smoothScroll = true

  instance.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => instance.raf(time * 1000)
  gsap.ticker.add(tick)
  // Keep GSAP's clock in step with real time so Lenis and ScrollTrigger never drift
  // apart after a slow frame (Lenis's recommended setup).
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(tick)
    instance.destroy()
    lenis = null
    sceneState.smoothScroll = false
  }
}

/** Scroll to an element or position, through Lenis when it is active. */
export function smoothScrollTo(target: HTMLElement | number, immediate = false) {
  if (lenis) {
    lenis.scrollTo(target, { immediate, duration: immediate ? 0 : 1.6 })
    return
  }
  const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY
  window.scrollTo({ top, behavior: immediate ? 'auto' : 'smooth' })
}
