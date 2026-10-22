import { Bird, Coffee, Sun } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { Edge } from '../components/Edge'
import { gsap, MOTION_OK, useGSAP } from '../lib/gsap'
import { mulberry32 } from '../lib/random'

/** A broad, pointed leaflet from (x, y) toward (tx, ty), as an SVG path. */
function leaflet(x: number, y: number, tx: number, ty: number, width: number) {
  const dx = tx - x
  const dy = ty - y
  const len = Math.hypot(dx, dy)
  const nx = (-dy / len) * width
  const ny = (dx / len) * width
  const m1x = x + dx * 0.35
  const m1y = y + dy * 0.35
  return `M${x} ${y} Q${m1x + nx} ${m1y + ny} ${tx} ${ty} Q${m1x - nx * 0.7} ${m1y - ny * 0.7} ${x} ${y} Z`
}

/** Silhouetted fern frond for the foreground layer. */
function Frond({ className }: { className: string }) {
  const leaves = Array.from({ length: 16 }, (_, i) => {
    const t = i / 15
    // The stem curves gently; leaflets shrink toward the tip.
    const y = 410 - t * 380
    const x = 150 + Math.sin(t * 2.2) * 18
    const len = 128 * (1 - t * 0.78)
    const lift = 30 + t * 30
    return [
      leaflet(x, y, x - len, y - lift, len * 0.2),
      leaflet(x, y - 8, x + len, y - lift - 8, len * 0.2),
    ]
  })
  return (
    <svg className={`frond ${className}`} viewBox="0 0 300 420" aria-hidden="true">
      <g fill="currentColor">
        <path d="M148 420 C146 320 160 220 166 120 C170 70 172 30 168 0 L176 0 C180 30 178 70 174 120 C168 220 156 320 158 420 Z" />
        {leaves.flat().map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}

export function Moment() {
  const root = useRef<HTMLElement>(null)
  const motes = useMemo(() => {
    const rand = mulberry32(5)
    return Array.from({ length: 26 }, () => ({
      left: `${rand() * 100}%`,
      top: `${55 + rand() * 45}%`,
      dx: `${(rand() - 0.5) * 120}px`,
      duration: `${9 + rand() * 10}s`,
      delay: `${-rand() * 18}s`,
      scale: 0.5 + rand() * 0.9,
    }))
  }, [])

  // Layered parallax: background, arch window and fronds move at different speeds,
  // and the copy arrives line by line while the stage is pinned (sticky).
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const st = { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true }
        gsap.fromTo('.moment__bg img', { scale: 1.3, yPercent: -6 }, { scale: 1.05, yPercent: 6, ease: 'none', scrollTrigger: st })
        gsap.fromTo('.moment__arch', { yPercent: -38 }, { yPercent: -62, ease: 'none', scrollTrigger: st })
        gsap.fromTo('.moment__arch img', { yPercent: -10 }, { yPercent: 4, ease: 'none', scrollTrigger: st })
        gsap.fromTo('.moment__fronds', { yPercent: 18 }, { yPercent: -14, ease: 'none', scrollTrigger: st })

        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top 20%', end: 'center center', scrub: 0.6 },
        })
        tl.fromTo(
          '.moment__arch',
          { clipPath: 'inset(40% 22% 40% 22% round 999px 999px 0px 0px)' },
          { clipPath: 'inset(0% 0% 0% 0% round 999px 999px 0px 0px)', duration: 1 },
          0,
        )
          .from('.moment__copy .rw__i', { yPercent: 110, stagger: 0.08, duration: 0.6 }, 0.3)
          .from('.moment__senses li', { autoAlpha: 0, y: 20, stagger: 0.12, duration: 0.4 }, 0.7)
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} className="moment" aria-labelledby="moment-title">
      <Edge variant={0} />
      <div className="moment__stage">
        <div className="moment__layer moment__bg" aria-hidden="true">
          <img src="/images/misty.webp" alt="" loading="lazy" decoding="async" />
        </div>
        <div className="moment__arch" aria-hidden="true">
          <img src="/images/sunpath.webp" alt="" loading="lazy" decoding="async" />
        </div>
        <div className="moment__layer moment__beams" aria-hidden="true" />
        <div className="moment__layer moment__mist" aria-hidden="true" />
        <div className="moment__layer motes" aria-hidden="true">
          {motes.map((m, i) => (
            <span
              key={i}
              style={{
                left: m.left,
                top: m.top,
                animationDuration: m.duration,
                animationDelay: m.delay,
                scale: String(m.scale),
                ['--dx' as string]: m.dx,
              }}
            />
          ))}
        </div>
        <div className="moment__layer moment__fronds" aria-hidden="true">
          <Frond className="frond--l" />
          <Frond className="frond--r" />
          <Frond className="frond--t" />
        </div>

        <div className="moment__copy">
          <span className="eyebrow">04 — A Moment in Nature</span>
          <h2 id="moment-title" className="display" aria-label="Listen. The forest is brewing.">
            {['Listen.', 'The', 'forest', 'is', 'brewing.'].map((w, i) => (
              <span key={i}>
                <span className="rw" aria-hidden="true">
                  <span className="rw__i">{i === 4 ? <em>{w}</em> : w}</span>
                </span>
                {i === 0 ? <br /> : ' '}
              </span>
            ))}
          </h2>
          <ul className="moment__senses">
            <li>
              <Bird aria-hidden /> Birdsong at seven
            </li>
            <li>
              <Coffee aria-hidden /> Steam off the cup
            </li>
            <li>
              <Sun aria-hidden /> Light through cedar
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
