import { createElement, Fragment, type ElementType } from 'react'

interface Props {
  /** Text to reveal. Wrap words in *asterisks* to italicise them. */
  text: string
  as?: ElementType
  className?: string
  id?: string
}

/**
 * Splits a heading into masked words. Animation is applied by the parent section's
 * GSAP context (it targets `.rw__i`) so reveals stay in sync with the scroll.
 * The heading keeps its full text for assistive technology via aria-label.
 */
export function RevealText({ text, as = 'h2', className, id }: Props) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean)
  const plain = text.replace(/\*/g, '')
  return createElement(
    as,
    { className, id, 'aria-label': plain, 'data-reveal-text': '' },
    parts.map((part, pi) => {
      const italic = part.startsWith('*')
      const words = part.replace(/\*/g, '').split(/(\s+)/)
      const content = words.map((w, wi) =>
        /^\s+$/.test(w) ? (
          <Fragment key={wi}> </Fragment>
        ) : w ? (
          <span className="rw" key={wi} aria-hidden="true">
            <span className="rw__i">{w}</span>
          </span>
        ) : null,
      )
      return italic ? <em key={pi}>{content}</em> : <Fragment key={pi}>{content}</Fragment>
    }),
  )
}
