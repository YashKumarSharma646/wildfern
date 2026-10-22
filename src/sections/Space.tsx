import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Edge } from '../components/Edge'
import { RevealText } from '../components/RevealText'
import { useSectionMotion } from '../hooks/useSectionMotion'

const MATERIALS = [
  ['Reclaimed cedar', 'Frame & bar'],
  ['River stone', 'Terrace & hearth'],
  ['Hand-blown glass', 'Walls & pendants'],
  ['240 living plants', 'Everywhere'],
]

const SLIDES = [
  {
    src: '/images/conservatory.webp',
    alt: 'A light-filled glasshouse café with plants, a round table and a French press',
    title: 'The Glasshouse',
    meta: '28 seats · beneath the canopy',
    wide: true,
  },
  {
    src: '/images/glasshouse.webp',
    alt: 'A modern timber and glass building glowing warmly at dusk among trees',
    title: 'At dusk',
    meta: 'Architecture',
  },
  {
    src: '/images/interior.webp',
    alt: 'A café interior with greenery, wooden furniture and a long bar',
    title: 'The Bar',
    meta: 'Cedar & stone',
  },
  {
    src: '/images/bridge.webp',
    alt: 'A wooden footbridge leading into dense green forest',
    title: 'The way in',
    meta: 'Cedar bridge',
  },
  {
    src: '/images/woodroom.webp',
    alt: 'A warm café room with long wooden tables and benches',
    title: 'The Long Table',
    meta: 'Private hire · up to 16',
    wide: true,
  },
]

/*
 * A horizontal gallery the visitor drives directly — drag, swipe, trackpad, arrow
 * buttons or keyboard — with native scroll-snap. The page's vertical scroll is never
 * hijacked: scrolling down simply continues down the page.
 */
export function Space() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const [index, setIndex] = useState(0)
  const [edges, setEdges] = useState({ start: true, end: false })
  useSectionMotion(root)

  // Progress line, current slide and a gentle image parallax — all from the track's scroll.
  const sync = useCallback(() => {
    const el = track.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const progress = max > 0 ? el.scrollLeft / max : 0
    if (bar.current) bar.current.style.transform = `scaleX(${0.08 + progress * 0.92})`
    const slides = Array.from(el.children) as HTMLElement[]
    const center = el.scrollLeft + el.clientWidth / 2
    let nearest = 0
    let best = Infinity
    slides.forEach((s, i) => {
      const mid = s.offsetLeft + s.offsetWidth / 2
      const d = Math.abs(mid - center)
      if (d < best) {
        best = d
        nearest = i
      }
      const img = s.querySelector('img')
      if (img) img.style.transform = `translate3d(${((mid - center) / el.clientWidth) * -6}%, 0, 0)`
    })
    setIndex(nearest)
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft > max - 4 })
  }, [])

  useEffect(() => {
    const el = track.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(sync)
    }
    sync()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [sync])

  const goTo = (i: number) => {
    const el = track.current
    if (!el) return
    const slide = el.children[Math.max(0, Math.min(el.children.length - 1, i))] as HTMLElement
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({
      left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(index + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(index - 1)
    }
  }

  /* Mouse drag-to-scroll with a little momentum. Touch and trackpads use native scrolling. */
  const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0, lastX: 0, lastT: 0, v: 0 })
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const el = track.current!
    drag.current = { active: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft, lastX: e.clientX, lastT: performance.now(), v: 0 }
    el.classList.add('is-dragging')
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    const el = track.current!
    const dx = e.clientX - d.startX
    if (Math.abs(dx) > 4 && !d.moved) {
      d.moved = true
      el.setPointerCapture(e.pointerId)
    }
    el.scrollLeft = d.startScroll - dx
    const now = performance.now()
    d.v = (e.clientX - d.lastX) / Math.max(now - d.lastT, 1)
    d.lastX = e.clientX
    d.lastT = now
  }
  const endDrag = () => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    const el = track.current!
    el.classList.remove('is-dragging')
    if (!d.moved) return
    // Fling: project the release velocity, then let scroll-snap settle on a slide.
    const center = el.scrollLeft - d.v * 260 + el.clientWidth / 2
    let nearest = index
    let best = Infinity
    Array.from(el.children).forEach((c, i) => {
      const s = c as HTMLElement
      const dist = Math.abs(s.offsetLeft + s.offsetWidth / 2 - center)
      if (dist < best) {
        best = dist
        nearest = i
      }
    })
    goTo(nearest)
  }

  return (
    <section id="space" ref={root} className="space" aria-labelledby="space-title">
      <Edge variant={1} />
      <div className="container space__head">
        <div className="space__intro">
          <span className="eyebrow" data-reveal>
            02 — The Café
          </span>
          <RevealText id="space-title" className="display" text="A glasshouse hidden among the *cedars.*" />
        </div>
        <div className="space__aside">
          <p data-reveal>
            Designed around three old trees we refused to cut, Wildfern is mostly window. Light arrives through the canopy, warms
            the stone, and moves across the room as the day goes on.
          </p>
          <ul className="materials" data-reveal="0.1">
            {MATERIALS.map(([m, where]) => (
              <li key={m}>
                {m}
                <span>{where}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="gallery" data-reveal>
        <div
          ref={track}
          className="gallery__track"
          role="region"
          aria-roledescription="carousel"
          aria-label="Photos of the café — use the arrow keys or drag to browse"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onClickCapture={(e) => {
            // A drag shouldn't count as a click on whatever was under the cursor.
            if (drag.current.moved) e.preventDefault()
          }}
        >
          {SLIDES.map((s, i) => (
            <figure
              key={s.src}
              className={`gallery__slide ${s.wide ? 'is-wide' : ''}`}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length + 1}: ${s.title}`}
            >
              <div className="gallery__frame">
                <img src={s.src} alt={s.alt} loading="lazy" decoding="async" draggable={false} />
              </div>
              <figcaption>
                <strong>{s.title}</strong>
                <span>{s.meta}</span>
              </figcaption>
            </figure>
          ))}
          <div className="gallery__slide gallery__note">
            <span className="eyebrow">The Terrace</span>
            <h3 className="display">
              Fourteen seats under the <em>open sky.</em>
            </h3>
            <p>
              Stone underfoot, festoon lights overhead, ferns brushing your ankles. Blankets by the door for cool mornings — and
              the birds don&apos;t mind if you stay all afternoon.
            </p>
          </div>
        </div>

        <div className="container gallery__controls">
          <span className="gallery__count" aria-live="polite">
            <strong>{String(Math.min(index + 1, SLIDES.length + 1)).padStart(2, '0')}</strong> / {String(SLIDES.length + 1).padStart(2, '0')}
          </span>
          <span className="gallery__bar" aria-hidden="true">
            <span ref={bar} />
          </span>
          <span className="gallery__hint" aria-hidden="true">
            Drag or swipe
          </span>
          <div className="gallery__arrows">
            <button className="gallery__arrow" onClick={() => goTo(index - 1)} disabled={edges.start} aria-label="Previous photo">
              <ArrowLeft aria-hidden />
            </button>
            <button className="gallery__arrow" onClick={() => goTo(index + 1)} disabled={edges.end} aria-label="Next photo">
              <ArrowRight aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
