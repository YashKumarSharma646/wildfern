import { useRef } from 'react'
import { Edge } from '../components/Edge'
import { RevealText } from '../components/RevealText'
import { useSectionMotion } from '../hooks/useSectionMotion'
import { gsap, MOTION_OK, useGSAP } from '../lib/gsap'

/** A fern frond drawn as single strokes, so it can "grow" as you scroll. */
function BotanicalLine() {
  return (
    <svg className="botanical" viewBox="0 0 200 320" aria-hidden="true">
      <path d="M100 318 C98 250 104 170 96 90 C92 50 100 20 108 4" />
      {Array.from({ length: 11 }, (_, i) => {
        const y = 290 - i * 24
        const len = 70 - i * 5
        return (
          <g key={i}>
            <path d={`M${99 - i * 0.3} ${y} C ${80 - len * 0.2} ${y - 12}, ${100 - len} ${y - 18}, ${100 - len * 1.05} ${y - 34}`} />
            <path d={`M${100 - i * 0.3} ${y - 8} C ${120 + len * 0.2} ${y - 20}, ${100 + len} ${y - 26}, ${100 + len * 1.05} ${y - 42}`} />
          </g>
        )
      })}
    </svg>
  )
}

export function Philosophy() {
  const root = useRef<HTMLElement>(null)
  useSectionMotion(root)

  // The fern frond draws itself as the section scrolls by.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const paths = gsap.utils.toArray<SVGPathElement>('.botanical path')
        paths.forEach((p) => {
          const len = p.getTotalLength()
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len })
        })
        gsap.to(paths, {
          strokeDashoffset: 0,
          ease: 'none',
          stagger: 0.04,
          scrollTrigger: { trigger: '.philosophy__fig-main', start: 'top 70%', end: 'bottom 40%', scrub: 1 },
        })
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="story" ref={root} className="philosophy on-light" aria-labelledby="story-title">
      <Edge variant={0} />
      <div className="container">
        <div className="philosophy__head">
          <span className="eyebrow" data-reveal>
            01 — Our Philosophy
          </span>
          <RevealText id="story-title" className="display philosophy__title" text="Rooted in nature. Made for *slow* moments." />
        </div>

        <div className="philosophy__grid">
          <figure className="philosophy__fig-main" style={{ margin: 0 }}>
            <div className="frame" data-reveal-img>
              <img src="/images/leaves.webp" alt="Dense, deep-green leaves in soft shade" loading="lazy" decoding="async" data-parallax="14" />
            </div>
            <BotanicalLine />
          </figure>

          <div className="philosophy__copy">
            <p className="lead" data-reveal>
              We built Wildfern for the hour you didn&apos;t plan — the one where the coffee is still warm and nobody needs you yet.
            </p>
            <p data-reveal="0.1">
              Our beans come from twelve small growers who farm under shade canopies, the way coffee grew before it grew in rows. We
              roast in small batches, brew by hand, and let the forest set the pace.
            </p>
            <p data-reveal="0.2">
              No screens at the bar. No rush at the table. Just birdsong, steam, and light moving slowly across the floor.
            </p>
          </div>

          <figure className="philosophy__fig-small" style={{ margin: 0 }}>
            <div className="frame" data-reveal-img>
              <img src="/images/pourover.webp" alt="A barista brewing pour-over coffee with a gooseneck kettle" loading="lazy" decoding="async" data-parallax="10" />
            </div>
            <figcaption>Hand-poured, always</figcaption>
          </figure>
        </div>

        <dl className="philosophy__stats">
          <div data-reveal>
            <dt>Shade-grown partner farms</dt>
            <dd>12</dd>
          </div>
          <div data-reveal="0.1">
            <dt>Single-use plastics</dt>
            <dd>0</dd>
          </div>
          <div data-reveal="0.2">
            <dt>Doors open at first light</dt>
            <dd>7:00</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
