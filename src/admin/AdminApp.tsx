import { BarChart3, CalendarCheck, ExternalLink, Loader2, LogOut, Mail, ScanLine } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { FernMark } from '../components/FernMark'
import './admin.css'
import { AdminError, adminApi, isoDate, session, SIGNED_OUT } from './adminApi'
import { BookingsTab } from './BookingsTab'
import { CheckinTab } from './CheckinTab'
import { InsightsTab, SubscribersTab } from './OtherTabs'

type Tab = 'bookings' | 'checkin' | 'subscribers' | 'insights'
const TABS: { id: Tab; label: string; Icon: typeof CalendarCheck }[] = [
  { id: 'bookings', label: 'Bookings', Icon: CalendarCheck },
  { id: 'checkin', label: 'Check-in', Icon: ScanLine },
  { id: 'subscribers', label: 'Subscribers', Icon: Mail },
  { id: 'insights', label: 'Insights', Icon: BarChart3 },
]

/** /admin — the café owner's private dashboard. */
export default function AdminApp() {
  const [signedIn, setSignedIn] = useState(Boolean(session.get()))

  useEffect(() => {
    document.title = 'Owner dashboard — Wildfern'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    const out = () => setSignedIn(false)
    window.addEventListener(SIGNED_OUT, out)
    return () => window.removeEventListener(SIGNED_OUT, out)
  }, [])

  return <div className="admin">{signedIn ? <Dashboard onSignOut={() => setSignedIn(false)} /> : <Login onDone={() => setSignedIn(true)} />}</div>
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminApi.login(password)
      onDone()
    } catch (err) {
      setError(err instanceof AdminError ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit}>
        <span className="brandmark">
          <FernMark /> WILDFERN
        </span>
        <h1>Owner dashboard</h1>
        <p>Bookings, door check-in and your newsletter list — for the café team only.</p>
        <label className="a-field a-field--full">
          <span>Owner password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby="login-error"
          />
        </label>
        <p id="login-error" className="a-alert" role="alert" hidden={!error}>
          {error}
        </p>
        <button type="submit" className="a-btn a-btn--big" disabled={busy || !password}>
          {busy && <Loader2 aria-hidden className="spin" />} Sign in
        </button>
        <a className="login__back" href="/">
          ← Back to the website
        </a>
      </form>
    </main>
  )
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>(() => (window.location.hash.slice(1) as Tab) || 'bookings')
  const today = isoDate(new Date())

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`)
  }, [tab])

  const signOut = () => {
    session.clear()
    onSignOut()
  }

  return (
    <>
      <header className="a-header">
        <div className="a-header__inner">
          <span className="brandmark">
            <FernMark /> WILDFERN <em>Owner</em>
          </span>
          <nav className="a-tabs" aria-label="Dashboard sections">
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-label={label} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
                <Icon aria-hidden /> <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="a-header__end">
            <a className="text-btn" href="/" target="_blank" rel="noreferrer" aria-label="View site (opens in a new tab)">
              <ExternalLink aria-hidden /> <span>View site</span>
            </a>
            <button type="button" className="text-btn" onClick={signOut} aria-label="Sign out">
              <LogOut aria-hidden /> <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="a-main">
        {tab === 'bookings' && <BookingsTab today={today} />}
        {tab === 'checkin' && <CheckinTab />}
        {tab === 'subscribers' && <SubscribersTab />}
        {tab === 'insights' && <InsightsTab today={today} />}
      </main>
    </>
  )
}
