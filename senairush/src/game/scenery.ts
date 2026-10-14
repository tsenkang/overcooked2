import * as THREE from 'three'

/** Non-indexed copy for per-face shading/colors (skips geometries that are already flat). */
const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.index ? g.toNonIndexed() : g)
import { TOON } from './kartModel'
import { BRIDGE_LAKE, SHORT_WALL, WALL, type Track } from './track'

/**
 * SENAI Pompéia campus scenery: gradient sky, warm key light that follows the camera, a flat-shaded
 * terrain that is flattened around the circuit, reflective training courtyards, campus landscaping, distant
 * workshop blocks, a SENAI gate landmark, the start gantry and bouncing spectators.
 * Everything is procedural; one seeded RNG keeps the layout identical between sessions.
 */
export type Scenery = {
  sun: THREE.DirectionalLight
  startLights: THREE.Mesh[]
  update(time: number, dt: number, focus: THREE.Vector3): void
  /** Re-centre the sun's shadow frustum (split screen calls this once per half). */
  aim(focus: THREE.Vector3): void
  setShadowMap(size: number): void
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return h - Math.floor(h)
}
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash2(xi, zi)
  const b = hash2(xi + 1, zi)
  const c = hash2(xi, zi + 1)
  const d = hash2(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15
}

const LAKES = [
  { x: -112, z: -108, r: 21 },
  { x: 47, z: -64, r: 10 },
  { x: 92, z: 36, r: 22 },
  BRIDGE_LAKE,
]

/** Spatial hash of centre-line samples for fast "distance to the road" queries. */
class RoadField {
  private cells = new Map<string, { x: number; z: number; y: number; w: number; bridge: boolean }[]>()
  constructor(track: Track, private readonly size = 12) {
    for (const [sp, w] of [[track.main, WALL], [track.short, SHORT_WALL]] as const) {
      for (let i = 0; i < sp.samples.length; i += 2) {
        const smp = sp.samples[i]
        const p = smp.pos
        const bridge = sp === track.main && smp.s > track.bridge.from && smp.s < track.bridge.to
        const k = `${Math.floor(p.x / size)},${Math.floor(p.z / size)}`
        let list = this.cells.get(k)
        if (!list) this.cells.set(k, (list = []))
        list.push({ x: p.x, z: p.z, y: p.y, w, bridge })
      }
    }
  }
  /**
   * Distance beyond the wall line (negative = inside the road) and the road height there.
   * `bridge` is true when the nearest road is the bridge deck, which has no embankment below.
   */
  query(x: number, z: number, reach = 3): { d: number; y: number; bridge: boolean } {
    const cx = Math.floor(x / this.size)
    const cz = Math.floor(z / this.size)
    let best = Infinity
    let y = 0
    let bridge = false
    for (let i = -reach; i <= reach; i += 1)
      for (let j = -reach; j <= reach; j += 1) {
        const list = this.cells.get(`${cx + i},${cz + j}`)
        if (!list) continue
        for (const p of list) {
          const d = Math.hypot(p.x - x, p.z - z) - p.w
          if (d < best) {
            best = d
            y = p.y
            bridge = p.bridge
          }
        }
      }
    return { d: best, y, bridge }
  }
}

export function buildScenery(scene: THREE.Scene, track: Track, shadowSize: number): Scenery {
  const rand = rng(20260926)
  const field = new RoadField(track)

  // ── sky & fog ───────────────────────────────────────────────
  scene.fog = new THREE.Fog('#a8c2d4', 170, 560)
  scene.background = new THREE.Color('#a8c2d4')
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0.45, 0.35, -0.8).normalize() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 uSun;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 top = vec3(0.16, 0.36, 0.58);
          vec3 mid = vec3(0.48, 0.68, 0.80);
          vec3 hor = vec3(0.90, 0.95, 0.98);
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.25, h));
          col = mix(col, top, smoothstep(0.25, 0.9, h));
          float s = max(dot(normalize(vDir), uSun), 0.0);
          col += vec3(1.0, 0.88, 0.58) * (pow(s, 64.0) * 1.2 + pow(s, 6.0) * 0.18);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  )
  sky.renderOrder = -10
  scene.add(sky)

  // ── lights ──────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight('#eef7ff', '#5f7589', 0.95))
  const sun = new THREE.DirectionalLight('#fff2cf', 2.75)
  sun.castShadow = true
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -48
  sc.right = sc.top = 48
  sc.near = 10
  sc.far = 220
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.04
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  scene.add(sun, sun.target)
  const sunDir = new THREE.Vector3(0.45, 0.8, -0.55).normalize()
  const rim = new THREE.DirectionalLight('#8ab8d1', 0.6)
  rim.position.set(-0.6, 0.4, 0.8)
  scene.add(rim)

  // ── terrain ─────────────────────────────────────────────────
  // Bounds cover the whole circuit (south campus + north loop) plus the valley rim.
  const X0 = -300
  const X1 = 240
  const Z0 = -310
  const Z1 = 220
  const cell = 3.6
  const nx = Math.ceil((X1 - X0) / cell)
  const nz = Math.ceil((Z1 - Z0) / cell)
  const heights = new Float32Array((nx + 1) * (nz + 1))
  const heightAt = (x: number, z: number) => {
    let h = fbm(x * 0.012, z * 0.012) * 16 - 4 + fbm(x * 0.05 + 7, z * 0.05) * 2.5
    // Rise toward the valley rim so the circuit sits in a bowl.
    const cx = x + 28
    const cz = z + 32
    const rad = Math.hypot(cx * 0.95, cz * 0.9)
    h += THREE.MathUtils.smoothstep(rad, 170, 270) * 26
    for (const l of LAKES) {
      const d = Math.hypot(x - l.x, z - l.z)
      h = Math.min(h, THREE.MathUtils.lerp(-3.2, h, THREE.MathUtils.smoothstep(d, l.r * 0.55, l.r * 1.45)))
    }
    const road = field.query(x, z)
    if (road.d < 40 && !road.bridge) {
      const k = THREE.MathUtils.smoothstep(road.d, 0.5, 14)
      h = THREE.MathUtils.lerp(road.y - 0.45, Math.max(h, road.y - 6), k)
      if (road.d > 0.5) h = Math.max(h, road.y - 0.45 - road.d * 0.6)
    }
    return h
  }
  for (let j = 0; j <= nz; j += 1) for (let i = 0; i <= nx; i += 1) heights[j * (nx + 1) + i] = heightAt(X0 + i * cell, Z0 + j * cell)
  const tpos: number[] = []
  const tcol: number[] = []
  const grassA = new THREE.Color('#6f8f87')
  const grassB = new THREE.Color('#8fb59f')
  const pinkish = new THREE.Color('#7fa6bb')
  const sand = new THREE.Color('#b9c9d1')
  const frost = new THREE.Color('#e6eef4')
  const lilac = new THREE.Color('#667f9a')
  const tmpC = new THREE.Color()
  const pushTri = (ax: number, az: number, bx: number, bz: number, cx2: number, cz2: number, ha: number, hb: number, hc: number) => {
    tpos.push(ax, ha, az, bx, hb, bz, cx2, hc, cz2)
    const mx = (ax + bx + cx2) / 3
    const mz = (az + bz + cz2) / 3
    const mh = (ha + hb + hc) / 3
    const n = fbm(mx * 0.03, mz * 0.03)
    tmpC.copy(grassA).lerp(grassB, THREE.MathUtils.clamp(n * 1.6 - 0.3, 0, 1))
    if (n > 0.74) tmpC.lerp(pinkish, 0.55)
    if (n < 0.25) tmpC.lerp(lilac, 0.35)
    if (mh < -1.2) tmpC.copy(sand)
    if (mh > 16) tmpC.lerp(frost, THREE.MathUtils.clamp((mh - 16) / 6, 0, 1))
    const jitter = 0.94 + hash2(mx, mz) * 0.1
    tmpC.multiplyScalar(jitter)
    for (let k = 0; k < 3; k += 1) tcol.push(tmpC.r, tmpC.g, tmpC.b)
  }
  for (let j = 0; j < nz; j += 1)
    for (let i = 0; i < nx; i += 1) {
      const x0 = X0 + i * cell
      const z0 = Z0 + j * cell
      const h00 = heights[j * (nx + 1) + i]
      const h10 = heights[j * (nx + 1) + i + 1]
      const h01 = heights[(j + 1) * (nx + 1) + i]
      const h11 = heights[(j + 1) * (nx + 1) + i + 1]
      if ((i + j) % 2 === 0) {
        pushTri(x0, z0, x0, z0 + cell, x0 + cell, z0, h00, h01, h10)
        pushTri(x0 + cell, z0, x0, z0 + cell, x0 + cell, z0 + cell, h10, h01, h11)
      } else {
        pushTri(x0, z0, x0, z0 + cell, x0 + cell, z0 + cell, h00, h01, h11)
        pushTri(x0, z0, x0 + cell, z0 + cell, x0 + cell, z0, h00, h11, h10)
      }
    }
  const tgeo = new THREE.BufferGeometry()
  tgeo.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3))
  tgeo.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3))
  tgeo.computeVertexNormals()
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }))
  terrain.receiveShadow = true
  scene.add(terrain)
  const under = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ color: '#2f4354' }))
  under.rotation.x = -Math.PI / 2
  under.position.y = 8
  under.renderOrder = -5
  // Far ring below the rim hides the terrain edge in the fog.
  const ring = new THREE.Mesh(new THREE.RingGeometry(420, 1400, 48), new THREE.MeshBasicMaterial({ color: '#1e4d6b' }))
  ring.rotation.x = -Math.PI / 2
  ring.position.set(-28, 18, -32)
  scene.add(ring)

  // ── training courtyards ──────────────────────────────────────────────
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2b9de9', emissive: '#176da9', emissiveIntensity: 0.25, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true })
  const waters: THREE.Mesh[] = []
  for (const l of LAKES) {
    const g = new THREE.CircleGeometry(l.r * 1.25, 28, 0, Math.PI * 2)
    const w = new THREE.Mesh(g, waterMat)
    w.rotation.x = -Math.PI / 2
    w.position.set(l.x, -1.05, l.z)
    w.receiveShadow = true
    scene.add(w)
    waters.push(w)
  }

  // ── campus landscaping and safety markers ───────────────────
  const place = (count: number, minRoad: number, maxRoad: number, fn: (x: number, z: number, y: number, i: number) => void) => {
    let n = 0
    let tries = 0
    while (n < count && tries < count * 40) {
      tries += 1
      const x = X0 + 20 + rand() * (X1 - X0 - 40)
      const z = Z0 + 20 + rand() * (Z1 - Z0 - 40)
      const road = field.query(x, z, 4)
      if (road.d < minRoad || road.d > maxRoad) continue
      if (LAKES.some(l => Math.hypot(x - l.x, z - l.z) < l.r * 1.2)) continue
      fn(x, z, heightAt(x, z), n)
      n += 1
    }
    return n
  }
  const pastel = ['#e30613', '#ffc400', '#2b9de9', '#ffffff', '#00a99d', '#102a43', '#f15b5d'].map(c => new THREE.Color(c))
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const sv = new THREE.Vector3()

  // Campus flags and marker boards.
  const LOLLI = 90
  const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: '#dbe7f2', flatShading: true, roughness: 0.5 }), LOLLI)
  const candy = new THREE.InstancedMesh(lollipopGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.28 }), LOLLI)
  const nLolli = place(LOLLI, 3, 90, (x, z, y, i) => {
    const h = 3.2 + rand() * 3
    const r = 1.3 + rand() * 1.1
    m4.compose(v.set(x, y + h / 2, z), q.identity(), sv.set(1, h, 1))
    sticks.setMatrixAt(i, m4)
    q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.2))
    m4.compose(v.set(x, y + h + r * 0.7, z), q, sv.set(r, r, r))
    candy.setMatrixAt(i, m4)
    candy.setColorAt(i, pastel[i % pastel.length])
  })
  sticks.count = candy.count = nLolli
  for (const m of [sticks, candy]) {
    m.castShadow = true
    m.receiveShadow = true
    scene.add(m)
  }

  // Low landscaping domes.
  const GUM = 220
  const gum = new THREE.InstancedMesh(gumdropGeometry(), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.3 }), GUM)
  gum.count = place(GUM, 1.2, 120, (x, z, y, i) => {
    const s = 0.8 + rand() * 1.6
    m4.compose(v.set(x, y - 0.1, z), q.setFromEuler(new THREE.Euler(0, rand() * 6, 0)), sv.set(s, s * (0.8 + rand() * 0.4), s))
    gum.setMatrixAt(i, m4)
    gum.setColorAt(i, pastel[Math.floor(rand() * pastel.length)])
  })
  gum.castShadow = true
  gum.receiveShadow = true
  scene.add(gum)

  // Safety cones.
  const CANE = 28
  const cane = new THREE.InstancedMesh(caneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35 }), CANE)
  cane.count = place(CANE, 4, 70, (x, z, y, i) => {
    const s = 1.4 + rand() * 1.4
    m4.compose(v.set(x, y - 0.3, z), q.setFromEuler(new THREE.Euler(0, rand() * 6, 0)), sv.set(s, s, s))
    cane.setMatrixAt(i, m4)
  })
  cane.castShadow = true
  scene.add(cane)

  // Concrete training blocks.
  const MALLOW = 60
  const mallow = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1.1, 9), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), MALLOW)
  const mallowCols = ['#dbe7f2', '#b9cbd5', '#9db4c4', '#f0f4f6'].map(c => new THREE.Color(c))
  mallow.count = place(MALLOW, 1.5, 60, (x, z, y, i) => {
    const s = 0.7 + rand() * 1.2
    m4.compose(v.set(x, y + 0.35 * s, z), q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4)), sv.set(s, s, s))
    mallow.setMatrixAt(i, m4)
    mallow.setColorAt(i, mallowCols[i % mallowCols.length])
  })
  mallow.castShadow = true
  mallow.receiveShadow = true
  scene.add(mallow)

  // Distant technical buildings.
  const cupcakes = new THREE.Group()
  const cupCols = ['#6b8798', '#9ab2c1', '#4f7188', '#d7e2e8', '#e30613']
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2 + 0.3
    const R = 300 + (i % 3) * 40
    const x = -28 + Math.cos(a) * R * 1.05
    const z = -32 + Math.sin(a) * R
    const s = 28 + (i % 4) * 9
    const cup = cupcake(cupCols[i % cupCols.length], s)
    cup.position.set(x, 8 + (i % 2) * 6, z)
    cup.rotation.y = a
    cupcakes.add(cup)
  }
  scene.add(cupcakes)
  buildCampusStructures(scene, track)

  // High coastal clouds.
  const clouds = new THREE.Group()
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#f3f8fb', emissive: '#dbe7f2', emissiveIntensity: 0.35, flatShading: true, roughness: 1, fog: true })
  const puff = new THREE.IcosahedronGeometry(1, 1)
  for (let i = 0; i < 18; i += 1) {
    const c = new THREE.Group()
    const n = 4 + Math.floor(rand() * 4)
    for (let k = 0; k < n; k += 1) {
      const m = new THREE.Mesh(puff, cloudMat)
      const s = 5 + rand() * 7
      m.scale.set(s * 1.3, s * 0.8, s)
      m.position.set((k - n / 2) * 7 + rand() * 3, rand() * 3, rand() * 5)
      c.add(m)
    }
    c.position.set(-320 + rand() * 600, 70 + rand() * 50, -340 + rand() * 560)
    c.userData.speed = 1 + rand() * 2
    clouds.add(c)
  }
  scene.add(clouds)

  // ── landmarks ───────────────────────────────────────────────
  // A stylised SENAI Pompéia gate marks the highest turn of the circuit.
  const gate = new THREE.Group()
  const gateBlue = new THREE.MeshStandardMaterial({ color: '#1e4d6b', flatShading: true, roughness: 0.55 })
  const gateRed = new THREE.MeshStandardMaterial({ color: '#e30613', flatShading: true, roughness: 0.45 })
  const gateYellow = new THREE.MeshStandardMaterial({ color: '#ffc400', flatShading: true, roughness: 0.5 })
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 15, 2.8), gateBlue)
    pillar.position.set(side * 12, 7.5, 0)
    pillar.castShadow = pillar.receiveShadow = true
    gate.add(pillar)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.2, 3.0), gateRed)
    stripe.position.set(side * 12, 10.2, 0)
    stripe.castShadow = true
    gate.add(stripe)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(27, 2.8, 3.2), gateRed)
  lintel.position.y = 14
  lintel.castShadow = true
  gate.add(lintel)
  const gateSign = new THREE.Mesh(new THREE.BoxGeometry(20, 1.8, 0.18), new THREE.MeshStandardMaterial({ map: campusLabelTexture('SENAI POMPÉIA', '#e30613', '#ffffff'), roughness: 0.55 }))
  gateSign.position.set(0, 14, -1.7)
  gate.add(gateSign)
  const gateBadge = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.22, 8), gateYellow)
  gateBadge.rotation.x = Math.PI / 2
  gateBadge.position.set(0, 10.7, -1.72)
  gate.add(gateBadge)
  gate.position.copy(track.landmarks.arch).setY(track.landmarks.arch.y - 1.5)
  gate.rotation.y = track.landmarks.archYaw
  scene.add(gate)

  // Start gantry: blue/yellow safety pillars and a SENAI race banner with the race lights.
  const gantry = new THREE.Group()
  const s0 = track.main.at(0)
  const pillarGeo = stripedCylinder(0.7, 9.5, 14)
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4 }))
    p.position.copy(s0.pos).addScaledVector(s0.right, side * (WALL + 1.1))
    p.position.y += 4.75
    p.castShadow = true
    gantry.add(p)
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: '#ffc400', flatShading: true, roughness: 0.3 }))
    ball.position.copy(p.position).setY(p.position.y + 5.3)
    gantry.add(ball)
  }
  const bannerTex = bannerTexture()
  const banner = new THREE.Mesh(new THREE.BoxGeometry((WALL + 1.1) * 2, 2.6, 0.6), [
    new THREE.MeshStandardMaterial({ color: '#e30613' }),
    new THREE.MeshStandardMaterial({ color: '#e30613' }),
    new THREE.MeshStandardMaterial({ color: '#e30613' }),
    new THREE.MeshStandardMaterial({ color: '#e30613' }),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }),
  ])
  banner.position.copy(s0.pos).setY(s0.pos.y + 8.3)
  banner.rotation.y = Math.atan2(s0.tan.x, s0.tan.z)
  banner.castShadow = true
  gantry.add(banner)
  const startLights: THREE.Mesh[] = []
  for (let i = 0; i < 3; i += 1) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: '#3a2440', toneMapped: false }))
    l.position.copy(banner.position).addScaledVector(s0.right, (i - 1) * 1.6).addScaledVector(s0.tan, -0.32)
    l.position.y -= 2.1
    l.rotation.y = banner.rotation.y + Math.PI
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), new THREE.MeshStandardMaterial({ color: '#102a43' }))
    back.position.copy(l.position).addScaledVector(s0.tan, 0.02)
    back.rotation.y = l.rotation.y
    gantry.add(back, l)
    startLights.push(l)
  }
  scene.add(gantry)

  // Bleachers with bouncing critter students beside the start straight.
  const fans: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[] } = { mesh: new THREE.InstancedMesh(fanGeometry(), TOON, 60), base: [], phase: [] }
  const bleacher = new THREE.MeshStandardMaterial({ color: '#5470a8', flatShading: true, roughness: 0.7 })
  let fanCount = 0
  for (const [sAt, side] of [[14, 1], [40, -1], [62, 1]] as const) {
    const smp = track.main.at(sAt)
    const yaw = Math.atan2(smp.tan.x, smp.tan.z)
    for (let row = 0; row < 3; row += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 2.2), bleacher)
      step.position.copy(smp.pos).addScaledVector(smp.right, side * (WALL + 4 + row * 2.2))
      step.position.y += 0.5 + row * 1
      step.scale.y = 1 + row
      step.position.y = smp.pos.y + (1 + row) * 0.5
      step.rotation.y = yaw
      step.castShadow = step.receiveShadow = true
      scene.add(step)
      for (let k = 0; k < 7 && fanCount < 60; k += 1) {
        const p = smp.pos.clone().addScaledVector(smp.right, side * (WALL + 4 + row * 2.2)).addScaledVector(smp.tan, (k - 3) * 3 + (rand() - 0.5))
        p.y = smp.pos.y + (1 + row) + 0.05
        const mm = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 0)), new THREE.Vector3(1, 1, 1))
        fans.base.push(mm)
        fans.phase.push(rand() * 10)
        fans.mesh.setMatrixAt(fanCount, mm)
        fans.mesh.setColorAt(fanCount, pastel[fanCount % pastel.length])
        fanCount += 1
      }
    }
  }
  fans.mesh.count = fanCount
  fans.mesh.castShadow = true
  scene.add(fans.mesh)

  // Workshop shortcut signpost.
  const sign = new THREE.Group()
  const sp = track.short.at(3)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 6), new THREE.MeshStandardMaterial({ color: '#dbe7f2' }))
  post.position.y = 1.8
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 0.2), [
    new THREE.MeshStandardMaterial({ color: '#ffc400' }),
    new THREE.MeshStandardMaterial({ color: '#ffc400' }),
    new THREE.MeshStandardMaterial({ color: '#ffc400' }),
    new THREE.MeshStandardMaterial({ color: '#ffc400' }),
    new THREE.MeshStandardMaterial({ map: arrowTexture() }),
    new THREE.MeshStandardMaterial({ color: '#ffc400' }),
  ])
  board.position.y = 3.4
  sign.add(post, board)
  const main0 = track.main.closest(sp.pos)
  const mainS = track.main.at(main0.s)
  sign.position.copy(mainS.pos).addScaledVector(mainS.right, Math.sign(main0.lateral) * -1 * (WALL + 1.2) * -1)
  sign.position.copy(sp.pos).addScaledVector(sp.right, 0).add(new THREE.Vector3())
  sign.position.copy(track.main.pointAt(main0.s - 18, Math.sign(main0.lateral || 1) * (WALL + 1.3)))
  sign.rotation.y = track.main.yawAt(main0.s - 18) + Math.PI
  sign.traverse(o => (o.castShadow = true))
  scene.add(sign)

  const setShadowMap = (size: number) => {
    sun.shadow.mapSize.set(size, size)
    sun.shadow.map?.dispose()
    sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
  }

  return {
    sun,
    startLights,
    setShadowMap,
    aim(focus) {
      sun.position.copy(focus).addScaledVector(sunDir, 110)
      sun.target.position.copy(focus)
      sun.target.updateMatrixWorld()
    },
    update(time, dt, focus) {
      this.aim(focus)
      for (const w of waters) w.position.y = -1.05 + Math.sin(time * 0.8 + w.position.x) * 0.06
      for (const c of clouds.children) {
        c.position.x += c.userData.speed * dt
        if (c.position.x > 280) c.position.x = -320
      }
      const tmp = new THREE.Matrix4()
      for (let i = 0; i < fans.base.length; i += 1) {
        const hop = Math.max(0, Math.sin(time * 7 + fans.phase[i])) * 0.35
        tmp.copy(fans.base[i])
        tmp.elements[13] += hop
        fans.mesh.setMatrixAt(i, tmp)
      }
      fans.mesh.instanceMatrix.needsUpdate = true
      void under
    },
  }
}

function lollipopGeometry(): THREE.BufferGeometry {
  // Flat safety marker board: instance colours carry the SENAI accents.
  return new THREE.BoxGeometry(1.8, 1.05, 0.16)
}

function gumdropGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6
    pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(t * Math.PI * 0.5) * (1 - t * 0.15)), Math.sin(t * Math.PI * 0.5) * 1.15))
  }
  pts.unshift(new THREE.Vector2(0.001, 0))
  return new THREE.LatheGeometry(pts, 8)
}

function caneGeometry(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(0.55, 1.8, 6)
}

function stripedCylinder(r: number, h: number, bands: number): THREE.BufferGeometry {
  const g = flat(new THREE.CylinderGeometry(r, r, h, 10, bands * 2))
  const pos = g.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  const red = new THREE.Color('#e30613')
  const white = new THREE.Color('#ffc400')
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    const c = Math.sin(y * 2.2 + Math.atan2(z, x)) > 0 ? red : white
    for (let k = 0; k < 3; k += 1) col.set([c.r, c.g, c.b], (i + k) * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

function buildCampusStructures(scene: THREE.Scene, track: Track): void {
  const wallColors = ['#dce6eb', '#b9cbd5', '#91adbc', '#f0f4f6']
  const roofColors = ['#1e4d6b', '#e30613', '#5470a8', '#102a43']
  const structure = (distance: number, lateral: number, width: number, depth: number, height: number, label: string, index: number) => {
    const sample = track.main.at(distance)
    // Keep every corner clear of all roads and lakes; try the other side of the track before giving up.
    const clear = (lat: number) => {
      const c = sample.pos.clone().addScaledVector(sample.right, lat)
      const along = sample.tan.clone().setY(0).normalize()
      return [-1, 1].every(a => [-1, 1].every(b => {
        const p = c.clone().addScaledVector(along, (a * width) / 2).addScaledVector(sample.right, (b * depth) / 2)
        const dry = LAKES.every(l => Math.hypot(p.x - l.x, p.z - l.z) > l.r * 1.4)
        return dry && track.main.closest(p).distance > WALL + 3 && track.short.closest(p).distance > SHORT_WALL + 3
      }))
    }
    if (!clear(lateral)) {
      if (clear(-lateral)) lateral = -lateral
      else return
    }
    const g = new THREE.Group()
    g.position.copy(sample.pos).addScaledVector(sample.right, lateral)
    g.position.y -= 0.4
    g.rotation.y = Math.atan2(sample.tan.x, sample.tan.z)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: wallColors[index % wallColors.length], flatShading: true, roughness: 0.78 }))
    wall.position.y = height / 2
    wall.castShadow = wall.receiveShadow = true
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.3, depth + 0.8), new THREE.MeshStandardMaterial({ color: roofColors[index % roofColors.length], flatShading: true, roughness: 0.48 }))
    roof.position.y = height + 0.15
    roof.castShadow = true
    const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 1.25, 0.16), new THREE.MeshStandardMaterial({ map: campusLabelTexture(label, '#e30613', '#ffffff'), roughness: 0.58 }))
    sign.position.set(0, height * 0.7, -depth / 2 - 0.1)
    sign.castShadow = true
    g.add(wall, roof, sign)
    const windowMat = new THREE.MeshStandardMaterial({ color: '#2b9de9', emissive: '#176da9', emissiveIntensity: 0.18, flatShading: true, roughness: 0.3 })
    for (let row = 0; row < 2; row += 1) for (let col = -1; col <= 1; col += 1) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(width * 0.16, 0.75, 0.08), windowMat)
      win.position.set(col * width * 0.27, height * (0.35 + row * 0.23), -depth / 2 - 0.08)
      g.add(win)
    }
    scene.add(g)
  }
  structure(track.length * 0.14, 24, 18, 11, 7, 'OFICINAS', 0)
  structure(track.length * 0.37, -25, 22, 13, 8, 'ROBOTICA', 1)
  structure(track.length * 0.62, 25, 20, 12, 7, 'OFICINA 4.0', 2)
  structure(track.length * 0.83, -23, 17, 10, 6, 'LAB SENAI', 3)
  structure(track.length * 0.66, 26, 20, 12, 8, 'MECATRONICA', 0)
  structure(track.length * 0.74, -26, 22, 12, 7, 'AUTOMOTIVA', 1)
  structure(track.length * 0.95, 24, 18, 11, 6, 'ELETRICA', 2)
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 1.1, 6), new THREE.MeshStandardMaterial({ color: '#e30613', flatShading: true, roughness: 0.7 }), 24)
  const matrix = new THREE.Matrix4()
  let n = 0
  for (const distance of [track.length * 0.18, track.length * 0.49, track.length * 0.7]) {
    const sample = track.main.at(distance)
    for (const side of [-1, 1]) for (const ahead of [-2.4, 2.4]) {
      const point = sample.pos.clone().addScaledVector(sample.right, side * (WALL + 3.4)).addScaledVector(sample.tan, ahead)
      matrix.makeTranslation(point.x, point.y + 0.55, point.z)
      cone.setMatrixAt(n++, matrix)
    }
  }
  cone.count = n
  cone.castShadow = true
  scene.add(cone)
}

function cupcake(frosting: string, s: number): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(s * 1.55, s * 1.1, s * 1.05), new THREE.MeshStandardMaterial({ color: '#718a99', flatShading: true, roughness: 0.85 }))
  body.position.y = s * 0.55
  const roof = new THREE.Mesh(new THREE.BoxGeometry(s * 1.7, s * 0.24, s * 1.2), new THREE.MeshStandardMaterial({ color: frosting, flatShading: true, roughness: 0.55 }))
  roof.position.y = s * 1.16
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.24, s * 0.24, s * 0.55, 8), new THREE.MeshStandardMaterial({ color: '#dbe7f2', flatShading: true, roughness: 0.35 }))
  tank.position.y = s * 1.52
  g.add(body, roof, tank)
  return g
}

function fanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = flat(new THREE.CapsuleGeometry(0.42, 0.5, 2, 7))
  body.translate(0, 0.72, 0)
  const earL = flat(new THREE.IcosahedronGeometry(0.17, 0))
  earL.translate(0.25, 1.38, 0)
  const earR = earL.clone()
  earR.translate(-0.5, 0, 0)
  const eyeL = flat(new THREE.IcosahedronGeometry(0.06, 0))
  eyeL.translate(0.14, 1.05, 0.38)
  const eyeR = eyeL.clone()
  eyeR.translate(-0.28, 0, 0)
  const white = (g: THREE.BufferGeometry, c: number) => {
    const n = g.getAttribute('position').count
    g.deleteAttribute('uv')
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(c), 3))
    parts.push(g)
  }
  white(body, 1)
  white(earL, 0.8)
  white(earR, 0.8)
  white(eyeL, 0.05)
  white(eyeR, 0.05)
  let merged = parts[0]
  const all = parts.map(p => p)
  const positions: number[] = []
  const colors: number[] = []
  for (const p of all) {
    positions.push(...(p.getAttribute('position').array as Float32Array))
    colors.push(...(p.getAttribute('color').array as Float32Array))
  }
  merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  merged.computeVertexNormals()
  return merged
}

function campusLabelTexture(text: string, background: string, foreground: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = background
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = foreground
  g.font = '900 38px Sora, "Noto Sans SC", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c.width / 2, c.height / 2 + 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')!
  for (let i = 0; i < 32; i += 1) {
    g.fillStyle = i % 2 ? '#ffffff' : '#ffc400'
    g.fillRect(i * 32, 0, 32, 16)
    g.fillStyle = i % 2 ? '#ffc400' : '#ffffff'
    g.fillRect(i * 32, 112, 32, 16)
  }
  g.fillStyle = '#e30613'
  g.fillRect(0, 16, 1024, 96)
  g.font = '900 64px Sora, "Noto Sans SC", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 12
  g.strokeStyle = '#102a43'
  g.lineJoin = 'round'
  g.strokeText('SENAI RUSH · SENAI 庞贝', 512, 66)
  g.fillStyle = '#ffffff'
  g.fillText('SENAI RUSH · SENAI 庞贝', 512, 66)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function arrowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#2b9de9'
  g.fillRect(0, 0, 256, 128)
  g.strokeStyle = '#102a43'
  g.lineWidth = 10
  g.strokeRect(5, 5, 246, 118)
  g.fillStyle = '#ffc400'
  g.strokeStyle = '#102a43'
  g.lineWidth = 8
  g.beginPath()
  g.moveTo(40, 50)
  g.lineTo(150, 50)
  g.lineTo(150, 22)
  g.lineTo(215, 64)
  g.lineTo(150, 106)
  g.lineTo(150, 78)
  g.lineTo(40, 78)
  g.closePath()
  g.fill()
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
