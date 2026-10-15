import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Character } from './characters'

/**
 * Procedural low-poly karts and human drivers. Static parts are merged into a few vertex-
 * coloured meshes per kart (≈8 draw calls), with separate nodes only for animated parts:
 * steering front wheels, rolling wheels, the body (lean/squash), the head (bob) and the driver.
 */
export const TOON = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.02 })

type V3 = [number, number, number]

export class Parts {
  private list: THREE.BufferGeometry[] = []

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv')
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale))
    g.applyMatrix4(m)
    const c = new THREE.Color(color)
    const n = g.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 1) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.list.push(g)
    return this
  }

  /** Capsule-ish limb between two points. */
  limb(a: V3, b: V3, r: number, color: THREE.ColorRepresentation): this {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const len = va.distanceTo(vb)
    const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 2, 6)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())
    const e = new THREE.Euler().setFromQuaternion(q)
    const mid = va.add(vb).multiplyScalar(0.5)
    return this.add(g, color, [mid.x, mid.y, mid.z], [e.x, e.y, e.z])
  }

  mesh(material: THREE.Material = TOON): THREE.Mesh {
    const merged = mergeGeometries(this.list, false)!
    merged.computeVertexNormals()
    for (const g of this.list) g.dispose()
    this.list = []
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }
}

const ico = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d)
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
const cyl = (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s)

const INK = '#2b1a2e'
const WHITE = '#fffaf2'

let hondaFaceTexture: THREE.Texture | null = null
let tkzFaceTexture: THREE.Texture | null = null
let nicaoFaceTexture: THREE.Texture | null = null
let jaoFaceTexture: THREE.Texture | null = null
let berbasFaceTexture: THREE.Texture | null = null
let tsenFaceTexture: THREE.Texture | null = null

/** Load user-supplied face photos before portraits and race models are created. */
export async function preloadFaceAssets(): Promise<void> {
  const loader = new THREE.TextureLoader()
  const [honda, tkz, nicao, jao, berbas, tsen] = await Promise.all([
    loader.loadAsync('./assets/honda-face.png'),
    loader.loadAsync('./assets/tkz-face.png'),
    loader.loadAsync('./assets/nicao-face.webp'),
    loader.loadAsync('./assets/jao-face.webp'),
    loader.loadAsync('./assets/berbas-face.webp'),
    loader.loadAsync('./assets/tsen-face.webp'),
  ])
  honda.colorSpace = THREE.SRGBColorSpace
  tkz.colorSpace = THREE.SRGBColorSpace
  nicao.colorSpace = THREE.SRGBColorSpace
  jao.colorSpace = THREE.SRGBColorSpace
  berbas.colorSpace = THREE.SRGBColorSpace
  tsen.colorSpace = THREE.SRGBColorSpace
  hondaFaceTexture = honda
  tkzFaceTexture = tkz
  nicaoFaceTexture = nicao
  jaoFaceTexture = jao
  berbasFaceTexture = berbas
  tsenFaceTexture = tsen
}

export type KartView = {
  root: THREE.Group
  /** Lean/squash node containing chassis + driver. */
  body: THREE.Group
  driver: THREE.Group
  head: THREE.Group
  tail?: THREE.Group
  frontPivots: THREE.Group[]
  wheels: THREE.Object3D[]
  /** Local positions of the rear wheel contact points (drift sparks). */
  sparkPoints: THREE.Vector3[]
  /** Local exhaust tips (boost flames). */
  exhausts: THREE.Vector3[]
  shield: THREE.Mesh
  shadow: THREE.Mesh
}

export function bubbleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPop: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      uniform float uTime;
      void main() {
        vec3 p = position * (1.0 + 0.035 * sin(uTime * 6.0 + position.y * 4.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      uniform float uTime; uniform float uPop;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        vec3 a = vec3(0.55, 0.95, 1.0); vec3 b = vec3(1.0, 0.6, 0.9);
        vec3 col = mix(a, b, 0.5 + 0.5 * sin(vP.y * 3.0 + uTime * 2.0));
        float alpha = (0.08 + f * 0.75) * (1.0 - uPop);
        gl_FragColor = vec4(col * (1.0 + f), alpha);
      }`,
  })
}

/** Stylized human driver with a distinct skin/hair palette per racer. */
function buildDriver(c: Character): { driver: THREE.Group; head: THREE.Group; tail?: THREE.Group } {
  const driver = new THREE.Group()
  const skinById: Record<string, string> = {
    hamster: '#8d5524', hedgehog: '#e8b98f', sloth: '#c68642',
    redpanda: '#ffdbac', bunny: '#c98f6b', frog: '#d19a72',
  }
  const skin = skinById[c.id] ?? '#d69b72'
  const pants = '#26384a'
  const shoes = '#172432'

  const torso = new Parts()
  torso.add(box(0.62, 0.72, 0.42), c.fur, [0, 0.94, -0.28], [0.08, 0, 0], [1, 1, 0.9])
  torso.add(box(0.42, 0.28, 0.38), pants, [0, 0.56, -0.28])
  torso.add(cyl(0.16, 0.18, 0.16, 8), skin, [0, 1.38, -0.25])
  torso.limb([0.3, 1.12, -0.25], [0.18, 0.96, 0.28], 0.095, c.fur)
  torso.limb([-0.3, 1.12, -0.25], [-0.18, 0.96, 0.28], 0.095, c.fur)
  torso.add(ico(0.105, 1), skin, [0.18, 0.95, 0.31])
  torso.add(ico(0.105, 1), skin, [-0.18, 0.95, 0.31])
  torso.limb([0.22, 0.63, -0.25], [0.23, 0.35, -0.5], 0.12, pants)
  torso.limb([-0.22, 0.63, -0.25], [-0.23, 0.35, -0.5], 0.12, pants)
  torso.add(box(0.24, 0.1, 0.42), shoes, [0.23, 0.25, -0.62])
  torso.add(box(0.24, 0.1, 0.42), shoes, [-0.23, 0.25, -0.62])
  driver.add(torso.mesh())

  const head = new THREE.Group()
  head.position.set(0, 1.58, -0.24)
  const h = new Parts()
  const faceTexture = c.id === 'frog' ? hondaFaceTexture : c.id === 'sloth' ? tkzFaceTexture : c.id === 'hamster' ? nicaoFaceTexture : c.id === 'redpanda' ? jaoFaceTexture : c.id === 'hedgehog' ? berbasFaceTexture : c.id === 'bunny' ? tsenFaceTexture : null
  // PNG racers use the photo as the whole head; Tavares, Isaac and Lebron keep a blank 3D head.
  if (!faceTexture) {
    h.add(ico(0.43, 2), skin, [0, 0, 0], [0, 0, 0], [0.92, 1.08, 0.88])
    head.add(h.mesh())
  }
  if (faceTexture) {
    const face = new THREE.Sprite(new THREE.SpriteMaterial({
      map: faceTexture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    }))
    face.position.set(0, -0.02, 0.43)
    face.scale.set(0.60, 0.78, 1)
    face.renderOrder = 2
    head.add(face)
  }
  driver.add(head)
  return { driver, head }
}

export function buildKart(c: Character): KartView {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const chassis = new Parts()
  const kc = c.kart
  const ac = c.kartAccent
  chassis.add(box(1.36, 0.26, 2.0), kc, [0, 0.42, 0])
  chassis.add(box(1.0, 0.24, 0.62), kc, [0, 0.5, 1.12], [-0.28, 0, 0])
  chassis.add(box(0.36, 0.3, 1.25), ac, [0.72, 0.44, -0.05])
  chassis.add(box(0.36, 0.3, 1.25), ac, [-0.72, 0.44, -0.05])
  chassis.add(cyl(0.13, 0.13, 1.5, 8), WHITE, [0, 0.33, 1.45], [0, 0, Math.PI / 2])
  chassis.add(box(0.78, 0.12, 0.62), '#4a2f3c', [0, 0.6, -0.34])
  chassis.add(box(0.82, 0.72, 0.16), ac, [0, 0.94, -0.72], [-0.12, 0, 0])
  chassis.add(box(0.95, 0.42, 0.48), '#5b3a2a', [0, 0.62, -0.98])
  for (const s of [1, -1]) {
    chassis.add(cyl(0.1, 0.12, 0.5, 7), ac, [s * 0.3, 0.8, -1.26], [-1.1, 0, 0])
    chassis.add(cyl(0.12, 0.1, 0.1, 7), WHITE, [s * 0.3, 0.9, -1.48], [-1.1, 0, 0])
    chassis.add(box(0.06, 0.45, 0.06), INK, [s * 0.55, 1.05, -1.02])
  }
  chassis.add(box(1.55, 0.08, 0.38), ac, [0, 1.27, -1.08], [0.12, 0, 0])
  chassis.add(box(1.55, 0.05, 0.4), kc, [0, 1.32, -1.08], [0.12, 0, 0])
  chassis.add(cyl(0.04, 0.04, 0.5, 5), INK, [0, 0.78, 0.42], [-0.9, 0, 0])
  chassis.add(new THREE.TorusGeometry(0.2, 0.045, 5, 10), INK, [0, 0.96, 0.3], [-0.55, 0, 0])
  // Paw emblem on the nose.
  chassis.add(cyl(0.12, 0.12, 0.03, 8), WHITE, [0, 0.66, 1.1], [1.29, 0, 0])
  for (const [x, z] of [[-0.11, 0.1], [0, 0.14], [0.11, 0.1]]) chassis.add(cyl(0.045, 0.045, 0.03, 6), WHITE, [x, 0.7 + z * 0.3, 1.2 - z * 0.1], [1.29, 0, 0])
  body.add(chassis.mesh())

  const { driver, head, tail } = buildDriver(c)
  body.add(driver)

  const wheels: THREE.Object3D[] = []
  const frontPivots: THREE.Group[] = []
  const makeWheel = (r: number, w: number) => {
    const p = new Parts()
    p.add(cyl(r, r, w, 10), '#3a2430', [0, 0, 0], [0, 0, Math.PI / 2])
    p.add(cyl(r * 0.55, r * 0.55, w + 0.04, 8), ac, [0, 0, 0], [0, 0, Math.PI / 2])
    p.add(cyl(r * 0.2, r * 0.2, w + 0.08, 6), WHITE, [0, 0, 0], [0, 0, Math.PI / 2])
    p.add(box(w + 0.02, r * 0.3, r * 2.02), '#2a1822', [0, 0, 0])
    return p.mesh()
  }
  for (const s of [1, -1]) {
    const pivot = new THREE.Group()
    pivot.position.set(s * 0.8, 0.33, 0.78)
    const w = makeWheel(0.33, 0.3)
    pivot.add(w)
    root.add(pivot)
    frontPivots.push(pivot)
    wheels.push(w)
    const rear = makeWheel(0.39, 0.4)
    rear.position.set(s * 0.82, 0.39, -0.78)
    root.add(rear)
    wheels.push(rear)
  }

  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 2), bubbleMaterial())
  shield.position.y = 0.95
  shield.visible = false
  root.add(shield)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 16),
    new THREE.MeshBasicMaterial({ color: '#2b1430', transparent: true, opacity: 0.32, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.set(0.85, 1.25, 1)
  shadow.renderOrder = 1

  return {
    root,
    body,
    driver,
    head,
    tail,
    frontPivots,
    wheels,
    sparkPoints: [new THREE.Vector3(0.82, 0.05, -1.05), new THREE.Vector3(-0.82, 0.05, -1.05)],
    exhausts: [new THREE.Vector3(0.3, 0.95, -1.55), new THREE.Vector3(-0.3, 0.95, -1.55)],
    shield,
    shadow,
  }
}

/** Head-and-shoulders portraits for UI cards, rendered once with the game renderer. */
export function renderPortraits(gl: THREE.WebGLRenderer, roster: Character[], size = 160): Map<string, string> {
  const out = new Map<string, string>()
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#fff4f8', '#8a6a9a', 1.6))
  const key = new THREE.DirectionalLight('#fff0e0', 2.4)
  key.position.set(2, 3, 4)
  scene.add(key)
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  cam.position.set(0.9, 1.75, 3.1)
  cam.lookAt(0, 1.38, 0)
  const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 })
  target.texture.colorSpace = THREE.SRGBColorSpace
  const pixels = new Uint8Array(size * size * 4)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const prevTarget = gl.getRenderTarget()
  const prevClear = gl.getClearColor(new THREE.Color())
  const prevAlpha = gl.getClearAlpha()
  const prevTone = gl.toneMapping
  gl.setClearColor(0x000000, 0)
  for (const c of roster) {
    const { driver } = buildDriver(c)
    driver.rotation.y = 0.35
    scene.add(driver)
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, cam)
    gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    const img = ctx.createImageData(size, size)
    for (let y = 0; y < size; y += 1) {
      const src = (size - 1 - y) * size * 4
      img.data.set(pixels.subarray(src, src + size * 4), y * size * 4)
    }
    ctx.clearRect(0, 0, size, size)
    ctx.putImageData(img, 0, 0)
    out.set(c.id, canvas.toDataURL('image/png'))
    scene.remove(driver)
    driver.traverse(o => (o as THREE.Mesh).geometry?.dispose())
  }
  gl.setRenderTarget(prevTarget)
  gl.setClearColor(prevClear, prevAlpha)
  gl.toneMapping = prevTone
  target.dispose()
  return out
}
