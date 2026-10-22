import * as THREE from 'three'
import { SUN_DIR } from './Atmosphere'

/*
 * Instanced, camera-facing foliage cards. One draw call per foliage type.
 * - Wind sway is computed on the GPU per instance (seeded phase).
 * - Cards near the pointer ray are pushed aside, so the forest "parts" under the cursor.
 * - Backlit cards pick up warm translucency from the low sun.
 */

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  uniform float uRotate;
  uniform vec3 uRayOrigin;
  uniform vec3 uRayDir;
  uniform float uPush;
  uniform vec3 uSunDir;
  attribute float aSeed;
  attribute vec3 aTint;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vShade;
  varying float vBacklight;
  #include <fog_pars_vertex>

  void main() {
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    float tip = uv.y; // 0 at the base, 1 at the top

    // Layered wind: slow gusts across the forest + quick flutter per card.
    float gust = sin(uTime * 0.55 + center.x * 0.08 + center.z * 0.05) * 0.5 + 0.5;
    float sway = sin(uTime * 1.3 + aSeed * 31.0) * 0.6 + sin(uTime * 2.7 + aSeed * 17.0) * 0.25;
    vec3 offset = vec3(sway * (0.4 + gust), 0.0, cos(uTime * 0.9 + aSeed * 11.0) * 0.4) * uWind * tip;

    // Part around the pointer ray.
    vec3 v = center - uRayOrigin;
    float t = max(dot(v, uRayDir), 0.0);
    vec3 diff = center - (uRayOrigin + uRayDir * t);
    float d = length(diff);
    float radius = 1.2 + t * 0.12;
    float influence = (1.0 - smoothstep(0.0, radius, d)) * uPush;
    offset += normalize(diff + vec3(0.0001)) * influence * tip * sy * 0.35;

    vec4 mvPosition = viewMatrix * vec4(center + offset, 1.0);
    float a = aSeed * 6.2831 * uRotate;
    vec2 p = position.xy * vec2(sx, sy);
    p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;
    mvPosition.xy += p;
    gl_Position = projectionMatrix * mvPosition;

    vUv = uv;
    vTint = aTint;
    vShade = mix(position.y + 0.5, tip, 1.0 - uRotate);
    vec3 toCard = normalize(center - cameraPosition);
    vBacklight = pow(max(dot(toCard, uSunDir), 0.0), 3.0);
    #include <fog_vertex>
  }
`

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform float uCutoff;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vShade;
  varying float vBacklight;
  #include <fog_pars_fragment>

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < uCutoff) discard;
    vec3 col = vTint * tex.rgb * mix(0.45, 1.2, vShade);
    // Light glowing through leaves when looking toward the sun.
    col += uSun * vTint * tex.rgb * vBacklight * vShade * 0.9;
    gl_FragColor = vec4(col, smoothstep(uCutoff, uCutoff + 0.25, tex.a));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export interface BillboardOptions {
  map: THREE.Texture
  wind: number
  rotate: boolean
  push: number
  alphaToCoverage: boolean
}

export function createBillboardMaterial(opts: BillboardOptions) {
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWind: { value: opts.wind },
        uRotate: { value: opts.rotate ? 1 : 0 },
        uRayOrigin: { value: new THREE.Vector3() },
        uRayDir: { value: new THREE.Vector3(0, 0, -1) },
        uPush: { value: opts.push },
        uSunDir: { value: SUN_DIR.clone() },
        uSun: { value: new THREE.Color('#ffcf8f') },
        uCutoff: { value: 0.32 },
      },
    ]),
  })
  // merge() clones values; textures must be assigned after.
  material.uniforms.uMap = { value: opts.map }
  material.alphaToCoverage = opts.alphaToCoverage
  return material
}
