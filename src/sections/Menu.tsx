import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Edge } from '../components/Edge'
import { RevealText } from '../components/RevealText'
import { MENU, type MenuItem } from '../content'
import { api } from '../lib/api'
import { useSectionMotion } from '../hooks/useSectionMotion'

const EASE = [0.22, 1, 0.36, 1] as const

export function Menu() {
  const root = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState(0)
  // Served by the API; the bundled copy renders instantly and covers any outage.
  const [menu, setMenu] = useState<MenuItem[]>(MENU)
  useSectionMotion(root)
  useEffect(() => {
    api
      .menu()
      .then((items) => Array.isArray(items) && items.length && setMenu(items))
      .catch(() => {})
  }, [])
  const item = menu[Math.min(selected, menu.length - 1)]

  // Preview on hover/focus for fine pointers; tapping always selects.
  const preview = (i: number) => {
    if (window.matchMedia('(hover: hover)').matches) setSelected(i)
  }

  return (
    <section id="menu" ref={root} className="menu on-light" aria-labelledby="menu-title">
      <Edge variant={2} />
      <div className="container">
        <div className="menu__head">
          <div>
            <span className="eyebrow" data-reveal>
              03 — Signature Creations
            </span>
            <RevealText id="menu-title" className="display" text="Three cups, poured from the *forest.*" />
          </div>
          <p data-reveal="0.1">
            Seasonal drinks built around what grows nearby. Every cup is made to order, the way it should be.
          </p>
        </div>

        <div className="menu__body">
          <div className="menu__stage" data-reveal aria-hidden="true">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.img
                key={item.id}
                src={item.image}
                alt=""
                initial={{ opacity: 0, scale: 1.12, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.9, ease: EASE }}
                loading="lazy"
                decoding="async"
              />
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={item.id}
                className="menu__price-tag"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                {item.name} · {item.price}
              </motion.span>
            </AnimatePresence>
          </div>

          <div>
            <ul className="menu__list">
              {menu.map((m, i) => {
                const open = i === selected
                return (
                  <li className="menu__item" key={m.id} data-reveal={i * 0.08}>
                    <h3 style={{ margin: 0 }}>
                      <button
                        className="menu__btn"
                        aria-expanded={open}
                        aria-controls={`${m.id}-detail`}
                        id={`${m.id}-btn`}
                        onClick={() => setSelected(i)}
                        onMouseEnter={() => preview(i)}
                        onFocus={() => setSelected(i)}
                      >
                        <span className="menu__index">0{i + 1}</span>
                        <span className="menu__name">{m.name}</span>
                        <span className="menu__price">{m.price}</span>
                      </button>
                    </h3>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          id={`${m.id}-detail`}
                          role="region"
                          aria-labelledby={`${m.id}-btn`}
                          className="menu__detail"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.6, ease: EASE }}
                        >
                          <div className="menu__detail-inner">
                            <div>
                              <p>{m.description}</p>
                              <ul className="notes" aria-label="Tasting notes">
                                {m.notes.map((n) => (
                                  <li key={n}>{n}</li>
                                ))}
                              </ul>
                              <p style={{ marginTop: '0.9rem', fontSize: '0.82rem' }}>{m.serve}</p>
                            </div>
                            <img className="menu__thumb" src={m.image} alt={m.alt} loading="lazy" decoding="async" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              })}
            </ul>
            <p className="menu__footnote" data-reveal>
              Fictional menu concepts — prices shown are placeholders. The full menu also includes filter coffee, loose-leaf teas and
              pastries baked each morning.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
