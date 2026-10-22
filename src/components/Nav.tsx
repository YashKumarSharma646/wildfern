import { Menu as MenuIcon, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NAV_LINKS } from '../content'
import { scrollToId } from '../lib/scroll'
import { FernMark } from './FernMark'

export function Nav() {
  const [solid, setSolid] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  // Solid once past the hero's first screen; hide while scrolling down, reveal on the way up.
  useEffect(() => {
    let last = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        setSolid(y > window.innerHeight * 0.6)
        setHidden(y > last + 2 && y > window.innerHeight * 0.4)
        if (y < last - 2) setHidden(false)
        last = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight the section currently in view.
  useEffect(() => {
    const els = NAV_LINKS.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e)
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)))
        // Sections not in the nav (hero, interlude) clear the highlight.
        setActive(NAV_LINKS.find((l) => visible.has(l.id))?.id ?? null)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Lock scroll and allow Escape while the mobile menu is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    // Let the overlay release its scroll lock before scrolling.
    requestAnimationFrame(() => scrollToId(id))
  }

  const toTop = () => {
    setOpen(false)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <>
      <header className={`nav ${solid || open ? 'nav--solid' : ''} ${hidden && !open ? 'nav--hidden' : ''}`}>
        <nav className="nav__inner" aria-label="Primary">
          <a
            className="brand"
            href="#top"
            aria-label="Wildfern, back to top"
            onClick={(e) => {
              e.preventDefault()
              toTop()
            }}
          >
            <FernMark />
            <span aria-hidden="true">WILDFERN</span>
          </a>
          <ul className="nav__links">
            {NAV_LINKS.map((l) => (
              <li key={l.id}>
                <button className="nav__link" aria-current={active === l.id ? 'true' : undefined} onClick={() => go(l.id)}>
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
          <button className="btn nav__cta" onClick={() => go('reservations')}>
            Book a table
          </button>
          <button
            className="nav__toggle"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X aria-hidden /> : <MenuIcon aria-hidden />}
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="menu-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            initial={{ clipPath: 'inset(0% 0% 100% 0%)' }}
            animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
            exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          >
            <ul>
              {NAV_LINKS.map((l, i) => (
                <li key={l.id}>
                  <motion.button
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.25 + i * 0.07, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => go(l.id)}
                  >
                    <small>0{i + 1}</small>
                    {l.label}
                  </motion.button>
                </li>
              ))}
            </ul>
            <motion.p className="menu-overlay__foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              14 Cedar Hollow Lane · Open daily 7:00 – 18:00
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
