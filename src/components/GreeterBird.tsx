import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { sceneState } from '../lib/sceneState'

/*
 * A little songbird who flies in, perches on the word you tapped and says hello.
 * Pure DOM/SVG (crisp at any size, independent of the WebGL scene) animated with Motion.
 */

export interface Visit {
  /** Changes on every tap so repeated taps re-trigger. */
  id: number
  /** Perch point (where the feet land), relative to the stage. */
  x: number
  y: number
  message: string
}

const BIRD_W = 92
const BIRD_H = 84
// Where the feet are inside the 92×84 box, so the bird perches exactly on the point.
const FEET_X = 46
const FEET_Y = 80

type Phase = 'flying' | 'perched' | 'leaving'

function Songbird({ talking }: { talking: boolean }) {
  return (
    <svg viewBox="0 0 100 90" width={BIRD_W} height={BIRD_H} aria-hidden="true">
      <g className="greeter__legs" stroke="#e0a043" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M42 72 L41 85 M41 85 L35 87 M41 85 L46 88" />
        <path d="M55 72 L55 85 M55 85 L49 87 M55 85 L60 88" />
      </g>
      <path d="M20 50 L2 40 L7 53 L0 62 L22 60 Z" fill="#4c6638" />
      <ellipse cx="46" cy="53" rx="30" ry="25" fill="#6f8f4a" />
      <ellipse cx="55" cy="61" rx="20" ry="15" fill="#f3e6c8" />
      <circle cx="66" cy="35" r="18" fill="#6f8f4a" />
      <path d="M61 19 C58 9 66 6 68 13 C70 6 78 9 72 18 Z" fill="#6f8f4a" />
      <g className="greeter__wing">
        <path d="M28 46 C36 32 58 35 61 50 C57 63 40 67 28 58 Z" fill="#587a3a" />
        <path d="M35 51 C43 47 51 48 55 53 M34 56 C42 53 49 55 53 58" stroke="#46622f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
      <ellipse cx="73" cy="43" rx="5" ry="3.4" fill="#f2a38f" opacity="0.85" />
      <g className="greeter__eye">
        <circle cx="71" cy="32" r="5.2" fill="#1b1a17" />
        <circle cx="72.9" cy="30.1" r="1.8" fill="#fff" />
      </g>
      <path d="M82 33 L95 36.5 L82 39.5 Z" fill="#e8b04a" />
      <path className={talking ? 'greeter__beak-low is-talking' : 'greeter__beak-low'} d="M82 38 L92 38.5 L82 42 Z" fill="#cf9330" />
    </svg>
  )
}

export function GreeterBird({ visit, onGone }: { visit: Visit | null; onGone: () => void }) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const [phase, setPhase] = useState<Phase>('flying')
  const [facingLeft, setFacingLeft] = useState(false)
  const [typed, setTyped] = useState('')
  // Where the bird is perched (state, so the bubble lays out from it during render).
  const [perch, setPerch] = useState<{ x: number; y: number } | null>(null)
  const pos = useRef<{ x: number; y: number } | null>(null)
  const leaveTimer = useRef<number | undefined>(undefined)
  const journeyAtLanding = useRef(0)
  const busy = useRef(false)
  const latestVisit = useRef(-1)

  const stageSize = () => {
    const el = scope.current?.parentElement
    return { w: el?.clientWidth ?? window.innerWidth, h: el?.clientHeight ?? window.innerHeight }
  }

  const leave = useCallback(async () => {
    if (!scope.current || !pos.current) return
    const leavingVisit = latestVisit.current
    window.clearTimeout(leaveTimer.current)
    busy.current = true
    setPhase('leaving')
    const { w } = stageSize()
    const goLeft = pos.current.x < w / 2
    setFacingLeft(goLeft)
    const reduce = sceneState.reducedMotion
    await animate(
      scope.current,
      reduce
        ? { opacity: 0 }
        : { x: goLeft ? -160 : w + 60, y: [pos.current.y - 30, -180], opacity: 1 },
      { duration: reduce ? 0.3 : 1.2, ease: 'easeIn' },
    )
    // A new tap arrived mid-departure: that visit takes over, so don't disappear.
    if (latestVisit.current !== leavingVisit) return
    pos.current = null
    busy.current = false
    onGone()
  }, [animate, onGone, scope])

  // React to each new visit: fly in (first time) or hop over to the new word.
  useEffect(() => {
    if (!visit || !scope.current) return
    let cancelled = false
    latestVisit.current = visit.id
    const el = scope.current
    const { w } = stageSize()
    const tx = Math.min(Math.max(visit.x - FEET_X, 8), w - BIRD_W - 8)
    const ty = visit.y - FEET_Y
    const reduce = sceneState.reducedMotion
    window.clearTimeout(leaveTimer.current)
    setTyped('')

    const run = async () => {
      busy.current = true
      if (reduce) {
        await animate(el, { x: tx, y: ty, opacity: [0, 1] }, { duration: 0.35 })
      } else if (!pos.current) {
        // Fly in from the far side, high up, on a gentle arc.
        const fromRight = visit.x < w / 2
        const sx = fromRight ? w + 80 : -BIRD_W - 80
        const sy = -BIRD_H - 60
        setFacingLeft(fromRight)
        setPhase('flying')
        await animate(
          el,
          { x: [sx, (sx + tx) / 2, tx], y: [sy, Math.min(sy, ty) + (ty - sy) * 0.75, ty], opacity: [1, 1, 1] },
          { duration: 1.6, ease: 'easeInOut', times: [0, 0.6, 1] },
        )
      } else {
        // Already here: a quick hop to the new word.
        const from = pos.current
        setFacingLeft(tx < from.x)
        setPhase('flying')
        await animate(
          el,
          { x: [from.x, (from.x + tx) / 2, tx], y: [from.y, Math.min(from.y, ty) - 70, ty] },
          { duration: 0.75, ease: 'easeInOut', times: [0, 0.5, 1] },
        )
      }
      if (cancelled) return
      pos.current = { x: tx, y: ty }
      setPerch(pos.current)
      journeyAtLanding.current = sceneState.journey
      // Turn to face the middle of the screen, so it's "talking to you".
      setFacingLeft(tx + BIRD_W / 2 > w / 2)
      setPhase('perched')
      busy.current = false
      leaveTimer.current = window.setTimeout(() => void leave(), 6500)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [visit?.id])

  // Typewriter for the speech bubble.
  useEffect(() => {
    if (phase !== 'perched' || !visit) return
    if (sceneState.reducedMotion) {
      setTyped(visit.message)
      return
    }
    let i = 0
    const id = window.setInterval(() => {
      i++
      setTyped(visit.message.slice(0, i))
      if (i >= visit.message.length) window.clearInterval(id)
    }, 32)
    return () => window.clearInterval(id)
  }, [phase, visit])

  // Leave politely if the visitor scrolls on into the forest.
  useEffect(() => {
    if (phase !== 'perched') return
    const onScroll = () => {
      if (Math.abs(sceneState.journey - journeyAtLanding.current) > 0.04) void leave()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [phase, leave])

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  if (!visit) return null

  const stageW = scope.current?.parentElement?.clientWidth ?? window.innerWidth
  const bubbleOnLeft = perch ? perch.x + BIRD_W / 2 > stageW / 2 : false
  const bubbleBelow = perch ? perch.y < 140 : false
  // Keep the bubble fully on screen (narrow phones especially) and aim its tail at the bird.
  const bubbleW = Math.min(250, stageW - 48)
  const birdCenter = (perch?.x ?? 0) + BIRD_W / 2
  const bubbleAbsLeft = Math.min(
    Math.max(bubbleOnLeft ? birdCenter - bubbleW + 34 : birdCenter - 34, 12),
    stageW - bubbleW - 12,
  )
  const bubbleStyle = {
    left: bubbleAbsLeft - (perch?.x ?? 0),
    maxWidth: bubbleW,
    '--tail-x': `${Math.min(Math.max(birdCenter - bubbleAbsLeft - 8, 14), bubbleW - 30)}px`,
    transformOrigin: `${birdCenter - bubbleAbsLeft}px ${bubbleBelow ? '0%' : '100%'}`,
  } as CSSProperties
  const talking = phase === 'perched' && typed.length < visit.message.length

  return (
    <motion.div
      ref={scope}
      className={`greeter greeter--${phase}`}
      style={{ opacity: 0 }}
      onClick={(e) => {
        e.stopPropagation()
        if (!busy.current) void leave()
      }}
      title="Bye, little bird"
    >
      <div className="greeter__flip" style={{ transform: facingLeft ? 'scaleX(-1)' : undefined }}>
        <div className="greeter__bob">
          <Songbird talking={talking} />
        </div>
      </div>
      <AnimatePresence>
        {phase === 'perched' && (
          <motion.div
            key={visit.id}
            className={`greeter__bubble ${bubbleBelow ? 'is-below' : ''}`}
            style={bubbleStyle}
            role="status"
            aria-live="polite"
            aria-label={visit.message}
            initial={{ opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          >
            <span aria-hidden="true">
              {typed}
              <span className="greeter__caret" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
