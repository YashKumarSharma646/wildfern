import jsQR from 'jsqr'
import { Camera, CameraOff, CircleAlert, CircleCheck, CircleX, ImageUp, Keyboard, Loader2, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { adminApi, type CheckinResult } from './adminApi'

/* Minimal typing for the browser's native barcode reader (not in TS's DOM lib yet). */
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

const SCAN_EVERY_MS = 220
const RESUME_AFTER_MS = 3500
const SAME_PASS_IGNORE_MS = 20_000

async function makeNativeDetector(): Promise<BarcodeDetectorLike | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? []
    return formats.includes('qr_code') ? new Ctor({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

/** Decode a QR from any image source with jsQR (works everywhere, incl. iOS & Windows). */
function decodeWithJsQR(src: CanvasImageSource, w: number, h: number, scratch: HTMLCanvasElement): string | null {
  const scale = Math.min(1, 720 / Math.max(w, h))
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)
  scratch.width = cw
  scratch.height = ch
  const g = scratch.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, cw, ch)
  const img = g.getImageData(0, 0, cw, ch)
  return jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

/** A short, soft confirmation tone — helps at a busy door. */
function chime(ok: boolean) {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = ok ? 880 : 300
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.35 : 0.5))
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.55)
    o.onended = () => void ctx.close()
  } catch {
    /* audio unavailable — the visual result is enough */
  }
  navigator.vibrate?.(ok ? 80 : [60, 60, 60])
}

const TONE: Record<CheckinResult['result'], 'ok' | 'warn' | 'bad'> = {
  checked_in: 'ok',
  already_checked_in: 'warn',
  not_today: 'warn',
  cancelled: 'bad',
  invalid: 'bad',
  not_found: 'bad',
}
const TITLE: Record<CheckinResult['result'], string> = {
  checked_in: 'Checked in',
  already_checked_in: 'Already checked in',
  not_today: 'Not today’s booking',
  cancelled: 'Booking cancelled',
  invalid: 'Not a valid pass',
  not_found: 'Booking not found',
}

export function CheckinTab() {
  const video = useRef<HTMLVideoElement>(null)
  const scratch = useRef<HTMLCanvasElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const detector = useRef<BarcodeDetectorLike | null>(null)
  const paused = useRef(false)
  const lastScan = useRef({ text: '', at: 0 })

  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'error'>('off')
  const [cameraMsg, setCameraMsg] = useState('')
  const [result, setResult] = useState<(CheckinResult & { scan: string }) | null>(null)
  const [working, setWorking] = useState(false)
  const [manual, setManual] = useState('')
  const [recent, setRecent] = useState<{ name: string; party: number; at: string }[]>([])
  const [undone, setUndone] = useState('')

  const verify = useCallback(async (scan: string, force = false) => {
    paused.current = true
    setWorking(true)
    setUndone('')
    try {
      const r = await adminApi.checkin(scan, force)
      setResult({ ...r, scan })
      chime(r.result === 'checked_in')
      if (r.result === 'checked_in' && r.booking) {
        const b = r.booking
        setRecent((list) => [{ name: b.name, party: b.party_size, at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...list].slice(0, 8))
        // Free the camera for the next guest after a moment.
        window.setTimeout(() => {
          paused.current = false
        }, RESUME_AFTER_MS)
      }
    } catch (e) {
      setResult({ result: 'invalid', message: e instanceof Error ? e.message : 'Could not verify.', booking: null, can_force: false, scan })
      chime(false)
    } finally {
      setWorking(false)
    }
  }, [])

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setCamera('off')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('error')
      setCameraMsg('This browser can’t use the camera here. Use “Scan from a photo” or type the code.')
      return
    }
    setCamera('starting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      stream.current = s
      detector.current = await makeNativeDetector()
      if (video.current) {
        video.current.srcObject = s
        await video.current.play()
      }
      paused.current = false
      setCamera('on')
    } catch (e) {
      const name = (e as DOMException)?.name
      setCamera('error')
      setCameraMsg(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in the browser settings, or type the code below.'
          : name === 'NotFoundError'
            ? 'No camera found on this device. Use “Scan from a photo” or type the code.'
            : 'The camera couldn’t start. Try again, or type the code below.',
      )
    }
  }, [])

  // Scan loop: native detector when available, jsQR otherwise.
  useEffect(() => {
    if (camera !== 'on') return
    let alive = true
    let timer = 0
    scratch.current ??= document.createElement('canvas')
    const tick = async () => {
      const v = video.current
      if (alive && v && !paused.current && v.readyState >= 2) {
        let text: string | null = null
        try {
          if (detector.current) text = (await detector.current.detect(v))[0]?.rawValue ?? null
          else text = decodeWithJsQR(v, v.videoWidth, v.videoHeight, scratch.current!)
        } catch {
          text = null
        }
        const now = Date.now()
        // A guest often keeps holding their phone up after being checked in. Ignore the same
        // pass for a while so the result doesn't flip to "already checked in" under them.
        if (text && !(text === lastScan.current.text && now - lastScan.current.at < SAME_PASS_IGNORE_MS)) {
          lastScan.current = { text, at: now }
          void verify(text)
        }
      }
      if (alive) timer = window.setTimeout(tick, SCAN_EVERY_MS)
    }
    void tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [camera, verify])

  useEffect(() => stop, [stop]) // release the camera when leaving the tab

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return
    const bmp = await createImageBitmap(file)
    scratch.current ??= document.createElement('canvas')
    const text = decodeWithJsQR(bmp, bmp.width, bmp.height, scratch.current)
    if (text) void verify(text)
    else setResult({ result: 'invalid', message: 'No QR code found in that photo — try again, closer and in focus.', booking: null, can_force: false, scan: '' })
  }

  const submitManual = (e: FormEvent) => {
    e.preventDefault()
    if (manual.trim()) void verify(manual.trim())
  }

  const undo = async () => {
    if (!result?.booking) return
    const name = result.booking.name
    await adminApi.setStatus(result.booking.code, 'confirmed')
    setRecent((r) => r.slice(1))
    setResult(null)
    setUndone(`Check-in undone for ${name}. Their booking is back to “Booked”.`)
    paused.current = false
  }

  const tone = result ? TONE[result.result] : null
  const Icon = tone === 'ok' ? CircleCheck : tone === 'warn' ? CircleAlert : CircleX

  return (
    <section className="checkin" aria-labelledby="checkin-title">
      <div className="checkin__scan">
        <h2 id="checkin-title" className="a-title">
          Check guests in
        </h2>
        <p className="a-lead">Scan the QR on a guest’s booking pass. Valid passes for today are checked in straight away.</p>

        <div className={`viewfinder viewfinder--${camera}`}>
          <video ref={video} playsInline muted aria-label="Camera preview" />
          {camera === 'on' && <div className="viewfinder__frame" aria-hidden="true" />}
          {camera !== 'on' && (
            <div className="viewfinder__idle">
              {camera === 'starting' ? (
                <Loader2 aria-hidden className="spin" />
              ) : camera === 'error' ? (
                <>
                  <CameraOff aria-hidden />
                  <p>{cameraMsg}</p>
                  <button type="button" className="a-btn" onClick={start}>
                    Try again
                  </button>
                </>
              ) : (
                <button type="button" className="a-btn a-btn--big" onClick={start}>
                  <Camera aria-hidden /> Start scanning
                </button>
              )}
            </div>
          )}
          {working && (
            <div className="viewfinder__busy" aria-hidden="true">
              <Loader2 className="spin" />
            </div>
          )}
        </div>

        <div className="checkin__alt">
          {camera === 'on' && (
            <button type="button" className="a-btn a-btn--ghost" onClick={stop}>
              <CameraOff aria-hidden /> Stop camera
            </button>
          )}
          <label className="a-btn a-btn--ghost">
            <ImageUp aria-hidden /> Scan from a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
          </label>
        </div>

        <form className="checkin__manual" onSubmit={submitManual}>
          <label htmlFor="manual-code">
            <Keyboard aria-hidden /> Or type the code from the pass
          </label>
          <div>
            <input
              id="manual-code"
              value={manual}
              onChange={(e) => setManual(e.target.value.toUpperCase())}
              placeholder="WF-XXXXXX"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="a-btn" disabled={working || manual.trim().length < 6}>
              Check in
            </button>
          </div>
        </form>
      </div>

      <div className="checkin__side">
        <div className={`verdict ${tone ? `verdict--${tone}` : 'verdict--idle'}`} role="status" aria-live="assertive">
          {result ? (
            <>
              <div className="verdict__head">
                <Icon aria-hidden />
                <strong>{TITLE[result.result]}</strong>
              </div>
              <p className="verdict__msg">{result.message}</p>
              {result.booking && (
                <dl className="verdict__details">
                  <div>
                    <dt>Guest</dt>
                    <dd>{result.booking.name}</dd>
                  </div>
                  <div>
                    <dt>Party</dt>
                    <dd>{result.booking.party_size}</dd>
                  </div>
                  <div>
                    <dt>Booked for</dt>
                    <dd>
                      {new Date(`${result.booking.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                      {result.booking.time}
                    </dd>
                  </div>
                  <div>
                    <dt>Code</dt>
                    <dd>{result.booking.code}</dd>
                  </div>
                  {result.booking.notes && (
                    <div className="verdict__wide">
                      <dt>Notes</dt>
                      <dd>{result.booking.notes}</dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="verdict__actions">
                {result.result === 'checked_in' && (
                  <button type="button" className="a-btn a-btn--ghost" onClick={undo}>
                    <RotateCcw aria-hidden /> Undo
                  </button>
                )}
                {result.can_force && (
                  <button type="button" className="a-btn" onClick={() => void verify(result.scan, true)}>
                    Check in anyway
                  </button>
                )}
                {result.result !== 'checked_in' && (
                  <button
                    type="button"
                    className="a-btn a-btn--ghost"
                    onClick={() => {
                      setResult(null)
                      paused.current = false
                    }}
                  >
                    Scan next
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="verdict__idle">{undone || 'Results appear here. Green means welcome them in.'}</p>
          )}
        </div>

        <div className="recent">
          <h3>Checked in this session</h3>
          {recent.length ? (
            <ul>
              {recent.map((r, i) => (
                <li key={i}>
                  <span>{r.name}</span>
                  <span className="sub">
                    {r.party} {r.party === 1 ? 'guest' : 'guests'} · {r.at}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">Nobody yet.</p>
          )}
        </div>
      </div>
    </section>
  )
}
