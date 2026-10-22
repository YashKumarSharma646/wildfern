/* Client for the owner endpoints. The signed session (never the raw password) lives in
   sessionStorage, so it is cleared when the browser closes and expires server-side after 12h. */

const KEY = 'wildfern-owner-session'
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export type Status = 'confirmed' | 'seated' | 'no_show' | 'cancelled'

export interface Booking {
  code: string
  name: string
  email: string
  date: string
  time: string
  party_size: number
  status: Status
  pass_token: string
  source: 'online' | 'phone' | 'walk-in'
  phone: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  checked_in_at: string | null
}

export interface SlotUse {
  time: string
  seats_used: number
  arrivals: number
}

export interface Summary {
  today: string
  day: {
    date: string
    capacity: number
    slots: SlotUse[]
    bookings: number
    covers: number
    by_status: Record<Status, number>
    busiest: SlotUse | null
  }
  week: { date: string; bookings: number; covers: number }[]
  last_30_days: {
    bookings: number
    covers: number
    avg_party: number | null
    no_show_rate: number | null
    cancel_rate: number | null
    online_share: number | null
  }
  subscribers: number
  email_enabled: boolean
}

export interface CheckinResult {
  result: 'checked_in' | 'already_checked_in' | 'not_today' | 'cancelled' | 'invalid' | 'not_found'
  message: string
  booking: Booking | null
  can_force: boolean
}

export interface NewStaffBooking {
  name: string
  email?: string
  phone?: string
  date: string
  time: string
  party_size: number
  source: 'phone' | 'walk-in'
  notes?: string
}

export class AdminError extends Error {
  status: number
  errors: Record<string, string>
  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export const session = {
  get: () => {
    try {
      return sessionStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set: (t: string) => {
    try {
      sessionStorage.setItem(KEY, t)
    } catch {
      /* private mode: the session simply won't survive a reload */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Fired when the server rejects the session, so the app can return to the sign-in screen. */
export const SIGNED_OUT = 'wildfern:signed-out'

async function call<T>(path: string, init: RequestInit = {}, raw = false): Promise<T> {
  const token = session.get()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new AdminError(0, 'Can’t reach the server. Check the connection and try again.')
  }
  if (res.status === 401 && path !== '/api/admin/login') {
    session.clear()
    window.dispatchEvent(new Event(SIGNED_OUT))
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new AdminError(res.status, body?.detail ?? 'Something went wrong.', body?.errors ?? {})
  }
  return (raw ? res : await res.json()) as T
}

const qs = (o: Record<string, string | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&')

export const adminApi = {
  login: async (password: string) => {
    const r = await call<{ token: string; expires_at: number }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    session.set(r.token)
  },
  summary: (date: string) => call<Summary>(`/api/admin/summary?${qs({ date })}`),
  bookings: (p: { date?: string; q?: string }) => call<Booking[]>(`/api/admin/reservations?${qs(p)}`),
  setStatus: (code: string, status: Status) =>
    call<Booking>(`/api/admin/reservations/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  create: (b: NewStaffBooking) => call<Booking>('/api/admin/reservations', { method: 'POST', body: JSON.stringify(b) }),
  availability: (date: string) =>
    call<{ slots: { time: string; available: boolean; seats_left: number }[] }>(`/api/availability?${qs({ date })}`),
  checkin: (scan: string, force = false) =>
    call<CheckinResult>('/api/admin/checkin', { method: 'POST', body: JSON.stringify({ scan, force }) }),
  subscribers: () => call<{ email: string; created_at: string }[]>('/api/admin/subscribers'),
  /** Fetch a CSV with the session header and hand it to the browser as a download. */
  download: async (path: string, filename: string) => {
    const res = await call<Response>(path, {}, true)
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  },
}

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export const prettyDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts)

export const SLOT_TIMES = Array.from({ length: 22 }, (_, i) => {
  const m = 7 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
