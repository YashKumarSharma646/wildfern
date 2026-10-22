import { mulberry32 } from '../lib/random'

/** World-space anchors shared by the camera, the forest and the café. */
export const CAFE_Z = -62
export const CAMERA_START_Z = 16
export const CAMERA_END_Z = -45

/** The trail meanders gently; trees keep clear of it. */
export function pathX(z: number) {
  const toCafe = Math.min(1, Math.max(0, (z - CAFE_Z) / 30))
  return Math.sin(z * 0.075) * 1.8 * toCafe
}

export interface TreeSpec {
  x: number
  z: number
  height: number
  radius: number
  lean: number
  leanDir: number
}

export function generateTrees(count: number, seed = 11): TreeSpec[] {
  const rand = mulberry32(seed)
  const trees: TreeSpec[] = []
  let guard = 0
  while (trees.length < count && guard++ < count * 40) {
    const z = 22 - rand() * 120
    const x = (rand() * 2 - 1) * 42
    const corridor = Math.abs(x - pathX(z))
    if (corridor < 3.4 + Math.max(0, (16 - Math.abs(z - 4)) * 0.05)) continue
    const dCafe = Math.hypot(x, z - CAFE_Z)
    if (dCafe < 12.5) continue
    // Keep spacing so trunks don't intersect.
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 5.5)) continue
    trees.push({
      x,
      z,
      height: 15 + rand() * 13,
      radius: 0.28 + rand() * 0.42,
      lean: (rand() - 0.5) * 0.06,
      leanDir: rand() * Math.PI * 2,
    })
  }
  return trees
}
