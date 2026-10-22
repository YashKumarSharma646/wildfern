export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  // Move focus for keyboard and screen-reader users without a second jump.
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}
