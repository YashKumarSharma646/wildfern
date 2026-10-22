import { ArrowRight, CalendarCheck, Clock, Loader2, MapPin, Phone, QrCode, RotateCcw, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { BookingPass } from '../components/BookingPass'
import { Edge } from '../components/Edge'
import { RevealText } from '../components/RevealText'
import { useSectionMotion } from '../hooks/useSectionMotion'
import { api, ApiError, type Reservation, type Slot } from '../lib/api'

interface FormValues {
  name: string
  email: string
  date: string
  time: string
  party: string
}
type Errors = Partial<Record<keyof FormValues, string>>

const EMPTY: FormValues = { name: '', email: '', date: '', time: '', party: '2' }
const PARTY_SIZES = ['1', '2', '3', '4', '5', '6', '7', '8']
const BOOKING_WINDOW_DAYS = 90
const EASE = [0.22, 1, 0.36, 1] as const

/** Every half hour from 7:00; last seating 17:30 (we close at 18:00). */
const TIME_SLOTS = Array.from({ length: 22 }, (_, i) => {
  const mins = 7 * 60 + i * 30
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
})

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Client-side checks mirror the server's, so most mistakes never need a round-trip. */
function validate(v: FormValues, slots: Slot[] | null): Errors {
  const e: Errors = {}
  const name = v.name.trim()
  if (!name) e.name = 'Please tell us your name.'
  else if (name.length < 2) e.name = 'Your name needs at least two characters.'

  if (!v.email.trim()) e.email = 'We need an email to find your booking later.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'That email address doesn’t look quite right.'

  const today = toISODate(new Date())
  const last = new Date()
  last.setDate(last.getDate() + BOOKING_WINDOW_DAYS)
  if (!v.date) e.date = 'Choose a date for your visit.'
  else if (v.date < today) e.date = 'That date has already passed.'
  else if (v.date > toISODate(last)) e.date = `We take bookings up to ${BOOKING_WINDOW_DAYS} days ahead.`

  if (!v.time) e.time = 'Choose a time.'
  else {
    const slot = slots?.find((s) => s.time === v.time)
    if (slot && !slot.available) e.time = 'That time is fully booked — please choose another.'
    else if (slot && slot.seats_left < Number(v.party))
      e.time = `Only ${slot.seats_left} seat${slot.seats_left === 1 ? '' : 's'} left at ${v.time}.`
    else if (v.date === today) {
      const [h, m] = v.time.split(':').map(Number)
      const at = new Date()
      at.setHours(h, m, 0, 0)
      if (at.getTime() - Date.now() < 60 * 60 * 1000) e.time = 'For today, please pick a time at least an hour from now.'
    }
  }
  if (!PARTY_SIZES.includes(v.party)) e.party = 'Choose how many guests.'
  return e
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const SERVER_FIELD: Record<string, keyof FormValues> = { name: 'name', email: 'email', date: 'date', time: 'time', party_size: 'party' }

function Summary({ r }: { r: Reservation }) {
  return (
    <dl>
      <dt>Date</dt>
      <dd>{formatDate(r.date)}</dd>
      <dt>Time</dt>
      <dd>{r.time}</dd>
      <dt>Guests</dt>
      <dd>{r.party_size}</dd>
      <dt>Name</dt>
      <dd>{r.name}</dd>
    </dl>
  )
}

/* ------------------------------------------------------------------ */
/* Book a table                                                        */
/* ------------------------------------------------------------------ */

function BookingForm({ onManage }: { onManage: (code: string, email: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<FormValues>(EMPTY)
  const [honeypot, setHoneypot] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [summary, setSummary] = useState('')
  const [booking, setBooking] = useState<Reservation | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotsState, setSlotsState] = useState<'idle' | 'loading' | 'error'>('idle')

  const minDate = useMemo(() => toISODate(new Date()), [])
  const maxDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + BOOKING_WINDOW_DAYS)
    return toISODate(d)
  }, [])

  // Live availability for the chosen date.
  useEffect(() => {
    if (!values.date || values.date < minDate || values.date > maxDate) {
      setSlots(null)
      return
    }
    let stale = false
    setSlotsState('loading')
    api
      .availability(values.date)
      .then((a) => {
        if (stale) return
        setSlots(a.slots)
        setSlotsState('idle')
      })
      .catch(() => {
        if (stale) return
        // The server re-checks on submit anyway; just don't show per-slot hints.
        setSlots(null)
        setSlotsState('error')
      })
    return () => {
      stale = true
    }
  }, [values.date, minDate, maxDate, status])

  const set = (key: keyof FormValues, value: string) => {
    const next = { ...values, [key]: value }
    setValues(next)
    if (touched[key]) setErrors(validate(next, slots))
  }
  const blur = (key: keyof FormValues) => {
    setTouched((t) => ({ ...t, [key]: true }))
    setErrors(validate(values, slots))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(values, slots)
    setErrors(errs)
    setTouched({ name: true, email: true, date: true, time: true, party: true })
    const keys = Object.keys(errs) as (keyof FormValues)[]
    if (keys.length) {
      setSummary(`Please check ${keys.length === 1 ? 'one field' : `${keys.length} fields`} highlighted above.`)
      formRef.current?.querySelector<HTMLElement>(`[name="${keys[0]}"]`)?.focus()
      return
    }
    setSummary('')
    setStatus('submitting')
    try {
      const r = await api.reserve({
        name: values.name.trim(),
        email: values.email.trim(),
        date: values.date,
        time: values.time,
        party_size: Number(values.party),
        website: honeypot,
      })
      setBooking(r)
      setStatus('success')
    } catch (err) {
      setStatus('idle')
      if (err instanceof ApiError) {
        const fieldErrs: Errors = {}
        for (const [k, msg] of Object.entries(err.errors)) {
          const f = SERVER_FIELD[k]
          if (f) fieldErrs[f] = msg
        }
        setErrors(fieldErrs)
        setSummary(err.message)
        // Someone else may have taken the slot: refresh availability.
        if (err.status === 409 && values.date) api.availability(values.date).then((a) => setSlots(a.slots)).catch(() => {})
      } else {
        setSummary('Something went wrong — please try again.')
      }
    }
  }

  const reset = () => {
    setValues(EMPTY)
    setErrors({})
    setTouched({})
    setBooking(null)
    setStatus('idle')
  }

  const err = (k: keyof FormValues) => (touched[k] ? errors[k] : undefined)
  const fieldProps = (k: keyof FormValues) => ({
    id: `f-${k}`,
    name: k,
    value: values[k],
    'aria-invalid': err(k) ? true : undefined,
    'aria-describedby': `f-${k}-err`,
    onBlur: () => blur(k),
  })
  const slotFor = (t: string) => slots?.find((s) => s.time === t)

  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === 'success' && booking ? (
        <motion.div
          key="success"
          className="form__success"
          role="status"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <span className="eyebrow" style={{ color: 'var(--bark)' }}>
            Table reserved
          </span>
          <h3 className="display">See you soon, {booking.name.split(' ')[0]}.</h3>
          <BookingPass pass={booking} token={booking.pass_token} />
          <p className="form__note">
            Save or screenshot your pass — we’ll scan it at the door. To change plans, use “Manage booking” with your code and
            email ({booking.email}).
          </p>
          <div className="form__actions">
            <button type="button" className="btn btn--dark" onClick={reset}>
              Book another <RotateCcw aria-hidden />
            </button>
            <button type="button" className="btn btn--ghost-dark" onClick={() => onManage(booking.code, booking.email)}>
              Manage booking
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          ref={formRef}
          noValidate
          onSubmit={onSubmit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          aria-label="Book a table"
        >
          <div className="form__grid">
            <div className="field field--full">
              <label htmlFor="f-name">Full name</label>
              <input {...fieldProps('name')} type="text" autoComplete="name" onChange={(e) => set('name', e.target.value)} />
              <span className="field__error" id="f-name-err" aria-live="polite">
                {err('name')}
              </span>
            </div>
            <div className="field field--full">
              <label htmlFor="f-email">Email</label>
              <input {...fieldProps('email')} type="email" inputMode="email" autoComplete="email" onChange={(e) => set('email', e.target.value)} />
              <span className="field__error" id="f-email-err" aria-live="polite">
                {err('email')}
              </span>
            </div>
            <div className="field">
              <label htmlFor="f-date">Date</label>
              <input {...fieldProps('date')} type="date" min={minDate} max={maxDate} onChange={(e) => set('date', e.target.value)} />
              <span className="field__error" id="f-date-err" aria-live="polite">
                {err('date')}
              </span>
            </div>
            <div className="field">
              <label htmlFor="f-time">
                Time {slotsState === 'loading' && <Loader2 aria-label="Checking availability" className="spin field__spinner" />}
              </label>
              <select {...fieldProps('time')} onChange={(e) => set('time', e.target.value)}>
                <option value="">{values.date ? 'Select a time' : 'Pick a date first'}</option>
                {TIME_SLOTS.map((t) => {
                  const s = slotFor(t)
                  const full = s ? !s.available : false
                  const few = s && s.available && s.seats_left <= 6
                  return (
                    <option key={t} value={t} disabled={full}>
                      {t}
                      {full ? ' — unavailable' : few ? ` — only ${s.seats_left} left` : ''}
                    </option>
                  )
                })}
              </select>
              <span className="field__error" id="f-time-err" aria-live="polite">
                {err('time')}
              </span>
            </div>
            <fieldset className="field field--full" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby="f-party-err">
              <legend style={{ padding: 0, marginBottom: '0.6rem' }} className="party__legend">
                Party size
              </legend>
              <div className="party">
                {PARTY_SIZES.map((n) => (
                  <label key={n} className="party__opt">
                    <input type="radio" name="party" value={n} checked={values.party === n} onChange={(e) => set('party', e.target.value)} />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
              <span className="field__error" id="f-party-err" aria-live="polite">
                {err('party') ?? (values.party === '8' ? 'For groups larger than eight, please call us.' : '')}
              </span>
            </fieldset>
            {/* Honeypot for bots — hidden from people and assistive tech. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="f-website">Website</label>
              <input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="btn btn--dark form__submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? (
              <>
                Reserving your table <Loader2 aria-hidden className="spin" />
              </>
            ) : (
              <>
                Reserve table <ArrowRight aria-hidden />
              </>
            )}
          </button>
          <p className="form__status form__status--error" role="alert">
            {summary}
          </p>
        </motion.form>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Manage an existing booking                                          */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<Reservation['status'], string> = {
  confirmed: 'Confirmed',
  seated: 'Checked in',
  no_show: 'Missed',
  cancelled: 'Cancelled',
}

function ManageBooking({ initial }: { initial: { code: string; email: string } | null }) {
  const [showPass, setShowPass] = useState(Boolean(initial))
  const [code, setCode] = useState(initial?.code ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [found, setFound] = useState<Reservation | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'cancelling' | 'confirm'>('idle')
  const [message, setMessage] = useState('')

  const lookup = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!code.trim() || !email.trim()) {
      setMessage('Enter both your booking code and the email you booked with.')
      return
    }
    setState('loading')
    setMessage('')
    try {
      setFound(await api.lookup(code, email))
    } catch (err) {
      setFound(null)
      setMessage(err instanceof ApiError ? err.message : 'Something went wrong — please try again.')
    } finally {
      setState('idle')
    }
  }

  // Arriving from a fresh booking: show it straight away.
  useEffect(() => {
    if (initial) void lookup()
  }, [initial])

  const cancel = async () => {
    if (!found) return
    setState('cancelling')
    setMessage('')
    try {
      setFound(await api.cancel(found.code, email))
      setMessage('Your booking has been cancelled. We hope to see you another time.')
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Something went wrong — please try again.')
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="manage">
      <form onSubmit={lookup} noValidate aria-label="Find your booking" className="form__grid">
        <div className="field">
          <label htmlFor="m-code">Booking code</label>
          <input
            id="m-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WF-XXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="m-email">Email</label>
          <input id="m-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="btn btn--dark field--full" disabled={state === 'loading'}>
          {state === 'loading' ? <Loader2 aria-hidden className="spin" /> : <Search aria-hidden />} Find booking
        </button>
      </form>

      <p className="form__status" role="status" aria-live="polite">
        {message}
      </p>

      <AnimatePresence initial={false}>
        {found && (
          <motion.div
            key={found.code + found.status}
            className="manage__result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="manage__head">
              <strong>{found.code}</strong>
              <span className={`badge badge--${found.status}`}>{STATUS_LABEL[found.status]}</span>
            </div>
            {showPass ? <BookingPass pass={found} token={found.pass_token} compact /> : <Summary r={found} />}
            {found.status !== 'cancelled' && (
              <button type="button" className="btn btn--ghost-dark manage__pass-toggle" onClick={() => setShowPass((v) => !v)}>
                <QrCode aria-hidden /> {showPass ? 'Hide pass' : 'Show my pass'}
              </button>
            )}
            {found.status === 'confirmed' &&
              (state === 'confirm' ? (
                <div className="form__actions">
                  <button type="button" className="btn btn--danger" onClick={cancel}>
                    Yes, cancel it <X aria-hidden />
                  </button>
                  <button type="button" className="btn btn--ghost-dark" onClick={() => setState('idle')}>
                    Keep my table
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost-dark"
                  disabled={state === 'cancelling'}
                  onClick={() => setState('confirm')}
                >
                  {state === 'cancelling' ? <Loader2 aria-hidden className="spin" /> : null} Cancel this booking
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function Reservations() {
  const root = useRef<HTMLElement>(null)
  useSectionMotion(root)
  const [tab, setTab] = useState<'book' | 'manage'>('book')
  const [handoff, setHandoff] = useState<{ code: string; email: string } | null>(null)

  return (
    <section id="reservations" ref={root} className="reserve" aria-labelledby="reserve-title">
      <Edge variant={1} />
      <div className="reserve__bg" aria-hidden="true">
        <img src="/images/darkforest.webp" alt="" loading="lazy" decoding="async" />
      </div>
      <div className="container reserve__grid">
        <div className="reserve__intro">
          <span className="eyebrow" data-reveal>
            05 — Reservations
          </span>
          <RevealText id="reserve-title" className="display" text="Reserve your corner of the *forest.*" />
          <p data-reveal>
            Walk-ins are always welcome at the bar. For the Glasshouse or the terrace, book ahead — especially for weekend
            mornings, when the light is at its best.
          </p>
          <ul className="reserve__info" data-reveal="0.1">
            <li>
              <MapPin aria-hidden />
              <span>
                14 Cedar Hollow Lane
                <small>Park at the trailhead · a six-minute walk in</small>
              </span>
            </li>
            <li>
              <Clock aria-hidden />
              <span>
                Daily, 7:00 – 18:00
                <small>Last seating 17:30 · tables are held for 90 minutes</small>
              </span>
            </li>
            <li>
              <Phone aria-hidden />
              <span>
                (555) 014-0721
                <small>For groups larger than eight</small>
              </span>
            </li>
          </ul>
        </div>

        <div className="form" data-reveal="0.15">
          <div className="form__tabs" role="tablist" aria-label="Reservations">
            <button role="tab" id="tab-book" aria-selected={tab === 'book'} aria-controls="panel-book" onClick={() => setTab('book')}>
              <CalendarCheck aria-hidden /> Book a table
            </button>
            <button role="tab" id="tab-manage" aria-selected={tab === 'manage'} aria-controls="panel-manage" onClick={() => setTab('manage')}>
              <Search aria-hidden /> Manage booking
            </button>
          </div>
          <div role="tabpanel" id="panel-book" aria-labelledby="tab-book" hidden={tab !== 'book'}>
            <BookingForm
              onManage={(code, email) => {
                setHandoff({ code, email })
                setTab('manage')
              }}
            />
          </div>
          <div role="tabpanel" id="panel-manage" aria-labelledby="tab-manage" hidden={tab !== 'manage'}>
            <ManageBooking key={handoff?.code ?? 'blank'} initial={handoff} />
          </div>
        </div>
      </div>
    </section>
  )
}
