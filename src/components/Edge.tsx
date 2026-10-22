/** Organic, hand-drawn-feeling top edge that lets each section grow out of the previous one. */
const SHAPES = [
  'M0,120 L0,70 C120,40 240,96 380,72 C520,48 600,10 760,26 C920,42 1000,92 1160,78 C1300,66 1380,30 1440,40 L1440,120 Z',
  'M0,120 L0,48 C160,82 300,30 470,42 C640,54 700,98 880,88 C1060,78 1160,24 1300,30 C1380,34 1420,52 1440,58 L1440,120 Z',
  'M0,120 L0,82 C140,60 260,20 420,30 C600,42 680,86 860,70 C1020,56 1120,14 1280,22 C1360,26 1410,44 1440,50 L1440,120 Z',
]

export function Edge({ variant = 0 }: { variant?: number }) {
  return (
    <svg className="edge edge--top" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
      <path d={SHAPES[variant % SHAPES.length]} />
    </svg>
  )
}
