import type { RefObject } from 'react'
import { gsap, MOTION_OK, ScrollTrigger, useGSAP } from '../lib/gsap'

/**
 * Standard scroll choreography for a section. Everything here only runs when the
 * user allows motion — with reduced motion the content is simply visible.
 *
 *  [data-reveal-text]  words rise from behind a mask, staggered
 *  [data-reveal]       fades and lifts in
 *  [data-reveal-img]   frame un-clips upward while its image settles from a zoom
 *  [data-parallax]     image drifts against the scroll (value = strength)
 */
export function useSectionMotion(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const root = scope.current
        if (!root) return

        root.querySelectorAll<HTMLElement>('[data-reveal-text]').forEach((el) => {
          gsap.from(el.querySelectorAll('.rw__i'), {
            yPercent: 115,
            rotate: 4,
            duration: 1.3,
            ease: 'expo.out',
            stagger: 0.06,
            scrollTrigger: { trigger: el, start: 'top 86%' },
          })
        })

        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: 40,
            autoAlpha: 0,
            duration: 1.2,
            ease: 'power3.out',
            delay: Number(el.dataset.reveal) || 0,
            scrollTrigger: { trigger: el, start: 'top 90%' },
          })
        })

        root.querySelectorAll<HTMLElement>('[data-reveal-img]').forEach((el) => {
          const img = el.querySelector('img')
          const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%' } })
          tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut' })
          if (img) tl.from(img, { scale: 1.3, duration: 2.2, ease: 'expo.out' }, 0.2)
        })

        root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
          const strength = Number(el.dataset.parallax) || 12
          gsap.fromTo(
            el,
            { yPercent: -strength / 2 },
            {
              yPercent: strength / 2,
              ease: 'none',
              scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          )
        })
      })
      // Images and fonts change layout after load; keep trigger positions honest.
      const refresh = () => ScrollTrigger.refresh()
      window.addEventListener('load', refresh)
      return () => {
        window.removeEventListener('load', refresh)
        mm.revert()
      }
    },
    { scope },
  )
}
