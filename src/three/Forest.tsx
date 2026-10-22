import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { useDisposable } from './useDisposable'
import * as THREE from 'three'
import { mulberry32 } from '../lib/random'
import type { Quality } from '../lib/quality'
import { createBillboardMaterial } from './billboardMaterial'
import { frame } from './frame'
import { CAFE_Z, generateTrees, pathX } from './layout'
import { createFernTexture, createFoliageTexture } from './textures'

const CANOPY_TINTS = ['#4f6b3c', '#5d7a43', '#3f5a33', '#6c8748', '#47623a'].map((c) => new THREE.Color(c))
const FERN_TINTS = ['#5f7f42', '#6f8f4a', '#4d6c37', '#7c9a52'].map((c) => new THREE.Color(c))

export function Forest({ quality }: { quality: Quality }) {
  const trees = useMemo(() => generateTrees(quality.trees), [quality.trees])

  /* ---------- Trunks: one instanced mesh ---------- */
  const trunkGeometry = useDisposable(() => {
    const g = new THREE.CylinderGeometry(0.62, 1, 1, 9, 6, true)
    g.translate(0, 0.5, 0)
    return g
  })
  const trunkMaterial = useDisposable(
    () => new THREE.MeshLambertMaterial({ color: '#ffffff' }),
  )
  const trunks = useMemo(() => {
    const mesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const c = new THREE.Color()
    const rand = mulberry32(3)
    trees.forEach((t, i) => {
      e.set(Math.cos(t.leanDir) * t.lean, 0, Math.sin(t.leanDir) * t.lean)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(t.x, -0.3, t.z), q, new THREE.Vector3(t.radius, t.height, t.radius))
      mesh.setMatrixAt(i, m)
      c.setHSL(0.07 + rand() * 0.03, 0.22 + rand() * 0.1, 0.13 + rand() * 0.07)
      mesh.setColorAt(i, c)
    })
    mesh.castShadow = quality.shadows
    mesh.receiveShadow = quality.shadows
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }, [trees, trunkGeometry, trunkMaterial, quality.shadows])

  /* ---------- Canopy + understory billboards ---------- */
  const foliageTexture = useDisposable(() => createFoliageTexture(7))
  const fernTexture = useDisposable(() => createFernTexture(21))
  const cardGeometry = useDisposable(() => new THREE.PlaneGeometry(1, 1))
  const fernGeometry = useDisposable(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, 0.5, 0)
    return g
  })

  const canopyMaterial = useDisposable(
    () => createBillboardMaterial({ map: foliageTexture, wind: 0.35, rotate: true, push: 0.6, alphaToCoverage: quality.alphaToCoverage }),
    [foliageTexture, quality.alphaToCoverage],
  )
  const fernMaterial = useDisposable(
    () => createBillboardMaterial({ map: fernTexture, wind: 0.18, rotate: false, push: 1.4, alphaToCoverage: quality.alphaToCoverage }),
    [fernTexture, quality.alphaToCoverage],
  )

  const canopy = useMemo(() => {
    const rand = mulberry32(5)
    type Card = { x: number; y: number; z: number; s: number }
    const cards: Card[] = []
    for (const t of trees) {
      const clumps = 4 + Math.floor(rand() * 3)
      for (let k = 0; k < clumps; k++) {
        const h = t.height * (0.55 + rand() * 0.5)
        const r = 0.8 + rand() * 2.6
        const a = rand() * Math.PI * 2
        cards.push({ x: t.x + Math.cos(a) * r, y: h, z: t.z + Math.sin(a) * r, s: 3.5 + rand() * 4 })
      }
      // Low understory shrubs around the trunk base for lushness.
      if (rand() < 0.65) {
        const a = rand() * Math.PI * 2
        cards.push({ x: t.x + Math.cos(a) * 1.2, y: 0.9 + rand() * 0.6, z: t.z + Math.sin(a) * 1.2, s: 1.8 + rand() * 1.8 })
      }
    }
    const mesh = new THREE.InstancedMesh(cardGeometry, canopyMaterial, cards.length)
    const seeds = new Float32Array(cards.length)
    const tints = new Float32Array(cards.length * 3)
    const m = new THREE.Matrix4()
    cards.forEach((c, i) => {
      m.makeScale(c.s, c.s, 1).setPosition(c.x, c.y, c.z)
      mesh.setMatrixAt(i, m)
      seeds[i] = rand()
      const tint = CANOPY_TINTS[Math.floor(rand() * CANOPY_TINTS.length)]
      tint.toArray(tints, i * 3)
    })
    mesh.geometry = cardGeometry.clone()
    mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    mesh.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
    mesh.frustumCulled = false
    return mesh
  }, [trees, cardGeometry, canopyMaterial])

  const ferns = useMemo(() => {
    const rand = mulberry32(17)
    const mesh = new THREE.InstancedMesh(fernGeometry, fernMaterial, quality.ferns)
    const seeds = new Float32Array(quality.ferns)
    const tints = new Float32Array(quality.ferns * 3)
    const m = new THREE.Matrix4()
    for (let i = 0; i < quality.ferns; i++) {
      let x: number
      let z: number
      if (i % 4 === 0) {
        // Ferns cluster around the café clearing.
        const a = rand() * Math.PI * 2
        const r = 8 + rand() * 7
        x = Math.cos(a) * r
        z = CAFE_Z + Math.sin(a) * r * 0.8
        // Keep the view onto the terrace clear.
        if (Math.abs(x) < 6 && z > CAFE_Z + 3) x += Math.sign(x || 1) * 6
      } else {
        // Line the trail, thinning with distance from it.
        z = 18 - rand() * 100
        const side = rand() < 0.5 ? -1 : 1
        x = pathX(z) + side * (2.2 + Math.pow(rand(), 1.6) * 22)
      }
      const s = 1.1 + rand() * 1.5
      m.makeScale(s * 1.4, s, 1).setPosition(x, -0.05, z)
      mesh.setMatrixAt(i, m)
      seeds[i] = rand()
      FERN_TINTS[Math.floor(rand() * FERN_TINTS.length)].toArray(tints, i * 3)
    }
    mesh.geometry = fernGeometry.clone()
    mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    mesh.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
    mesh.frustumCulled = false
    return mesh
  }, [quality.ferns, fernGeometry, fernMaterial])

  // Cloned geometries carry the per-instance attributes; dispose them with the mesh.
  useEffect(() => () => canopy.geometry.dispose(), [canopy])
  useEffect(() => () => ferns.geometry.dispose(), [ferns])
  useEffect(() => () => trunks.dispose(), [trunks])

  /* ---------- Forest floor with a worn trail ---------- */
  const groundGeometry = useDisposable(() => {
    const g = new THREE.PlaneGeometry(240, 240, 140, 140)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, -40)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const moss = new THREE.Color('#25331f')
    const mossLight = new THREE.Color('#3b4a2a')
    const soil = new THREE.Color('#4a3b2a')
    const stone = new THREE.Color('#6a6255')
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const n = Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.23 + x * 0.05)
      const trail = 1 - THREE.MathUtils.smoothstep(Math.abs(x - pathX(z)), 0.6, 1.9)
      const clearing = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, (z - CAFE_Z) * 1.2), 6, 11)
      c.copy(moss).lerp(mossLight, n * 0.5 + 0.5)
      c.lerp(soil, trail * 0.85)
      c.lerp(stone, clearing * 0.35)
      c.toArray(colors, i * 3)
      const bump = (1 - trail) * (1 - clearing) * (n * 0.18 + Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.05)
      pos.setY(i, bump)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  })
  const groundMaterial = useDisposable(() => new THREE.MeshLambertMaterial({ vertexColors: true }))

  useFrame(() => {
    for (const mat of [canopyMaterial, fernMaterial]) {
      const u = mat.uniforms
      u.uTime.value = frame.time
      u.uRayOrigin.value.copy(frame.rayOrigin)
      u.uRayDir.value.copy(frame.rayDir)
      u.uPush.value = (mat === fernMaterial ? 1.4 : 0.6) * (frame.pointerLive ? 1 : 0.25)
    }
  })

  return (
    <>
      <primitive object={trunks} />
      <primitive object={canopy} />
      <primitive object={ferns} />
      <mesh geometry={groundGeometry} material={groundMaterial} receiveShadow={quality.shadows} />
    </>
  )
}
