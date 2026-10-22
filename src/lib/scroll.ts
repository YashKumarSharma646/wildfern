import { smoothScrollTo } from './smoothScroll'

export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  smoothScrollTo(el, reduce)
  // Move focus for keyboard and screen-reader users without a second jump.
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

export function scrollToTop() {
  smoothScrollTo(0, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}
