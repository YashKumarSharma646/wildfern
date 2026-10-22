import { ArrowLeft, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BookingPass } from '../components/BookingPass'
import { api, ApiError, type PassInfo } from '../lib/api'

/** /pass/<token> — what a guest's QR code (or saved link) opens. */
export default function PassPage() {
  const token = decodeURIComponent(window.location.pathname.replace(/^\/pass\//, '').replace(/\/$/, ''))
  const [pass, setPass] = useState<PassInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Your booking pass — Wildfern'
    api
      .pass(token)
      .then(setPass)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'We couldn’t load this pass.'))
  }, [token])

  return (
    <main className="pass-page">
      <div className="pass-page__inner">
        {pass ? (
          <BookingPass pass={pass} token={token} />
        ) : error ? (
          <div className="pass-page__error" role="alert">
            <h1 className="display">This pass isn’t valid.</h1>
            <p>{error} If you booked a table, open the pass from your confirmation, or look it up under “Manage booking”.</p>
          </div>
        ) : (
          <p className="pass-page__loading" role="status">
            <Loader2 aria-hidden className="spin" /> Loading your pass…
          </p>
        )}
        <a className="pass-page__back" href="/">
          <ArrowLeft aria-hidden /> Back to Wildfern
        </a>
      </div>
    </main>
  )
}
