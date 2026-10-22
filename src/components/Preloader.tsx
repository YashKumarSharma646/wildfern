import { AnimatePresence, motion } from 'motion/react'

const LETTERS = 'WILDFERN'.split('')

export function Preloader({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="preloader"
          role="status"
          aria-label="Loading Wildfern"
          initial={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="preloader__mark">
            <div className="preloader__word" aria-hidden="true">
              {LETTERS.map((l, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                >
                  {l}
                </motion.span>
              ))}
            </div>
            <div className="preloader__line">
              <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 2.2, ease: [0.65, 0, 0.35, 1] }} />
            </div>
            <span className="preloader__note">Entering the forest</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
