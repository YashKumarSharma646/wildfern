import { Download, Loader2, Mail, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AdminError, adminApi, type Summary } from './adminApi'
import { Tile } from './BookingsTab'
import { WeekChart } from './charts'

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

export function SubscribersTab() {
  const [list, setList] = useState<{ email: string; created_at: string }[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .subscribers()
      .then(setList)
      .catch((e) => e instanceof AdminError && e.status !== 401 && setError(e.message))
  }, [])

  const shown = useMemo(() => (list ?? []).filter((s) => s.email.includes(q.trim().toLowerCase())), [list, q])
  const thisMonth = useMemo(() => {
    const since = Date.now() - 30 * 864e5
    return (list ?? []).filter((s) => new Date(s.created_at).getTime() > since).length
  }, [list])

  return (
    <section aria-labelledby="subs-title">
      <div className="toolbar">
        <h2 id="subs-title" className="a-title a-title--inline">
          Newsletter subscribers
        </h2>
        <label className="search">
          <Search aria-hidden />
          <span className="sr-only">Search subscribers</span>
          <input type="search" placeholder="Search emails" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="toolbar__actions">
          <button
            type="button"
            className="a-btn"
            disabled={!list?.length}
            onClick={() => void adminApi.download('/api/admin/subscribers.csv', 'wildfern-newsletter.csv').catch((e) => setError(e.message))}
          >
            <Download aria-hidden /> Download CSV
          </button>
        </div>
      </div>
      {error && (
        <p className="a-alert" role="alert">
          {error}
        </p>
      )}
      <div className="tiles tiles--two">
        <Tile label="Subscribers" value={list?.length ?? '—'} />
        <Tile label="Joined in the last 30 days" value={list ? thisMonth : '—'} />
      </div>
      <p className="a-lead">The CSV opens in Excel or Google Sheets, and imports straight into Mailchimp, Brevo or Gmail contacts.</p>
      {!list ? (
        <p className="a-empty">
          <Loader2 aria-hidden className="spin" /> Loading…
        </p>
      ) : !shown.length ? (
        <p className="a-empty">{list.length ? 'No matches.' : 'No subscribers yet — they’ll appear here as people sign up in the footer.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="bookings subs">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.email}>
                  <td data-label="Email">
                    <a href={`mailto:${s.email}`}>
                      <Mail aria-hidden className="inline-icon" /> {s.email}
                    </a>
                  </td>
                  <td data-label="Joined">
                    {new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function InsightsTab({ today }: { today: string }) {
  const [s, setS] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .summary(today)
      .then(setS)
      .catch((e) => e instanceof AdminError && e.status !== 401 && setError(e.message))
  }, [today])

  if (error)
    return (
      <p className="a-alert" role="alert">
        {error}
      </p>
    )
  if (!s)
    return (
      <p className="a-empty">
        <Loader2 aria-hidden className="spin" /> Loading…
      </p>
    )
  const m = s.last_30_days
  const weekGuests = s.week.reduce((a, d) => a + d.covers, 0)
  return (
    <section aria-labelledby="insights-title">
      <h2 id="insights-title" className="a-title">
        Insights
      </h2>
      <div className="hero-figure">
        <span className="tile__label">Guests booked for the next 7 days</span>
        <strong>{weekGuests}</strong>
      </div>
      <WeekChart week={s.week} today={s.today} />
      <h3 className="a-subtitle">Last 30 days</h3>
      <div className="tiles">
        <Tile label="Bookings" value={m.bookings} note={`${m.covers} guests`} />
        <Tile label="Average party" value={m.avg_party ?? '—'} note="guests per booking" />
        <Tile label="No-show rate" value={pct(m.no_show_rate)} note="of visits that were due" />
        <Tile label="Cancellations" value={pct(m.cancel_rate)} note={`${pct(m.online_share)} booked online`} />
      </div>
      {!s.email_enabled && (
        <p className="a-lead a-hint">
          Tip: email alerts for new bookings are ready to switch on — add a free Resend key in Vercel (see the README).
        </p>
      )}
    </section>
  )
}
