export type Tier = 'high' | 'medium' | 'low'

export interface Quality {
  tier: Tier
  dpr: [number, number]
  birds: number
  pollen: number
  trees: number
  ferns: number
  fallingLeaves: number
  shadows: boolean
  antialias: boolean
  /** MSAA alpha-to-coverage on foliage cards: smoother edges, but costly on weaker GPUs. */
  alphaToCoverage: boolean
}

/*
 * Resolution caps are deliberately conservative: rendering a full-window canvas above
 * 1.5× device pixels costs a lot of fill-rate for very little visible gain in a hazy,
 * soft scene, and fill-rate is what makes the hero stutter on laptops.
 */
const PRESETS: Record<Tier, Quality> = {
  high: { tier: 'high', dpr: [1, 1.5], birds: 110, pollen: 800, trees: 150, ferns: 240, fallingLeaves: 40, shadows: true, antialias: true, alphaToCoverage: true },
  medium: { tier: 'medium', dpr: [1, 1.25], birds: 70, pollen: 480, trees: 110, ferns: 160, fallingLeaves: 26, shadows: false, antialias: true, alphaToCoverage: false },
  low: { tier: 'low', dpr: [0.85, 1], birds: 40, pollen: 220, trees: 80, ferns: 90, fallingLeaves: 14, shadows: false, antialias: false, alphaToCoverage: false },
}

type GpuClass = 'discrete' | 'integrated' | 'software' | 'unknown'

/** Classifies the GPU from the WebGL renderer string (e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 …)"). */
function classifyGpu(): GpuClass {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    if (!gl) return 'unknown'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    if (/swiftshader|llvmpipe|softpipe|microsoft basic render/i.test(renderer)) return 'software'
    // Apple silicon is integrated but strong; treat it like a discrete card.
    if (/apple m\d|apple gpu/i.test(renderer)) return 'discrete'
    if (/nvidia|geforce|quadro|rtx|radeon rx|radeon pro|arc a\d/i.test(renderer)) return 'discrete'
    if (/intel|iris|uhd|hd graphics|radeon\(tm\) graphics|vega \d+ graphics|mali|adreno|powervr|apple/i.test(renderer)) return 'integrated'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Device-capability heuristic. PerformanceMonitor refines DPR at runtime. */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return PRESETS.medium
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const width = window.innerWidth
  const gpu = classifyGpu()

  if (gpu === 'software' || (coarse && width < 768) || cores <= 4 || memory <= 2) return PRESETS.low
  if (gpu === 'integrated' || gpu === 'unknown' || coarse || cores <= 6 || width < 1100) return PRESETS.medium
  return PRESETS.high
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}
