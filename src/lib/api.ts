/*
 * Typed client for the FastAPI backend. Same-origin by default (/api/*): Vite proxies it
 * in development and Vercel rewrites it in production. Set VITE_API_URL to point at a
 * backend hosted elsewhere.
 */
import type { MenuItem } from '../content'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  status: number
  field: string | null
  errors: Record<string, string>
  constructor(status: number, message: string, field: string | null = null, errors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.field = field
    this.errors = errors
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(0, 'We couldn’t reach the café’s booking service. Check your connection and try again.')
  } finally {
    window.clearTimeout(timer)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = typeof body?.detail === 'string' ? body.detail : 'Something went wrong — please try again.'
    throw new ApiError(res.status, message, body?.field ?? null, body?.errors ?? {})
  }
  return body as T
}

export interface Slot {
  time: string
  available: boolean
  seats_left: number
}

export interface Reservation {
  code: string
  name: string
  email: string
  date: string
  time: string
  party_size: number
  status: 'confirmed' | 'cancelled'
}

export interface NewReservation {
  name: string
  email: string
  date: string
  time: string
  party_size: number
  website: string
}

export const api = {
  menu: () => request<MenuItem[]>('/api/menu', {}, 6000),
  availability: (date: string) =>
    request<{ date: string; open: boolean; slots: Slot[] }>(`/api/availability?date=${encodeURIComponent(date)}`),
  reserve: (body: NewReservation) => request<Reservation>('/api/reservations', { method: 'POST', body: JSON.stringify(body) }),
  lookup: (code: string, email: string) =>
    request<Reservation>(`/api/reservations/${encodeURIComponent(code.trim().toUpperCase())}?email=${encodeURIComponent(email.trim())}`),
  cancel: (code: string, email: string) =>
    request<Reservation>(`/api/reservations/${encodeURIComponent(code.trim().toUpperCase())}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    }),
  subscribe: (email: string) =>
    request<{ ok: boolean; message: string }>('/api/newsletter', { method: 'POST', body: JSON.stringify({ email }) }),
}
