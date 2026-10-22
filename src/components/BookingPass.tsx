import { Check, Download, Link2, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { passUrl, type PassInfo } from '../lib/api'
import { FernMark } from './FernMark'

const INK = '#16211a'
const PAPER = '#fbf8f1'

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const STATUS_NOTE: Partial<Record<PassInfo['status'], string>> = {
  cancelled: 'This booking was cancelled.',
  seated: 'Checked in — enjoy your visit.',
  no_show: 'This booking was marked as a no-show.',
}

/**
 * A guest's booking pass: a QR that staff scan at the door. The QR encodes the pass URL,
 * so any phone camera also opens it; the signature inside it means it can't be forged.
 */
export function BookingPass({ pass, token, compact = false }: { pass: PassInfo; token: string; compact?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const url = passUrl(token)

  useEffect(() => {
    if (!canvas.current) return
    QRCode.toCanvas(canvas.current, url, {
      width: compact ? 168 : 216,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: INK, light: PAPER },
    }).catch(() => {})
  }, [url, compact])

  const share = async () => {
    const text = `My Wildfern table — ${longDate(pass.date)} at ${pass.time}, ${pass.party_size} guest${pass.party_size > 1 ? 's' : ''}.`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Wildfern booking pass', text, url })
        return
      } catch {
        /* dismissed — fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy your pass link:', url)
    }
  }

  const download = async () => {
    setSaving(true)
    try {
      const png = await renderPassImage(pass, url)
      const a = document.createElement('a')
      a.href = png
      a.download = `wildfern-pass-${pass.code}.png`
      a.click()
    } finally {
      setSaving(false)
    }
  }

  const note = STATUS_NOTE[pass.status]
  return (
    <div className={`pass ${compact ? 'pass--compact' : ''} ${pass.status === 'cancelled' ? 'is-void' : ''}`}>
      <div className="pass__head">
        <span className="pass__brand">
          <FernMark /> WILDFERN
        </span>
        <span className="pass__kind">Booking pass</span>
      </div>
      <div className="pass__qr">
        <canvas ref={canvas} role="img" aria-label={`QR code for booking ${pass.code}`} />
      </div>
      {note ? (
        <p className={`pass__status pass__status--${pass.status}`} role="status">
          {note}
        </p>
      ) : (
        <p className="pass__hint">Show this at the door — we’ll scan it to check you in.</p>
      )}
      <dl className="pass__details">
        <div>
          <dt>Name</dt>
          <dd>{pass.name}</dd>
        </div>
        <div>
          <dt>Guests</dt>
          <dd>{pass.party_size}</dd>
        </div>
        <div className="pass__wide">
          <dt>When</dt>
          <dd>
            {longDate(pass.date)} · {pass.time}
          </dd>
        </div>
      </dl>
      <div className="pass__tear" aria-hidden="true" />
      <div className="pass__foot">
        <span>
          Code <strong>{pass.code}</strong>
        </span>
        <div className="pass__actions">
          <button type="button" onClick={download} disabled={saving}>
            <Download aria-hidden /> {saving ? 'Saving…' : 'Download'}
          </button>
          <button type="button" onClick={share}>
            {copied ? <Check aria-hidden /> : 'share' in navigator ? <Share2 aria-hidden /> : <Link2 aria-hidden />}
            {copied ? 'Link copied' : 'share' in navigator ? 'Share' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Draws a phone-wallpaper-sized pass image (1080×1600) to save to the camera roll. */
async function renderPassImage(pass: PassInfo, url: string): Promise<string> {
  await Promise.all([
    document.fonts?.load('300 64px Fraunces'),
    document.fonts?.load('500 32px Manrope'),
    document.fonts?.load('600 28px Manrope'),
  ]).catch(() => {})
  const W = 1080
  const H = 1600
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  g.fillStyle = '#101b14'
  g.fillRect(0, 0, W, H)
  // ticket
  const x = 90
  const y = 120
  const w = W - 180
  const h = H - 240
  g.fillStyle = PAPER
  g.beginPath()
  g.roundRect(x, y, w, h, 36)
  g.fill()

  g.textAlign = 'center'
  g.fillStyle = '#5a3f2b'
  g.font = '600 26px Manrope, sans-serif'
  g.fillText('W I L D F E R N   ·   B O O K I N G   P A S S', W / 2, y + 90)

  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, url, { width: 560, margin: 1, errorCorrectionLevel: 'M', color: { dark: INK, light: PAPER } })
  g.drawImage(qr, (W - 560) / 2, y + 140)

  g.fillStyle = INK
  g.font = '300 76px Fraunces, Georgia, serif'
  g.fillText(pass.name, W / 2, y + 820)
  g.font = '500 36px Manrope, sans-serif'
  g.fillStyle = '#46524a'
  g.fillText(longDate(pass.date), W / 2, y + 890)
  g.fillText(`${pass.time}  ·  ${pass.party_size} guest${pass.party_size > 1 ? 's' : ''}`, W / 2, y + 945)

  g.strokeStyle = 'rgba(22,33,26,0.25)'
  g.setLineDash([14, 12])
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(x + 50, y + 1030)
  g.lineTo(x + w - 50, y + 1030)
  g.stroke()
  g.setLineDash([])

  g.fillStyle = '#46524a'
  g.font = '500 30px Manrope, sans-serif'
  g.fillText('Show this at the door — we’ll scan it to check you in.', W / 2, y + 1110)
  g.fillStyle = INK
  g.font = '600 40px Manrope, sans-serif'
  g.fillText(pass.code, W / 2, y + 1190)
  g.fillStyle = '#46524a'
  g.font = '500 26px Manrope, sans-serif'
  g.fillText('14 Cedar Hollow Lane · Daily 7:00 – 18:00', W / 2, y + 1250)
  return c.toDataURL('image/png')
}
