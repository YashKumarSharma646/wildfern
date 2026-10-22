import * as THREE from 'three'
import { mulberry32 } from '../lib/random'

/*
 * All foliage textures are painted procedurally on a 2D canvas at load time.
 * No network requests, no missing assets, and every texture stays small (≤512px).
 */

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

function leafPath(ctx: CanvasRenderingContext2D, len: number, width: number) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(width, -len * 0.25, width * 0.8, -len * 0.75, 0, -len)
  ctx.bezierCurveTo(-width * 0.8, -len * 0.75, -width, -len * 0.25, 0, 0)
  ctx.closePath()
}

/**
 * An irregular clump of small leaves made of several overlapping sprigs, so canopy
 * billboards read as foliage rather than round balls.
 */
export function createFoliageTexture(seed = 7) {
  const size = 256
  const { canvas, ctx } = makeCanvas(size, size)
  const rand = mulberry32(seed)
  const lobes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.8
    const d = i === 0 ? 0 : size * (0.12 + rand() * 0.14)
    return { x: size / 2 + Math.cos(a) * d, y: size / 2 + Math.sin(a) * d * 0.8, r: size * (0.13 + rand() * 0.1) }
  })

  for (let i = 0; i < 560; i++) {
    const lobe = lobes[Math.floor(rand() * lobes.length)]
    // Denser toward each lobe's centre, ragged toward its edge.
    const r = Math.pow(rand(), 0.7) * lobe.r
    const a = rand() * Math.PI * 2
    const x = lobe.x + Math.cos(a) * r
    const y = lobe.y + Math.sin(a) * r
    const edge = r / lobe.r
    const shade = 0.42 + rand() * 0.45 + (1 - y / size) * 0.22 - edge * 0.08
    const g = Math.round(Math.min(1, shade) * 255)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a + Math.PI / 2 + (rand() - 0.5) * 1.4)
    ctx.fillStyle = `rgb(${Math.round(g * 0.86)},${g},${Math.round(g * 0.78)})`
    leafPath(ctx, 10 + rand() * 12, 4 + rand() * 4)
    ctx.fill()
    ctx.restore()
  }
  return toTexture(canvas)
}

/** Fern fronds radiating from a base point at the bottom-centre. */
export function createFernTexture(seed = 21) {
  const w = 256
  const h = 256
  const { canvas, ctx } = makeCanvas(w, h)
  const rand = mulberry32(seed)
  const fronds = 9
  for (let f = 0; f < fronds; f++) {
    const angle = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * 2.3 + (rand() - 0.5) * 0.2
    const len = 150 + rand() * 80
    const bend = (f / (fronds - 1) - 0.5) * 0.9
    const g = Math.round((0.55 + rand() * 0.4) * 255)
    ctx.strokeStyle = `rgb(${Math.round(g * 0.8)},${g},${Math.round(g * 0.7)})`
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 2
    let x = w / 2
    let y = h - 2
    let a = angle
    const steps = 22
    const stepLen = len / steps
    for (let s = 0; s < steps; s++) {
      const nx = x + Math.cos(a) * stepLen
      const ny = y + Math.sin(a) * stepLen
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(nx, ny)
      ctx.stroke()
      const t = s / steps
      const leaflet = (1 - t) * 16 + 3
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.translate(nx, ny)
        ctx.rotate(a + side * (Math.PI / 2.6) + Math.PI / 2)
        leafPath(ctx, leaflet, leaflet * 0.28)
        ctx.fill()
        ctx.restore()
      }
      x = nx
      y = ny
      a += bend * 0.06 * (1 + t)
    }
  }
  const tex = toTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/**
 * A single broad leaf with veins. `blur` produces a soft, defocused variant
 * for foreground framing leaves close to the lens.
 */
export function createLeafTexture(blur = 0) {
  const w = 256
  const h = 512
  const { canvas, ctx } = makeCanvas(w, h)
  if (blur > 0) ctx.filter = `blur(${blur}px)`
  ctx.translate(w / 2, h - 18)

  const grad = ctx.createLinearGradient(-90, 0, 90, -h)
  grad.addColorStop(0, '#5f7a45')
  grad.addColorStop(0.5, '#8fae63')
  grad.addColorStop(1, '#4c6a38')
  ctx.fillStyle = grad
  leafPath(ctx, h - 40, 150)
  ctx.fill()

  // Midrib + veins
  ctx.strokeStyle = 'rgba(225, 235, 190, 0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(6, -(h - 40) * 0.5, 0, -(h - 52))
  ctx.stroke()
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(225, 235, 190, 0.32)'
  for (let i = 1; i < 12; i++) {
    const y = -i * ((h - 60) / 12)
    const spread = Math.sin((i / 12) * Math.PI) * 95
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.quadraticCurveTo(side * spread * 0.5, y - 14, side * spread, y - 40)
      ctx.stroke()
    }
  }
  // Petiole
  ctx.strokeStyle = '#4a5e33'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 16)
  ctx.stroke()
  return toTexture(canvas)
}

/** Soft radial glow used for the hidden café's light bleeding through the fog. */
export function createGlowTexture() {
  const size = 128
  const { canvas, ctx } = makeCanvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  return tex
}
