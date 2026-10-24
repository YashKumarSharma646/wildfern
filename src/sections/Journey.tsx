import { ArrowRight, CalendarDays, Coffee, KeyRound } from 'lucide-react'
import { motion } from 'motion/react'
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { GreeterBird, type Visit } from '../components/GreeterBird'
import { GREETINGS } from '../content'
import { gsap, ScrollTrigger, useGSAP } from '../lib/gsap'
import type { Quality } from '../lib/quality'
import { sceneState } from '../lib/sceneState'
import { scrollToId } from '../lib/scroll'

// The 3D bundle (three.js + scene) is split out and loaded after first paint.
const ForestScene = lazy(() => import('../three/ForestScene'))

class SceneBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[wildfern] 3D scene failed, showing photographic fallback.', error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function Fallback() {
  return (
    <div className="journey__fallback" aria-hidden="true">
      <img src="/images/darkforest.webp" alt="" data-fallback-img />
    </div>
  )
}

const STOPS = ['Forest edge', 'Old cedars', 'The glasshouse']

interface Props {
  quality: Quality
  webgl: boolean
  ready: boolean
  onSceneReady: () => void
}

export function Journey({ quality, webgl, ready, onSceneReady }: Props) {
  const root = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(true)
  const [failed, setFailed] = useState(false)
  const [visit, setVisit] = useState<Visit | null>(null)
  const visits = useRef(0)
  const progressList = useRef<HTMLOListElement>(null)
  const lastStop = useRef(0)
  const show3D = webgl && !failed

  /*
   * Taps on the stage: a word calls the songbird over to perch on it; anywhere else
   * goes to the 3D scene (ground → leaf burst, sky → ripples). Buttons keep working.
   */
  const onStageClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('a, button, .greeter')) return
    const stage = e.currentTarget.getBoundingClientRect()
    const word = target.closest<HTMLElement>('[data-say-hi]')
    if (word) {
      // Perch on top of the specific word that was tapped, if we can find it.
      const piece = target.closest<HTMLElement>('.rw') ?? word
      const r = piece.getBoundingClientRect()
      const x = piece === word ? e.clientX : r.left + r.width / 2
      setVisit({
        id: ++visits.current,
        x: x - stage.left,
        y: r.top - stage.top + r.height * 0.12,
        message: GREETINGS[(visits.current - 1) % GREETINGS.length],
      })
      return
    }
    if (show3D) {
      sceneState.clicks.push({
        x: ((e.clientX - stage.left) / stage.width) * 2 - 1,
        y: -((e.clientY - stage.top) / stage.height) * 2 + 1,
      })
    }
  }
  const onBirdGone = useCallback(() => setVisit(null), [])

  // Pause the WebGL loop entirely once the journey is off-screen.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useGSAP(
    () => {
      gsap.set('.discovery__caption, .discovery__final', { y: 30 })
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
          onUpdate: (self) => {
            sceneState.journey = self.progress
            // Update the route indicator directly — no React re-render while scrolling.
            const stop = self.progress < 0.36 ? 0 : self.progress < 0.7 ? 1 : 2
            if (stop !== lastStop.current) {
              lastStop.current = stop
              progressList.current?.querySelectorAll('li').forEach((li, i) => li.classList.toggle('is-active', i === stop))
            }
          },
        },
      })
      tl.to('.hero__inner', { yPercent: -18, autoAlpha: 0, duration: 0.12 }, 0)
        .to('.hero__meta, .scroll-cue', { autoAlpha: 0, duration: 0.06 }, 0)
        .to('.discovery__caption--1', { autoAlpha: 1, y: 0, duration: 0.07 }, 0.16)
        .to('.discovery__caption--1', { autoAlpha: 0, y: -30, duration: 0.07 }, 0.33)
        .to('.discovery__caption--2', { autoAlpha: 1, y: 0, duration: 0.07 }, 0.4)
        .to('.discovery__caption--2', { autoAlpha: 0, y: -30, duration: 0.07 }, 0.56)
        .to('.discovery__caption--3', { autoAlpha: 1, y: 0, duration: 0.07 }, 0.62)
        .to('.discovery__caption--3', { autoAlpha: 0, y: -30, duration: 0.07 }, 0.75)
        .to('.discovery__final', { autoAlpha: 1, y: 0, duration: 0.1 }, 0.82)
        .to({}, { duration: 0.08 }, 0.92)

      // Without WebGL, a slow push-in on the photograph keeps the sense of travel.
      if (!show3D) tl.fromTo('[data-fallback-img]', { scale: 1 }, { scale: 1.35, duration: 1 }, 0)

      ScrollTrigger.refresh()
    },
    { scope: root, dependencies: [show3D] },
  )

  return (
    <section id="top" ref={root} className="journey" aria-label="Welcome to Wildfern">
      <div className="journey__stage" onClick={onStageClick}>
        {show3D ? (
          <SceneBoundary fallback={<Fallback />} onError={() => { setFailed(true); onSceneReady() }}>
            <Suspense fallback={<Fallback />}>
              <ForestScene quality={quality} active={inView} onReady={onSceneReady} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <Fallback />
        )}
        <div className="journey__scrim" />
        <div className="journey__vignette" />

        <div className="hero">
          <div className="hero__inner">
            <motion.span
              className="eyebrow hero__kicker"
              initial={{ opacity: 0, y: 12 }}
              animate={ready ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 1, delay: 0.2 }}
            >
              A hidden café · Est. in the cedars
            </motion.span>
            <h1 className="display hero__title" aria-label="Find Your Wild." data-say-hi>
              {['Find', 'Your', 'Wild.'].map((w, i) => (
                <span className="rw" key={w} aria-hidden="true">
                  <motion.span
                    className="rw__i"
                    initial={{ y: '110%', rotate: 5 }}
                    animate={ready ? { y: '0%', rotate: 0 } : undefined}
                    transition={{ duration: 1.5, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {i === 2 ? <em>{w}</em> : w}
                  </motion.span>
                  {i < 2 ? ' ' : null}
                </span>
              ))}
            </h1>
            <motion.p
              className="hero__sub"
              data-say-hi
              initial={{ opacity: 0, y: 16 }}
              animate={ready ? { opacity: 0.92, y: 0 } : undefined}
              transition={{ duration: 1.2, delay: 0.85 }}
            >
              Coffee, crafted by nature.
            </motion.p>
            <motion.div
              className="hero__ctas"
              initial={{ opacity: 0, y: 16 }}
              animate={ready ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 1.2, delay: 1.05 }}
            >
              <button className="btn btn--solid" onClick={() => scrollToId('space')}>
                Explore the Café <ArrowRight aria-hidden />
              </button>
              <button className="btn" onClick={() => scrollToId('reservations')}>
                Reserve a Table <CalendarDays aria-hidden />
              </button>
            </motion.div>
          </div>
        </div>

        <div className="hero__meta" aria-hidden="true">
          <span>Open daily · 7:00 – 18:00</span>
          <span>{show3D ? 'Tap the ground, the sky — or a word' : 'Tap a word — someone wants to say hi'}</span>
        </div>
        <div className="scroll-cue" aria-hidden="true">
          <span>Scroll</span>
          <span className="scroll-cue__line" />
        </div>

        <div className="discovery">
          <div className="discovery__caption discovery__caption--1">
            <span className="eyebrow">The Discovery</span>
            <p data-say-hi>Leave the road behind. Follow the light between the trees.</p>
          </div>
          <div className="discovery__caption discovery__caption--2">
            <span className="eyebrow">Old cedars</span>
            <p data-say-hi>Past moss and fern, where the birdsong gets louder.</p>
          </div>
          <div className="discovery__caption discovery__caption--3">
            <span className="eyebrow">A warm glow</span>
            <p data-say-hi>Something glimmers ahead — and the air smells of coffee.</p>
          </div>
          <div className="discovery__final">
            <span className="eyebrow">You have arrived</span>
            <h2 className="display" data-say-hi>
              The <em>Glasshouse</em>
            </h2>
            <p>A café of timber, stone and glass, tucked into a clearing at the heart of the forest.</p>
            <div className="discovery__choice" role="group" aria-label="How are you visiting today?">
              <span className="discovery__ask">How are you visiting today?</span>
              <button type="button" className="btn btn--solid" onClick={() => scrollToId('story')}>
                <Coffee aria-hidden /> Continue as a guest
              </button>
              <a className="btn" href="/admin">
                <KeyRound aria-hidden /> I’m the owner
              </a>
            </div>
          </div>
        </div>

        <GreeterBird visit={visit} onGone={onBirdGone} />

        <ol className="journey__progress" aria-hidden="true" ref={progressList}>
          {STOPS.map((s, i) => (
            <li key={s} className={i === 0 ? 'is-active' : undefined}>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
