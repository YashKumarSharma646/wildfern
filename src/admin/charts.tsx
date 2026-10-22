import { useState } from 'react'
import { prettyDate, type SlotUse, type Summary } from './adminApi'

/*
 * Two small single-series column charts. Per the dataviz spec: one validated hue
 * (#4a7a2c on the ivory surface), bars ≤24px with a 4px rounded data-end and a square
 * baseline, hairline recessive grid, no legend (the title names the series), selective
 * direct labels, a hover/focus tooltip on every bar, and a table for screen readers.
 */

interface Tip {
  x: number
  title: string
  lines: string[]
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div className="chart__tip" style={{ left: `${tip.x}%` }} role="status">
      <strong>{tip.title}</strong>
      {tip.lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  )
}

/** Seats in use at each half-hour slot of one day, against bookable capacity. */
export function SlotChart({ slots, capacity, nowTime }: { slots: SlotUse[]; capacity: number; nowTime?: string }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const ticks = [0, capacity / 2, capacity]
  const nowIndex = nowTime ? slots.findIndex((s, i) => s.time <= nowTime && (slots[i + 1]?.time ?? '99') > nowTime) : -1

  const show = (i: number) => {
    const s = slots[i]
    setTip({
      x: ((i + 0.5) / slots.length) * 100,
      title: s.time,
      lines: [
        `${s.seats_used} of ${capacity} seats in use`,
        `${s.arrivals} ${s.arrivals === 1 ? 'party arrives' : 'parties arrive'}`,
      ],
    })
  }

  return (
    <figure className="chart" aria-labelledby="slot-chart-title">
      <figcaption className="chart__head">
        <h3 id="slot-chart-title">Seats in use through the day</h3>
        <span>Each booking holds its seats for 90 minutes · {capacity} bookable seats</span>
      </figcaption>
      <div className="chart__plot chart__plot--slots" onMouseLeave={() => setTip(null)}>
        <div className="chart__grid" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className={`chart__gridline ${t === capacity ? 'is-cap' : ''}`} style={{ bottom: `${(t / capacity) * 100}%` }}>
              <span>{t === capacity ? `${t} max` : t}</span>
            </div>
          ))}
        </div>
        <div className="chart__bars">
          {slots.map((s, i) => {
            const pct = Math.min(100, (s.seats_used / capacity) * 100)
            const full = s.seats_used >= capacity
            return (
              <button
                type="button"
                key={s.time}
                className={`chart__col ${i === nowIndex ? 'is-now' : ''}`}
                onMouseEnter={() => show(i)}
                onFocus={() => show(i)}
                onBlur={() => setTip(null)}
                aria-label={`${s.time}: ${s.seats_used} of ${capacity} seats in use${full ? ', full' : ''}`}
              >
                {full && <span className="chart__flag">Full</span>}
                <span className="chart__bar" style={{ height: `${pct}%` }} />
              </button>
            )
          })}
        </div>
        <Tooltip tip={tip} />
      </div>
      <div className="chart__axis" aria-hidden="true">
        {slots.map((s) => (
          <span key={s.time}>{s.time.endsWith(':00') && Number(s.time.slice(0, 2)) % 2 === 1 ? s.time : ''}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Seats in use by time slot</caption>
        <thead>
          <tr>
            <th>Time</th>
            <th>Seats in use</th>
            <th>Arrivals</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.time}>
              <td>{s.time}</td>
              <td>{s.seats_used}</td>
              <td>{s.arrivals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const niceMax = (v: number) => {
  if (v <= 4) return 4
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  for (const s of steps) if (v <= s * 4) return Math.ceil(v / s) * s
  return Math.ceil(v / 1000) * 1000
}

/** Guests (covers) booked for each of the next seven days. */
export function WeekChart({ week, today }: { week: Summary['week']; today: string }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const max = niceMax(Math.max(1, ...week.map((d) => d.covers)))
  const peak = week.reduce((a, b) => (b.covers > a.covers ? b : a), week[0])

  return (
    <figure className="chart" aria-labelledby="week-chart-title">
      <figcaption className="chart__head">
        <h3 id="week-chart-title">Guests booked, next 7 days</h3>
        <span>Confirmed and seated bookings · from {prettyDate(week[0].date, { day: 'numeric', month: 'short' })}</span>
      </figcaption>
      <div className="chart__plot chart__plot--week" onMouseLeave={() => setTip(null)}>
        <div className="chart__grid" aria-hidden="true">
          {[0, max / 2, max].map((t) => (
            <div key={t} className="chart__gridline" style={{ bottom: `${(t / max) * 100}%` }}>
              <span>{t}</span>
            </div>
          ))}
        </div>
        <div className="chart__bars chart__bars--week">
          {week.map((d, i) => {
            const label = prettyDate(d.date, { weekday: 'short', day: 'numeric' })
            const show = () =>
              setTip({
                x: ((i + 0.5) / week.length) * 100,
                title: prettyDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' }),
                lines: [`${d.covers} guests`, `${d.bookings} booking${d.bookings === 1 ? '' : 's'}`],
              })
            return (
              <button
                type="button"
                key={d.date}
                className="chart__col"
                onMouseEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
                aria-label={`${label}: ${d.covers} guests, ${d.bookings} bookings`}
              >
                {d === peak && d.covers > 0 && <span className="chart__value">{d.covers}</span>}
                <span className="chart__bar" style={{ height: `${(d.covers / max) * 100}%` }} />
              </button>
            )
          })}
        </div>
        <Tooltip tip={tip} />
      </div>
      <div className="chart__axis chart__axis--week" aria-hidden="true">
        {week.map((d) => (
          <span key={d.date} className={d.date === today ? 'is-today' : ''}>
            {d.date === today ? 'Today' : prettyDate(d.date, { weekday: 'short', day: 'numeric' })}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Guests booked per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Guests</th>
            <th>Bookings</th>
          </tr>
        </thead>
        <tbody>
          {week.map((d) => (
            <tr key={d.date}>
              <td>{prettyDate(d.date)}</td>
              <td>{d.covers}</td>
              <td>{d.bookings}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
