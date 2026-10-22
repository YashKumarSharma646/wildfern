import { CalendarDays, ChevronLeft, ChevronRight, Download, Loader2, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AdminError, addDays, adminApi, prettyDate, SLOT_TIMES, type Booking, type Status, type Summary } from './adminApi'
import { SlotChart } from './charts'
import { StatusPill } from './StatusPill'

const REFRESH_MS = 45_000

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The slot a walk-in arriving now belongs to (rounded down to the half hour). */
function currentSlot() {
  const t = nowHHMM()
  return [...SLOT_TIMES].reverse().find((s) => s <= t) ?? SLOT_TIMES[0]
}

export function BookingsTab({ today }: { today: string }) {
  const [date, setDate] = useState(today)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Booking[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState<null | 'phone' | 'walk-in'>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([adminApi.summary(date), adminApi.bookings(search ? { q: search } : { date })])
      setSummary(s)
      setRows(b)
      setError('')
    } catch (e) {
      if (e instanceof AdminError && e.status !== 401) setError(e.message)
    }
  }, [date, search])

  useEffect(() => {
    void load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  // Debounced search across every date.
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(query.trim()), 300)
    return () => window.clearTimeout(id)
  }, [query])

  const act = async (b: Booking, status: Status) => {
    setBusy(b.code)
    try {
      await adminApi.setStatus(b.code, status)
      setNotice(`${b.name} · ${LABEL_DONE[status]}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the booking.')
    } finally {
      setBusy(null)
    }
  }

  const exportCsv = () => {
    const from = search ? undefined : date
    const path = from ? `/api/admin/reservations.csv?from=${date}&to=${addDays(date, 30)}` : '/api/admin/reservations.csv'
    void adminApi.download(path, `wildfern-bookings-${date}.csv`).catch((e) => setError(e.message))
  }

  const day = summary?.day
  const isToday = date === today

  return (
    <section aria-labelledby="bookings-title">
      <div className="toolbar">
        <div className="daypicker" role="group" aria-label="Choose a day">
          <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft aria-hidden />
          </button>
          <label className="daypicker__date">
            <CalendarDays aria-hidden />
            <span className="sr-only">Date</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            <ChevronRight aria-hidden />
          </button>
          {!isToday && (
            <button type="button" className="text-btn" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>
        <label className="search">
          <Search aria-hidden />
          <span className="sr-only">Search all bookings</span>
          <input type="search" placeholder="Search name, email, phone or code" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="toolbar__actions">
          <button type="button" className="a-btn a-btn--ghost" onClick={exportCsv}>
            <Download aria-hidden /> Export CSV
          </button>
          <button type="button" className="a-btn a-btn--ghost" onClick={() => setCreating('walk-in')}>
            <Plus aria-hidden /> Walk-in
          </button>
          <button type="button" className="a-btn" onClick={() => setCreating('phone')}>
            <Plus aria-hidden /> New booking
          </button>
        </div>
      </div>

      <h2 id="bookings-title" className="a-title">
        {search ? `Search results for “${search}”` : isToday ? `Today · ${prettyDate(date)}` : prettyDate(date)}
      </h2>
      {error && (
        <p className="a-alert" role="alert">
          {error}
        </p>
      )}
      <p className="a-notice" role="status" aria-live="polite">
        {notice}
      </p>

      {!search && day && (
        <>
          <div className="tiles">
            <Tile label="Bookings" value={day.bookings} />
            <Tile label="Guests expected" value={day.covers} />
            <Tile label="Checked in" value={day.by_status.seated} />
            <Tile label="Busiest time" value={day.busiest ? day.busiest.time : '—'} note={day.busiest ? `${day.busiest.seats_used} of ${day.capacity} seats` : 'No bookings yet'} />
          </div>
          <SlotChart slots={day.slots} capacity={day.capacity} nowTime={isToday ? nowHHMM() : undefined} />
        </>
      )}

      <BookingTable rows={rows} busy={busy} onAct={act} showDate={Boolean(search)} />

      {creating && (
        <NewBookingDialog
          mode={creating}
          defaultDate={creating === 'walk-in' ? today : date}
          onClose={() => setCreating(null)}
          onCreated={(b) => {
            setCreating(null)
            setNotice(b.source === 'walk-in' ? `${b.name} · walk-in seated` : `${b.name} · booked for ${prettyDate(b.date, { day: 'numeric', month: 'short' })} at ${b.time}`)
            if (!search) setDate(b.date)
            void load()
          }}
        />
      )}
    </section>
  )
}

const LABEL_DONE: Record<Status, string> = {
  seated: 'checked in',
  no_show: 'marked as no-show',
  cancelled: 'cancelled',
  confirmed: 'restored',
}

export function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <strong className="tile__value">{value}</strong>
      {note && <span className="tile__note">{note}</span>}
    </div>
  )
}

function BookingTable({
  rows,
  busy,
  onAct,
  showDate,
}: {
  rows: Booking[] | null
  busy: string | null
  onAct: (b: Booking, s: Status) => void
  showDate: boolean
}) {
  if (!rows)
    return (
      <p className="a-empty">
        <Loader2 aria-hidden className="spin" /> Loading bookings…
      </p>
    )
  if (!rows.length) return <p className="a-empty">No bookings here yet.</p>
  return (
    <div className="table-wrap">
      <table className="bookings">
        <thead>
          <tr>
            {showDate && <th scope="col">Date</th>}
            <th scope="col">Time</th>
            <th scope="col">Guest</th>
            <th scope="col">Party</th>
            <th scope="col">Status</th>
            <th scope="col">Contact</th>
            <th scope="col">Code</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.code} className={b.status === 'cancelled' ? 'is-cancelled' : ''}>
              {showDate && <td data-label="Date">{prettyDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>}
              <td data-label="Time" className="num">
                {b.time}
              </td>
              <td data-label="Guest">
                <strong>{b.name}</strong>
                <span className="sub">
                  {b.source === 'online' ? 'Online' : b.source === 'phone' ? 'Phone' : 'Walk-in'}
                  {b.notes ? ` · ${b.notes}` : ''}
                </span>
              </td>
              <td data-label="Party" className="num">
                {b.party_size}
              </td>
              <td data-label="Status">
                <StatusPill status={b.status} />
              </td>
              <td data-label="Contact" className="contact">
                {b.email && <a href={`mailto:${b.email}`}>{b.email}</a>}
                {b.phone && <a href={`tel:${b.phone}`}>{b.phone}</a>}
                {!b.email && !b.phone && <span className="sub">—</span>}
              </td>
              <td data-label="Code" className="code">
                {b.code}
              </td>
              <td className="row-actions">
                {busy === b.code ? (
                  <Loader2 aria-label="Updating" className="spin" />
                ) : b.status === 'confirmed' ? (
                  <>
                    <button type="button" className="mini mini--go" onClick={() => onAct(b, 'seated')}>
                      Seat
                    </button>
                    <button type="button" className="mini" onClick={() => onAct(b, 'no_show')}>
                      No-show
                    </button>
                    <button type="button" className="mini mini--danger" onClick={() => window.confirm(`Cancel ${b.name}’s booking?`) && onAct(b, 'cancelled')}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="mini" onClick={() => onAct(b, 'confirmed')}>
                    {b.status === 'seated' ? 'Undo check-in' : 'Restore'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NewBookingDialog({
  mode,
  defaultDate,
  onClose,
  onCreated,
}: {
  mode: 'phone' | 'walk-in'
  defaultDate: string
  onClose: () => void
  onCreated: (b: Booking) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const walkIn = mode === 'walk-in'
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    date: defaultDate,
    time: walkIn ? currentSlot() : '',
    party: '2',
    notes: '',
  })
  const [slots, setSlots] = useState<Record<string, number> | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    let stale = false
    adminApi
      .availability(form.date)
      .then((a) => !stale && setSlots(Object.fromEntries(a.slots.map((s) => [s.time, s.seats_left]))))
      .catch(() => !stale && setSlots(null))
    return () => {
      stale = true
    }
  }, [form.date])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const seatsLeft = useMemo(() => (slots && form.time ? slots[form.time] : undefined), [slots, form.time])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter the guest’s name.'
    if (!form.time) errs.time = 'Choose a time.'
    if (Object.keys(errs).length) return setErrors(errs)
    setSaving(true)
    try {
      const b = await adminApi.create({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        date: form.date,
        time: form.time,
        party_size: Number(form.party),
        source: mode,
        notes: form.notes.trim() || undefined,
      })
      dialog.current?.close()
      onCreated(b)
    } catch (err) {
      if (err instanceof AdminError) setErrors({ ...err.errors, form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} className="a-dialog" onClose={onClose} aria-labelledby="new-booking-title">
      <form onSubmit={submit} noValidate>
        <div className="a-dialog__head">
          <h2 id="new-booking-title">{walkIn ? 'Seat a walk-in' : 'New phone booking'}</h2>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
            <X aria-hidden />
          </button>
        </div>
        <p className="a-dialog__lead">
          {walkIn
            ? 'For guests who arrived without a booking. They’re checked in straight away and take seats from the same capacity.'
            : 'Taken over the phone or in person. Uses the same seats as online bookings, so nothing can be double-booked.'}
        </p>
        <div className="a-form">
          <label className="a-field a-field--full">
            <span>Guest name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus aria-invalid={errors.name ? true : undefined} />
            {errors.name && <em>{errors.name}</em>}
          </label>
          <label className="a-field">
            <span>Phone {walkIn && '(optional)'}</span>
            <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className="a-field">
            <span>Email (optional)</span>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={errors.email ? true : undefined} />
            {errors.email && <em>{errors.email}</em>}
          </label>
          {!walkIn && (
            <label className="a-field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
              {errors.date && <em>{errors.date}</em>}
            </label>
          )}
          <label className="a-field">
            <span>Time</span>
            <select value={form.time} onChange={(e) => set('time', e.target.value)} aria-invalid={errors.time ? true : undefined}>
              <option value="">Choose…</option>
              {SLOT_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                  {slots ? ` — ${slots[t] ?? 0} seats free` : ''}
                </option>
              ))}
            </select>
            {errors.time && <em>{errors.time}</em>}
          </label>
          <label className="a-field">
            <span>Guests</span>
            <select value={form.party} onChange={(e) => set('party', e.target.value)}>
              {Array.from({ length: 16 }, (_, i) => String(i + 1)).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="a-field a-field--full">
            <span>Notes (optional)</span>
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Birthday, high chair, window seat…" />
          </label>
        </div>
        {seatsLeft !== undefined && Number(form.party) > seatsLeft && (
          <p className="a-alert">Only {seatsLeft} seats are free at {form.time} — choose another time or a smaller party.</p>
        )}
        {errors.form && (
          <p className="a-alert" role="alert">
            {errors.form}
          </p>
        )}
        <div className="a-dialog__foot">
          <button type="button" className="a-btn a-btn--ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="a-btn" disabled={saving}>
            {saving && <Loader2 aria-hidden className="spin" />} {walkIn ? 'Seat now' : 'Save booking'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
