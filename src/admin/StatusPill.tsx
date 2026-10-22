import { CircleCheck, CircleDashed, CircleSlash, CircleX } from 'lucide-react'
import type { Status } from './adminApi'

/* Status always ships as icon + label, never colour alone. */
const STATUS = {
  confirmed: { label: 'Booked', Icon: CircleDashed },
  seated: { label: 'Checked in', Icon: CircleCheck },
  no_show: { label: 'No-show', Icon: CircleSlash },
  cancelled: { label: 'Cancelled', Icon: CircleX },
} as const

export function StatusPill({ status }: { status: Status }) {
  const { label, Icon } = STATUS[status]
  return (
    <span className={`pill pill--${status}`}>
      <Icon aria-hidden /> {label}
    </span>
  )
}
