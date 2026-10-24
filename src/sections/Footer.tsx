import { ArrowRight, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { NAV_LINKS } from '../content'
import { api, ApiError } from '../lib/api'
import { scrollToId } from '../lib/scroll'

function Newsletter() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setState('error')
      setMessage('That email address doesn’t look quite right.')
      return
    }
    setState('sending')
    try {
      const r = await api.subscribe(email.trim())
      setState('done')
      setMessage(r.message)
      setEmail('')
    } catch (err) {
      setState('error')
      setMessage(err instanceof ApiError ? err.message : 'Something went wrong — please try again.')
    }
  }

  return (
    <form className="newsletter" onSubmit={submit} noValidate>
      <div>
        <h3>Letters from the forest</h3>
        <p>Seasonal drinks, slow mornings and the odd birdsong recording. A few times a year, never more.</p>
      </div>
      <div className="newsletter__row">
        <label htmlFor="nl-email" className="sr-only">
          Email address
        </label>
        <input
          id="nl-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state === 'error' ? true : undefined}
          aria-describedby="nl-status"
        />
        <button type="submit" className="btn btn--solid" disabled={state === 'sending'}>
          {state === 'sending' ? <Loader2 aria-hidden className="spin" /> : <ArrowRight aria-hidden />}
          <span>Subscribe</span>
        </button>
      </div>
      <p id="nl-status" className={`newsletter__status ${state === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">
        {message}
      </p>
    </form>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <Newsletter />
        <p className="footer__word" aria-hidden="true">
          Wildfern
        </p>
        <div className="footer__grid">
          <div>
            <h3>Visit</h3>
            <p>
              14 Cedar Hollow Lane
              <br />
              Daily 7:00 – 18:00
            </p>
          </div>
          <div>
            <h3>Explore</h3>
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.id}>
                  <button onClick={() => scrollToId(l.id)}>{l.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Say hello</h3>
            <p>
              hello@wildfern.example
              <br />
              (555) 014-0721
            </p>
          </div>
          <div>
            <h3>Leave no trace</h3>
            <p>Bring a cup, take the trail, leave the forest as you found it.</p>
          </div>
        </div>
        <div className="footer__legal">
          <span>© {new Date().getFullYear()} Wildfern — a fictional café concept.</span>
          <span>
            Photography from Unsplash · 3D forest rendered live in your browser ·{' '}
            <a className="footer__owner" href="/admin">
              Owner login
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
