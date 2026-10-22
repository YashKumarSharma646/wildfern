import { MotionConfig } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Nav } from './components/Nav'
import { Preloader } from './components/Preloader'
import { usePointerTracking } from './hooks/usePointerTracking'
import { useReducedMotion } from './hooks/useReducedMotion'
import { ScrollTrigger } from './lib/gsap'
import { detectQuality, hasWebGL } from './lib/quality'
import { sceneState } from './lib/sceneState'
import { Footer } from './sections/Footer'
import { Journey } from './sections/Journey'
import { Menu } from './sections/Menu'
import { Moment } from './sections/Moment'
import { Philosophy } from './sections/Philosophy'
import { Reservations } from './sections/Reservations'
import { Space } from './sections/Space'

const MIN_INTRO_MS = 1300
const MAX_INTRO_MS = 4500

export default function App() {
  const quality = useMemo(() => detectQuality(), [])
  const webgl = useMemo(() => hasWebGL(), [])
  const reducedMotion = useReducedMotion()
  const [sceneReady, setSceneReady] = useState(!webgl)
  const [introDone, setIntroDone] = useState(false)
  const [maxWaitOver, setMaxWaitOver] = useState(false)

  usePointerTracking()

  useEffect(() => {
    sceneState.reducedMotion = reducedMotion
  }, [reducedMotion])

  useEffect(() => {
    // Always start at the top so the journey begins at the forest edge.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    const a = window.setTimeout(() => setIntroDone(true), sceneState.reducedMotion ? 300 : MIN_INTRO_MS)
    const b = window.setTimeout(() => setMaxWaitOver(true), MAX_INTRO_MS)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])

  const ready = introDone && (sceneReady || maxWaitOver)

  useEffect(() => {
    if (!ready) return
    // Layout is final once the preloader leaves: order triggers by page position and re-measure.
    const id = window.setTimeout(() => {
      ScrollTrigger.sort()
      ScrollTrigger.refresh()
    }, 200)
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
    return () => window.clearTimeout(id)
  }, [ready])

  const onSceneReady = useCallback(() => setSceneReady(true), [])

  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#story">
        Skip to content
      </a>
      <Preloader visible={!ready} />
      <Nav />
      <main>
        <Journey quality={quality} webgl={webgl} ready={ready} onSceneReady={onSceneReady} />
        <Philosophy />
        <Space />
        <Menu />
        <Moment />
        <Reservations />
      </main>
      <Footer />
      <div className="grain" aria-hidden="true" />
    </MotionConfig>
  )
}
