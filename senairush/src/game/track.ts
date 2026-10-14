import * as THREE from 'three'
import { COLLISION, groups, type SurfaceInfo } from '../engine/kart'
import type { Physics } from '../engine/physics'
import { TrackSpline } from '../engine/spline'
import { CONFIG } from './config'

/**
 * SENAI Pompéia: the one hand-authored technical-campus circuit. Layout is data (control points + feature
 * anchors by world position); meshes, colliders, walls with branch gaps, the minimap and all
 * lookups are generated from the splines so tweaking a point keeps everything consistent.
 */
// [x, z, y]
export const MAIN_POINTS: [number, number, number][] = [
  [-40, 0, 0], [30, 0, 0], [75, -10, 0], [98, -45, 0.5], [95, -90, 1], [70, -118, 1], [35, -120, 1], [12, -100, 1.5], [10, -70, 2],
  [-10, -48, 2.5], [-40, -45, 3], [-62, -65, 5], [-72, -100, 7.5], [-80, -140, 4], [-100, -165, 1.5],
  // South-west quarry canyon: jump over the ravine → spinning turbines → boost slalom.
  [-98, -205, 2], [-118, -250, 4], [-165, -280, 2.5], [-220, -272, 3], [-255, -232, 2], [-258, -182, 1.5], [-228, -150, 1], [-188, -150, 1],
  [-155, -135, 1],
  [-150, -90, 0.5], [-128, -45, 0],
  // North loop: hill climb → plateau jump → high bridge over the lake → chicane → workshop tunnel
  // with the stamping presses → wide U-turn back onto the start straight.
  [-145, -5, 1], [-150, 35, 3], [-130, 70, 6], [-95, 95, 9], [-50, 105, 10], [-5, 100, 8], [33, 90, 6], [54, 68, 4.5], [46, 46, 3.8],
  [18, 38, 3], [-15, 42, 2], [-60, 48, 1], [-92, 47, 0.6], [-110, 38, 0.4], [-115, 22, 0.2], [-106, 7, 0], [-88, 1, 0],
]
/** Lake under the north bridge (world XZ, radius); scenery carves and fills it. */
export const BRIDGE_LAKE = { x: 14, z: 96, r: 19 }
/** Shortcut: leaves the inside of the east sweep and rejoins before the south hairpin. */
export const SHORTCUT = { from: [84, -22] as const, via: [[74, -50, 0.4], [69, -82, 0.8]] as [number, number, number][], to: [55, -110] as const }

export const HALF_WIDTH = 8
export const SHOULDER = 2.4
export const WALL = HALF_WIDTH + SHOULDER + 0.5
export const SHORT_HALF = 4.6
export const SHORT_WALL = SHORT_HALF + 0.9

export type PathId = 'main' | 'short'
export type Pad = { path: PathId; s: number; lateral: number; length: number; width: number }
export type Ramp = { s: number; length: number; width: number; lip: number }
/** Workshop stamping press: slams onto the road on a cycle and squashes whoever is under it. */
export type Press = { s: number; lateral: number; size: number; period: number; phase: number }
/** Quarry turbine: a bar spinning flat across the road around a post in the middle. */
export type Spinner = { s: number; radius: number; speed: number; phase: number }
export type ItemSpot = { pos: THREE.Vector3; path: PathId; mainS: number }

export type Loc = {
  path: PathId
  s: number
  lateral: number
  /** Distance along the main loop (shortcut positions are mapped onto it). */
  mainS: number
  half: number
  height: number
  distance: number
}

/** Per-racer tracking hints so lookups stay local. */
export class Tracker {
  hintMain = -1
  hintShort = -1
  loc: Loc = { path: 'main', s: 0, lateral: 0, mainS: 0, half: HALF_WIDTH, height: 0, distance: 0 }
}

const ROAD = new THREE.Color('#3f5668')
const ROAD_2 = new THREE.Color('#2f4354')
const LANE = new THREE.Color('#f7f9fb')
const KERB_A = new THREE.Color('#e30613')
const KERB_B = new THREE.Color('#ffc400')
const SHOULDER_BASE = new THREE.Color('#9db4c4')
const SPRINKLES = ['#e30613', '#ffc400', '#2b9de9', '#ffffff', '#00a99d'].map(c => new THREE.Color(c))
const CARAMEL = new THREE.Color('#8aa3b5')
const FLUFF = new THREE.Color('#c4dce9')

export class Track {
  readonly main: TrackSpline
  readonly short: TrackSpline
  readonly group = new THREE.Group()
  readonly pads: Pad[] = []
  readonly ramps: Ramp[] = []
  readonly itemSpots: ItemSpot[] = []
  readonly presses: Press[] = []
  readonly spinners: Spinner[] = []
  /** Main-loop s-ranges with no road at all (the ravine jump). */
  readonly gaps: { from: number; to: number }[] = []
  private readonly spinnerViews: THREE.Object3D[] = []
  /** Main-loop s-range carried by the bridge (no ground underneath). */
  readonly bridge: { from: number; to: number }
  /** Main-loop s-range under the workshop roof. */
  readonly tunnel: { from: number; to: number }
  private readonly pressViews: { head: THREE.Object3D; rod: THREE.Mesh; shadow: THREE.Mesh; top: number }[] = []
  /** Shortcut s-range (fraction of its length) covered with a slick workshop-floor detour. */
  readonly fluff = { from: 0.36, to: 0.7 }
  readonly shortMap: { start: number; end: number }
  readonly padMeshes: THREE.Mesh[] = []
  readonly landmarks: { arch: THREE.Vector3; archYaw: number; ramp: THREE.Vector3 }
  private readonly shortBox = new THREE.Box3()
  private readonly chevron: THREE.CanvasTexture

  constructor(private readonly physics: Physics) {
    this.main = new TrackSpline(MAIN_POINTS.map(([x, z, y]) => ({ x, y, z })), { closed: true, step: 1, halfWidth: HALF_WIDTH })
    const L = this.main.length
    const sA = this.main.closest(new THREE.Vector3(SHORTCUT.from[0], 0, SHORTCUT.from[1])).s
    const sB = this.main.closest(new THREE.Vector3(SHORTCUT.to[0], 1, SHORTCUT.to[1])).s
    const probe = this.main.closest(new THREE.Vector3(SHORTCUT.via[0][0], 0, SHORTCUT.via[0][1]))
    const inner = Math.sign(probe.lateral) || 1
    // Branch mouths follow the main road's tangent before peeling away, so the split reads as a
    // clear fork and karts never meet a wall end head-on.
    const pts = [
      this.main.pointAt(sA - 20, inner * 2.5),
      this.main.pointAt(sA - 8, inner * 6),
      this.main.pointAt(sA + 4, inner * 11.5),
      ...SHORTCUT.via.map(([x, z, y]) => new THREE.Vector3(x, y, z)),
      this.main.pointAt(sB - 4, inner * 11.5),
      this.main.pointAt(sB + 8, inner * 6),
      this.main.pointAt(sB + 20, inner * 2.5),
    ]
    this.short = new TrackSpline(pts, { closed: false, step: 1, halfWidth: SHORT_HALF })
    this.shortMap = { start: this.main.wrap(sA - 20), end: this.main.wrap(sB + 20) }
    for (const smp of this.short.samples) this.shortBox.expandByPoint(smp.pos)
    this.shortBox.expandByScalar(SHORT_WALL + 2)
    this.chevron = chevronTexture()

    // Feature anchors by world position (robust to spline edits).
    const sAt = (x: number, z: number) => this.main.closest(new THREE.Vector3(x, 0, z)).s
    const crest = sAt(-72, -100)
    this.ramps.push({ s: crest + 9, length: 8, width: 7.2, lip: 1.35 })
    this.pads.push({ path: 'main', s: crest + 1.5, lateral: 0, length: 5, width: 5.5 })
    this.pads.push({ path: 'main', s: sAt(10, -78), lateral: -3, length: 5, width: 4.5 })
    this.pads.push({ path: 'main', s: sAt(-150, -96), lateral: 3.5, length: 5, width: 4.5 })
    this.pads.push({ path: 'short', s: this.short.length * 0.25, lateral: 0, length: 5, width: 5 })
    // North loop features.
    this.pads.push({ path: 'main', s: sAt(-149, 15), lateral: -3, length: 5, width: 4.5 })
    this.pads.push({ path: 'main', s: sAt(-140, 55), lateral: 3, length: 5, width: 4.5 })
    const plateau = sAt(-62, 104)
    this.ramps.push({ s: plateau + 6, length: 9, width: 8, lip: 1.6 })
    this.pads.push({ path: 'main', s: plateau - 2, lateral: 0, length: 5, width: 6 })
    const mid = this.main.closest(new THREE.Vector3(BRIDGE_LAKE.x, 0, BRIDGE_LAKE.z)).s
    this.bridge = { from: mid - 27, to: mid + 27 }
    this.pads.push({ path: 'main', s: mid, lateral: 0, length: 5, width: 5 })
    const t0 = sAt(-17, 42)
    const t1 = sAt(-58, 48)
    this.tunnel = { from: t0, to: t1 }
    const span = t1 - t0
    ;[
      { f: 0.25, lateral: -3.6, phase: 0 },
      { f: 0.5, lateral: 3.6, phase: 0.33 },
      { f: 0.75, lateral: 0, phase: 0.66 },
    ].forEach(p => this.presses.push({ s: t0 + span * p.f, lateral: p.lateral, size: 5.2, period: 3.2, phase: p.phase }))
    this.pads.push({ path: 'main', s: t1 + 6, lateral: 0, length: 5, width: 5 })
    // Quarry canyon: boost pad → ramp → 10 m ravine → landing.
    const jump = this.main.closest(new THREE.Vector3(-138, 0, -263)).s
    this.pads.push({ path: 'main', s: jump - 16, lateral: 0, length: 6, width: 8 })
    this.ramps.push({ s: jump, length: 10, width: HALF_WIDTH * 2, lip: 1.9 })
    this.gaps.push({ from: jump + 0.5, to: jump + 10.5 })
    // Two turbines on the canyon's west wall, turning opposite ways.
    const t = sAt(-257, -205)
    // Bars stop 3 m short of each wall: hug the edge or time the gap.
    this.spinners.push({ s: t - 14, radius: 5, speed: 1.1, phase: 0 })
    this.spinners.push({ s: t + 16, radius: 5, speed: -1.25, phase: 1.2 })
    // Boost slalom along the canyon exit.
    const sl = sAt(-226, -150)
    ;[-4, 4, -4].forEach((lat, i) => this.pads.push({ path: 'main', s: sl + i * 11, lateral: lat, length: 5, width: 4.2 }))

    const row = (s: number, lats = [-5.4, -1.8, 1.8, 5.4]) => {
      for (const lat of lats) this.itemSpots.push({ pos: this.main.pointAt(s, lat).add(new THREE.Vector3(0, 1.1, 0)), path: 'main', mainS: this.main.wrap(s) })
    }
    row(sAt(12, 0))
    row(sAt(-30, -44))
    row(sAt(-152, -118))
    row(sAt(-122, 79))
    row(sAt(30, 39))
    row(sAt(-112, 30))
    row(sAt(-100, -222))
    row(sAt(-250, -168))
    for (const lat of [-1.6, 1.6]) {
      const s = this.short.length * 0.83
      this.itemSpots.push({ pos: this.short.pointAt(s, lat).add(new THREE.Vector3(0, 1.1, 0)), path: 'short', mainS: this.mapShort(s) })
    }

    this.buildRoad()
    this.buildShortcut()
    this.buildWalls()
    this.buildPads()
    this.buildRamps()
    this.buildBridge()
    this.buildWorkshop()
    this.buildSpinners()
    this.buildStartLine()
    const archS = crest - 10
    this.landmarks = { arch: this.main.pointAt(archS), archYaw: this.main.yawAt(archS), ramp: this.main.pointAt(this.ramps[0].s) }
    void L
  }

  get length(): number {
    return this.main.length
  }

  mapShort(s: number): number {
    const span = this.main.delta(this.shortMap.start, this.shortMap.end)
    return this.main.wrap(this.shortMap.start + (s / this.short.length) * span)
  }

  /** Where is `pos` on the circuit? Uses and updates the tracker's hints. */
  locate(pos: THREE.Vector3, t: Tracker): Loc {
    const cm = this.main.closest(pos, t.hintMain)
    t.hintMain = cm.index
    let loc: Loc = { path: 'main', s: cm.s, lateral: cm.lateral, mainS: cm.s, half: HALF_WIDTH, height: cm.height, distance: cm.distance }
    if (this.shortBox.containsPoint(pos)) {
      const cs = this.short.closest(pos, t.hintShort)
      t.hintShort = cs.index
      const offMain = Math.abs(cm.lateral) > WALL - 0.2
      if (offMain && Math.abs(cs.lateral) < SHORT_WALL + 1.5 && cs.s > 1 && cs.s < this.short.length - 1) {
        loc = { path: 'short', s: cs.s, lateral: cs.lateral, mainS: this.mapShort(cs.s), half: SHORT_HALF, height: cs.height, distance: cs.distance }
      }
    } else t.hintShort = -1
    t.loc = loc
    return loc
  }

  surface(loc: Loc): SurfaceInfo {
    let speedMul = 1
    let gripMul = 1
    if (Math.abs(loc.lateral) > loc.half + 0.25) {
      speedMul = CONFIG.surface.offroadSpeed
      gripMul = CONFIG.surface.offroadGrip
    }
    if (loc.path === 'short') {
      const f = loc.s / this.short.length
      if (f > this.fluff.from && f < this.fluff.to) {
        speedMul = Math.min(speedMul, CONFIG.surface.fluffSpeed)
        gripMul = 0.85
      }
    }
    let boostPad = false
    for (const p of this.pads) {
      if (p.path !== loc.path) continue
      const spline = p.path === 'main' ? this.main : this.short
      const ds = spline.delta(p.s, loc.s)
      if (ds >= -p.length / 2 && ds <= p.length / 2 && Math.abs(loc.lateral - p.lateral) < p.width / 2) boostPad = true
    }
    return { speedMul, gripMul, boostPad }
  }

  /** Safe respawn: centre of the path near the given location, facing forward. */
  respawn(loc: Loc, back = 6): { pos: THREE.Vector3; yaw: number } {
    const spline = loc.path === 'main' ? this.main : this.short
    const s = loc.path === 'main' ? loc.s - back : Math.max(2, loc.s - back)
    const pos = spline.pointAt(s, THREE.MathUtils.clamp(loc.lateral * 0.3, -2, 2))
    // Keep away from the ramp lip.
    for (const r of this.ramps) if (loc.path === 'main' && Math.abs(this.main.delta(r.s, s)) < r.length + 3) pos.copy(this.main.pointAt(r.s - r.length - 4, 4))
    // Never put anyone back over the ravine: drop them before the run-up instead.
    for (const g of this.gaps) {
      if (loc.path === 'main' && this.main.delta(g.from - 22, s) > 0 && this.main.delta(s, g.to + 2) > 0) {
        pos.copy(this.main.pointAt(g.from - 24, 0))
        return { pos, yaw: this.main.yawAt(g.from - 24) }
      }
    }
    return { pos, yaw: spline.yawAt(s) }
  }

  /** Grid slot `i` (0 = pole) behind the start line. */
  gridSlot(i: number): { pos: THREE.Vector3; yaw: number; s: number } {
    const row = Math.floor(i / 2)
    const col = i % 2
    const s = this.main.length - 7 - row * 7 - col * 3.2
    return { pos: this.main.pointAt(s, col === 0 ? -3.4 : 3.4), yaw: this.main.yawAt(s), s }
  }

  /** Minimap polylines in world XZ. */
  outline(step = 5): { main: [number, number][]; short: [number, number][] } {
    const main: [number, number][] = []
    for (let s = 0; s < this.main.length; s += step) {
      const p = this.main.pointAt(s)
      main.push([p.x, p.z])
    }
    const short: [number, number][] = []
    for (let s = 0; s <= this.short.length; s += step) {
      const p = this.short.pointAt(s)
      short.push([p.x, p.z])
    }
    return { main, short }
  }

  updateVisuals(time: number): void {
    this.chevron.offset.y = -time * 1.6
    for (const m of this.padMeshes) (m.material as THREE.MeshBasicMaterial).color.setScalar(0.85 + Math.sin(time * 8) * 0.15)
    this.spinners.forEach((sp, i) => (this.spinnerViews[i].rotation.y = this.spinnerAngle(sp, time)))
    this.presses.forEach((p, i) => {
      const v = this.pressViews[i]
      const lift = this.pressLift(p, time)
      // Telegraph: a shiver just before it drops.
      const t = this.pressCycle(p, time)
      const shake = t > 0.42 && t < 0.55 ? Math.sin(time * 70) * 0.12 : 0
      v.head.position.y = 0.75 + lift * (v.top - 2.6) + shake
      v.rod.scale.y = Math.max(0.05, v.top - v.head.position.y)
      v.rod.position.y = v.head.position.y + v.rod.scale.y / 2
      const m = v.shadow.material as THREE.MeshBasicMaterial
      m.opacity = 0.15 + (1 - lift) * 0.45
      v.shadow.scale.setScalar(0.75 + (1 - lift) * 0.35)
    })
  }

  // ─── stamping presses ───────────────────────────────────────────────

  private pressCycle(p: Press, time: number): number {
    const t = time / p.period + p.phase
    return t - Math.floor(t)
  }

  /** 1 = parked at the top, 0 = slammed on the road. */
  pressLift(p: Press, time: number): number {
    const t = this.pressCycle(p, time)
    if (t < 0.55) return 1
    if (t < 0.63) return 1 - Math.pow((t - 0.55) / 0.08, 2)
    if (t < 0.8) return 0
    return THREE.MathUtils.smoothstep(t, 0.8, 1)
  }

  /** The press currently crushing this spot, if any. */
  pressAt(loc: Loc, time: number): Press | null {
    if (loc.path !== 'main') return null
    for (const p of this.presses) {
      const reach = p.size / 2 + 0.55
      if (Math.abs(this.main.delta(p.s, loc.s)) < reach && Math.abs(loc.lateral - p.lateral) < reach && this.pressLift(p, time) < 0.22) return p
    }
    return null
  }

  // ─── quarry turbines ─────────────────────────────────────────────────

  spinnerAngle(sp: Spinner, time: number): number {
    return sp.phase + time * sp.speed
  }

  /** The turbine whose bar is sweeping through this spot, if any. */
  spinnerAt(pos: THREE.Vector3, loc: Loc, time: number): Spinner | null {
    if (loc.path !== 'main') return null
    for (const sp of this.spinners) {
      if (Math.abs(this.main.delta(sp.s, loc.s)) > sp.radius + 1) continue
      const c = this.main.pointAt(sp.s)
      const dx = pos.x - c.x
      const dz = pos.z - c.z
      const r = Math.hypot(dx, dz)
      if (r > sp.radius + 0.6 || r < 1.6) continue
      // Distance from the bar (a full line through the post, both arms).
      const a = this.spinnerAngle(sp, time)
      const off = Math.abs(dx * Math.cos(a) - dz * Math.sin(a))
      if (off < 1.15) return sp
    }
    return null
  }

  /** Points along the turbine bars, for the AI to steer around. */
  spinnerObstacles(time: number): { position: THREE.Vector3; radius: number; hazard: boolean }[] {
    const out: { position: THREE.Vector3; radius: number; hazard: boolean }[] = []
    for (const sp of this.spinners) {
      const c = this.main.pointAt(sp.s)
      const a = this.spinnerAngle(sp, time)
      for (const k of [-0.8, -0.45, 0.45, 0.8]) out.push({ position: new THREE.Vector3(c.x + Math.sin(a) * sp.radius * k, c.y, c.z + Math.cos(a) * sp.radius * k), radius: 1.4, hazard: true })
    }
    return out
  }

  private buildSpinners(): void {
    const stripes = hazardTexture()
    stripes.wrapS = THREE.RepeatWrapping
    stripes.repeat.set(6, 1)
    const barMat = new THREE.MeshStandardMaterial({ map: stripes, flatShading: true, roughness: 0.5 })
    const postMat = new THREE.MeshStandardMaterial({ color: '#1e4d6b', flatShading: true, roughness: 0.5 })
    const hubMat = new THREE.MeshStandardMaterial({ color: '#e30613', flatShading: true, roughness: 0.4 })
    const groupsWall = groups(COLLISION.WALL, COLLISION.KART | COLLISION.DEBRIS)
    for (const sp of this.spinners) {
      const c = this.main.pointAt(sp.s)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4.2, 10), postMat)
      post.position.copy(c).setY(c.y + 2.1)
      post.castShadow = true
      this.group.add(post)
      // The post is solid; the bar is the hazard.
      this.physics.addStaticCylinder(c.clone().setY(c.y + 2), 1.25, 6, 0, groupsWall)
      const rotor = new THREE.Group()
      rotor.position.copy(c).setY(c.y + 0.95)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, sp.radius * 2), barMat)
      bar.castShadow = true
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 12), hubMat)
      const caps = [-1, 1].map(k => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.6), hubMat)
        m.position.z = k * sp.radius
        return m
      })
      rotor.add(bar, hub, ...caps)
      this.group.add(rotor)
      this.spinnerViews.push(rotor)
    }
  }

  /** Presses that are down or about to drop, for the AI to steer around. */
  pressObstacles(time: number): { position: THREE.Vector3; radius: number; hazard: boolean }[] {
    const out: { position: THREE.Vector3; radius: number; hazard: boolean }[] = []
    for (const p of this.presses) {
      const t = this.pressCycle(p, time)
      if (t > 0.35 && t < 0.85) out.push({ position: this.main.pointAt(p.s, p.lateral), radius: p.size / 2 + 0.8, hazard: true })
    }
    return out
  }

  // ─── geometry ─────────────────────────────────────────────────────────

  private insideShortFootprint(p: THREE.Vector3, margin: number): boolean {
    if (!this.shortBox.containsPoint(p)) return false
    const c = this.short.closest(p)
    return c.distance < SHORT_HALF + margin && c.s > 0.5 && c.s < this.short.length - 0.5
  }

  private insideMainFootprint(p: THREE.Vector3, margin: number): boolean {
    return this.main.closest(p).distance < HALF_WIDTH + SHOULDER + margin
  }

  private buildRoad(): void {
    const sp = this.main
    const hw = HALF_WIDTH
    const bands: { a: number; b: number; color: (i: number, j: number) => THREE.Color; y?: number }[] = [
      { a: -hw - SHOULDER, b: -hw, color: (i, j) => sprinkle(i, j) },
      { a: -hw, b: -hw + 0.9, color: i => (Math.floor(i / 2) % 2 ? KERB_A : KERB_B), y: 0.03 },
      { a: -hw + 0.9, b: -0.18, color: (i, j) => ((i * 7 + j) % 5 === 0 ? ROAD_2 : ROAD) },
      { a: -0.18, b: 0.18, color: i => (Math.floor(i / 3) % 2 ? LANE : ROAD) },
      { a: 0.18, b: hw - 0.9, color: (i, j) => ((i * 5 + j) % 7 === 0 ? ROAD_2 : ROAD) },
      { a: hw - 0.9, b: hw, color: i => (Math.floor(i / 2) % 2 ? KERB_B : KERB_A), y: 0.03 },
      { a: hw, b: hw + SHOULDER, color: (i, j) => sprinkle(i + 3, j) },
    ]
    const geo = ribbon(sp, bands, 2, 2, 0, (_p, s) => this.inGap(s))
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }))
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.addGroundCollider(sp, WALL + 3, 0, s => this.inGap(s))
  }

  private buildShortcut(): void {
    const sp = this.short
    const L = sp.length
    const hw = SHORT_HALF
    const fluffAt = (i: number) => {
      const f = (i * 2) / L
      return f > this.fluff.from && f < this.fluff.to
    }
    const bands = [
      { a: -hw - 0.7, b: -hw, color: (i: number) => (Math.floor(i / 2) % 2 ? KERB_A : KERB_B), y: 0.03 },
      { a: -hw, b: 0, color: (i: number, j: number) => (fluffAt(i) ? (j % 2 ? FLUFF : new THREE.Color('#c4dce9')) : CARAMEL) },
      { a: 0, b: hw, color: (i: number, j: number) => (fluffAt(i) ? (j % 2 ? new THREE.Color('#c4dce9') : FLUFF) : CARAMEL) },
      { a: hw, b: hw + 0.7, color: (i: number) => (Math.floor(i / 2) % 2 ? KERB_B : KERB_A), y: 0.03 },
    ]
    const geo = ribbon(sp, bands, 2, 2, -0.03, (p: THREE.Vector3) => this.insideMainFootprint(p, -0.4))
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.addGroundCollider(sp, SHORT_WALL + 2.5, -0.02)

    // Safety blocks along the slick workshop-floor detour (visual only).
    const puffGeo = new THREE.BoxGeometry(0.72, 0.16, 0.72)
    const puffs = new THREE.InstancedMesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#ffc400', flatShading: true, roughness: 0.8 }), 80)
    const m = new THREE.Matrix4()
    let n = 0
    for (let s = L * this.fluff.from; s < L * this.fluff.to && n < 80; s += 1.3) {
      for (const side of [-1, 1]) {
        const p = sp.pointAt(s, side * (hw - 0.4 + Math.sin(s * 3.1) * 0.3))
        const k = 0.6 + ((s * 13.7) % 1) * 0.6
        m.compose(p.setY(p.y + 0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(s, s * 2, 0)), new THREE.Vector3(k * 1.25, 1, k))
        if (n < 80) puffs.setMatrixAt(n++, m)
      }
    }
    puffs.count = n
    puffs.receiveShadow = true
    this.group.add(puffs)
  }

  /** Inside a ravine (no road, no ground). */
  inGap(s: number): boolean {
    return this.gaps.some(g => this.main.delta(g.from, s) > 0 && this.main.delta(s, g.to) > 0)
  }

  private addGroundCollider(sp: TrackSpline, half: number, yOff = 0, skip?: (s: number) => boolean): void {
    const verts: number[] = []
    const idx: number[] = []
    const lats = [-half, -half * 0.5, 0, half * 0.5, half]
    const n = sp.samples.length
    for (const smp of sp.samples) for (const l of lats) verts.push(smp.pos.x + smp.right.x * l, smp.pos.y + yOff, smp.pos.z + smp.right.z * l)
    const rows = sp.closed ? n : n - 1
    const w = lats.length
    for (let i = 0; i < rows; i += 1) {
      if (skip && (skip(sp.samples[i].s) || skip(sp.samples[(i + 1) % n].s))) continue
      const a = i * w
      const b = ((i + 1) % n) * w
      for (let j = 0; j < w - 1; j += 1) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1)
    }
    this.physics.addStaticTrimesh(new Float32Array(verts), new Uint32Array(idx), groups(COLLISION.GROUND, COLLISION.DEBRIS))
  }

  private buildWalls(): void {
    const positions: number[] = []
    const colors: number[] = []
    const posts: THREE.Vector3[] = []
    const wallGroups = groups(COLLISION.WALL, COLLISION.KART | COLLISION.DEBRIS)
    const addWall = (sp: TrackSpline, offset: number, skip: (p: THREE.Vector3) => boolean) => {
      const n = sp.samples.length
      const stride = 2
      const count = sp.closed ? n : n - stride
      for (const side of [-1, 1]) {
        let k = 0
        for (let i = 0; i < count; i += stride) {
          const a = sp.samples[i]
          const b = sp.samples[(i + stride) % n]
          const pa = a.pos.clone().addScaledVector(a.right, side * offset)
          const pb = b.pos.clone().addScaledVector(b.right, side * offset)
          k += 1
          if (skip(pa) || skip(pb)) continue
          // Collider: tall invisible slab so jumps can never clear the barrier.
          const dir = pb.clone().sub(pa)
          const len = dir.length()
          dir.normalize()
          const out = new THREE.Vector3(a.right.x, 0, a.right.z).multiplyScalar(side * 0.5)
          const center = pa.clone().add(pb).multiplyScalar(0.5).add(out)
          center.y += 2
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
          this.physics.addStaticBox(center, new THREE.Vector3(1, 6, len + 0.5), q, 0, wallGroups)
          // Visual candy-cane rail.
          const col = k % 2 ? KERB_A : KERB_B
          rail(positions, colors, pa, pb, a.right, b.right, side, col)
          if (k % 4 === 0) posts.push(pa)
        }
      }
    }
    addWall(this.main, WALL, p => this.insideShortFootprint(p, 1.2))
    addWall(this.short, SHORT_WALL, p => this.insideMainFootprint(p, 1.6))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55 }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)

    const postGeo = new THREE.SphereGeometry(0.42, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2)
    const postMesh = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.35 }), posts.length)
    const m = new THREE.Matrix4()
    const palette = ['#e30613', '#2b9de9', '#ffc400', '#5470a8', '#00a99d'].map(c => new THREE.Color(c))
    posts.forEach((p, i) => {
      m.makeTranslation(p.x, p.y + 1.02, p.z)
      postMesh.setMatrixAt(i, m)
      postMesh.setColorAt(i, palette[i % palette.length])
    })
    postMesh.castShadow = true
    this.group.add(postMesh)
  }

  private buildPads(): void {
    for (const p of this.pads) {
      const sp = p.path === 'main' ? this.main : this.short
      const geo = new THREE.BufferGeometry()
      const pos: number[] = []
      const uv: number[] = []
      const steps = 4
      for (let i = 0; i <= steps; i += 1) {
        const s = p.s - p.length / 2 + (p.length * i) / steps
        const l = sp.pointAt(s, p.lateral - p.width / 2)
        const r = sp.pointAt(s, p.lateral + p.width / 2)
        pos.push(l.x, l.y + 0.06, l.z, r.x, r.y + 0.06, r.z)
        uv.push(0, i / steps, 1, i / steps)
      }
      const idx: number[] = []
      for (let i = 0; i < steps; i += 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.chevron, toneMapped: false, transparent: true, side: THREE.DoubleSide }))
      mesh.renderOrder = 2
      this.padMeshes.push(mesh)
      this.group.add(mesh)
    }
  }

  private buildRamps(): void {
    for (const r of this.ramps) {
      const sp = this.main
      const steps = 8
      const verts: THREE.Vector3[][] = []
      for (let i = 0; i <= steps; i += 1) {
        const d = (r.length * i) / steps
        const h = r.lip * Math.pow(i / steps, 1.25)
        const row: THREE.Vector3[] = []
        for (const l of [-r.width / 2, r.width / 2]) {
          const p = sp.pointAt(r.s - r.length + d, l)
          row.push(p.clone().setY(p.y + h + 0.02), p.clone().setY(p.y - 0.3))
        }
        verts.push(row)
      }
      const pos: number[] = []
      const col: number[] = []
      const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        for (let k = 0; k < 3; k += 1) col.push(color.r, color.g, color.b)
      }
      const wafer = [new THREE.Color('#f2c27b'), new THREE.Color('#d99a52')]
      const side = new THREE.Color('#c07a3c')
      const ctop: number[] = []
      for (let i = 0; i < steps; i += 1) {
        const [la, lb, ra, rb] = [verts[i][0], verts[i][1], verts[i][2], verts[i][3]]
        const [la2, lb2, ra2, rb2] = [verts[i + 1][0], verts[i + 1][1], verts[i + 1][2], verts[i + 1][3]]
        const c = wafer[i % 2]
        tri(la, la2, ra, c)
        tri(ra, la2, ra2, c)
        tri(lb, la2, la, side)
        tri(lb, lb2, la2, side)
        tri(rb, ra, ra2, side)
        tri(rb, ra2, rb2, side)
        void ctop
      }
      const last = verts[steps]
      tri(last[0], last[1], last[2], side)
      tri(last[2], last[1], last[3], side)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, side: THREE.DoubleSide }))
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      // Collider: the top surface only (ground group).
      const cv: number[] = []
      const ci: number[] = []
      verts.forEach(row => cv.push(row[0].x, row[0].y, row[0].z, row[2].x, row[2].y, row[2].z))
      for (let i = 0; i < steps; i += 1) ci.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3)
      this.physics.addStaticTrimesh(new Float32Array(cv), new Uint32Array(ci), groups(COLLISION.GROUND, COLLISION.DEBRIS))
      // Chevron strip on the ramp face.
      const g2 = new THREE.BufferGeometry()
      const p2: number[] = []
      const uv: number[] = []
      for (let i = 0; i <= steps; i += 1) {
        const a = verts[i][0].clone().lerp(verts[i][2], 0.3)
        const b = verts[i][0].clone().lerp(verts[i][2], 0.7)
        p2.push(a.x, a.y + 0.03, a.z, b.x, b.y + 0.03, b.z)
        uv.push(0, i / steps, 1, i / steps)
      }
      const i2: number[] = []
      for (let i = 0; i < steps; i += 1) i2.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3))
      g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      g2.setIndex(i2)
      const strip = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ map: this.chevron, toneMapped: false, transparent: true, side: THREE.DoubleSide }))
      this.padMeshes.push(strip)
      this.group.add(strip)
    }
  }

  /** Deck slab, piers and lamp posts for the high bridge over the north lake. */
  private buildBridge(): void {
    const { from, to } = this.bridge
    const deckMat = new THREE.MeshStandardMaterial({ color: '#8fa3b3', flatShading: true, roughness: 0.8 })
    const pierMat = new THREE.MeshStandardMaterial({ color: '#dbe7f2', flatShading: true, roughness: 0.7 })
    const beamMat = new THREE.MeshStandardMaterial({ color: '#e30613', flatShading: true, roughness: 0.5 })
    const width = (WALL + 1) * 2
    for (let s = from - 4; s < to + 4; s += 3) {
      const smp = this.main.at(s)
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 3.25), deckMat)
      slab.position.copy(smp.pos).setY(smp.pos.y - 0.62)
      slab.rotation.y = Math.atan2(smp.tan.x, smp.tan.z)
      slab.castShadow = slab.receiveShadow = true
      this.group.add(slab)
      // Red fascia beam along both edges.
      for (const side of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 3.25), beamMat)
        beam.position.copy(smp.pos).addScaledVector(smp.right, side * (WALL + 0.9)).setY(smp.pos.y - 0.5)
        beam.rotation.y = slab.rotation.y
        this.group.add(beam)
      }
    }
    for (let s = from + 6; s < to - 3; s += 12) {
      const smp = this.main.at(s)
      for (const side of [-1, 1]) {
        const top = smp.pos.y - 1.1
        const h = top + 3.5
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, h, 8), pierMat)
        pier.position.copy(smp.pos).addScaledVector(smp.right, side * (HALF_WIDTH - 1)).setY(top - h / 2)
        pier.castShadow = true
        this.group.add(pier)
      }
      // Lamp posts on the parapets.
      for (const side of [-1, 1]) {
        const base = smp.pos.clone().addScaledVector(smp.right, side * (WALL + 0.9))
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 6), pierMat)
        pole.position.copy(base).setY(base.y + 2.1)
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3c4', toneMapped: false }))
        lamp.position.copy(base).setY(base.y + 4.3)
        this.group.add(pole, lamp)
      }
    }
  }

  /** SENAI workshop hall over the road, with three stamping presses hanging from its gantries. */
  private buildWorkshop(): void {
    const { from, to } = this.tunnel
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1e4d6b', flatShading: true, roughness: 0.55 })
    const roofMat = new THREE.MeshStandardMaterial({ color: '#dce6eb', flatShading: true, roughness: 0.8, side: THREE.DoubleSide })
    const lightMat = new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false })
    const H = 8.5
    const reach = WALL + 1.2
    for (let s = from - 3; s <= to + 3; s += 6) {
      const smp = this.main.at(s)
      const yaw = Math.atan2(smp.tan.x, smp.tan.z)
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), frameMat)
        post.position.copy(smp.pos).addScaledVector(smp.right, side * reach).setY(smp.pos.y + H / 2)
        post.rotation.y = yaw
        post.castShadow = true
        this.group.add(post)
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(reach * 2 + 0.9, 0.8, 0.9), frameMat)
      beam.position.copy(smp.pos).setY(smp.pos.y + H)
      beam.rotation.y = yaw
      beam.castShadow = true
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 0.5), lightMat)
      lamp.position.copy(smp.pos).setY(smp.pos.y + H - 0.5)
      lamp.rotation.y = yaw
      this.group.add(beam, lamp)
      // Sawtooth roof panel to the next frame, with a skylight gap every other bay.
      if (s + 6 <= to + 3 && Math.round((s - from) / 6) % 2 === 0) {
        const next = this.main.at(s + 6)
        const mid = smp.pos.clone().lerp(next.pos, 0.5)
        const panel = new THREE.Mesh(new THREE.BoxGeometry(reach * 2 + 1.5, 0.3, 6.2), roofMat)
        panel.position.copy(mid).setY(Math.max(smp.pos.y, next.pos.y) + H + 0.9)
        panel.rotation.set(0.18, Math.atan2(next.pos.x - smp.pos.x, next.pos.z - smp.pos.z), 0, 'YXZ')
        panel.castShadow = true
        this.group.add(panel)
      }
    }
    // Hall entrance signs.
    for (const [s, flip] of [[from - 3, 0], [to + 3, Math.PI]] as const) {
      const smp = this.main.at(s)
      const sign = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 0.25), new THREE.MeshStandardMaterial({ map: labelTexture('OFICINA DE PRENSAS'), roughness: 0.6 }))
      sign.position.copy(smp.pos).setY(smp.pos.y + H + 1.3)
      sign.rotation.y = Math.atan2(smp.tan.x, smp.tan.z) + Math.PI + flip
      this.group.add(sign)
    }
    // Presses.
    const stripes = hazardTexture()
    const headMat = new THREE.MeshStandardMaterial({ map: stripes, flatShading: true, roughness: 0.5 })
    const plateMat = new THREE.MeshStandardMaterial({ color: '#4a5c6a', flatShading: true, roughness: 0.4, metalness: 0.3 })
    const rodMat = new THREE.MeshStandardMaterial({ color: '#c3ced6', flatShading: true, roughness: 0.25, metalness: 0.6 })
    for (const p of this.presses) {
      const smp = this.main.at(p.s)
      const g = new THREE.Group()
      g.position.copy(this.main.pointAt(p.s, p.lateral))
      g.rotation.y = Math.atan2(smp.tan.x, smp.tan.z)
      const head = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(p.size, 1.5, p.size), headMat)
      body.castShadow = true
      const plate = new THREE.Mesh(new THREE.BoxGeometry(p.size + 0.3, 0.3, p.size + 0.3), plateMat)
      plate.position.y = -0.85
      head.add(body, plate)
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 10), rodMat)
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(p.size, p.size), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2, depthWrite: false }))
      shadow.rotation.x = -Math.PI / 2
      shadow.position.y = 0.08
      g.add(head, rod, shadow)
      this.group.add(g)
      this.pressViews.push({ head, rod, shadow, top: H - 0.4 })
    }
  }

  private buildStartLine(): void {
    const pos: number[] = []
    const col: number[] = []
    const cells = 16
    const a = new THREE.Color('#ffffff')
    const b = new THREE.Color('#e30613')
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < cells; c += 1) {
        const l0 = -HALF_WIDTH + (2 * HALF_WIDTH * c) / cells
        const l1 = -HALF_WIDTH + (2 * HALF_WIDTH * (c + 1)) / cells
        const s0 = -1 + r
        const s1 = s0 + 1
        const p00 = this.main.pointAt(s0, l0)
        const p01 = this.main.pointAt(s0, l1)
        const p10 = this.main.pointAt(s1, l0)
        const p11 = this.main.pointAt(s1, l1)
        const color = (r + c) % 2 ? a : b
        for (const p of [p00, p01, p10, p01, p11, p10]) {
          pos.push(p.x, p.y + 0.05, p.z)
          col.push(color.r, color.g, color.b)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }))
    mesh.receiveShadow = true
    this.group.add(mesh)
  }
}

function sprinkle(i: number, j: number): THREE.Color {
  const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
  const r = h - Math.floor(h)
  return r > 0.8 ? SPRINKLES[Math.floor(r * 50) % SPRINKLES.length] : SHOULDER_BASE
}

/** Non-indexed flat-shaded ribbon along a spline with coloured lateral bands. */
function ribbon(
  sp: TrackSpline,
  bands: { a: number; b: number; color: (i: number, j: number) => THREE.Color; y?: number }[],
  stride: number,
  subdiv: number,
  yOff = 0,
  skip?: (p: THREE.Vector3, s: number) => boolean,
): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const n = sp.samples.length
  const rows = sp.closed ? n : n - 1
  const pa = new THREE.Vector3()
  for (let i = 0; i < rows; i += stride) {
    const A = sp.samples[i]
    const B = sp.samples[Math.min(sp.closed ? (i + stride) % n : i + stride, n - 1)]
    if (skip && skip(A.pos, A.s) && skip(B.pos, B.s)) continue
    bands.forEach((band, bi) => {
      for (let j = 0; j < subdiv; j += 1) {
        const l0 = band.a + ((band.b - band.a) * j) / subdiv
        const l1 = band.a + ((band.b - band.a) * (j + 1)) / subdiv
        const y = yOff + (band.y ?? 0)
        const p00 = pa.copy(A.pos).addScaledVector(A.right, l0).clone()
        const p01 = A.pos.clone().addScaledVector(A.right, l1)
        const p10 = B.pos.clone().addScaledVector(B.right, l0)
        const p11 = B.pos.clone().addScaledVector(B.right, l1)
        const c = band.color(i / stride, bi * 10 + j)
        // Wound so the face normal points up.
        for (const p of [p00, p01, p10, p01, p11, p10]) {
          pos.push(p.x, p.y + y, p.z)
          col.push(c.r, c.g, c.b)
        }
      }
    })
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

function rail(pos: number[], col: number[], pa: THREE.Vector3, pb: THREE.Vector3, ra: THREE.Vector3, rb: THREE.Vector3, side: number, color: THREE.Color): void {
  const t = 0.34
  const h0 = 0.25
  const h1 = 0.95
  const ia = pa.clone()
  const ib = pb.clone()
  const oa = pa.clone().addScaledVector(ra, side * t)
  const ob = pb.clone().addScaledVector(rb, side * t)
  const up = (v: THREE.Vector3, h: number) => v.clone().setY(v.y + h)
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, cc: THREE.Color) => {
    for (const p of [a, b, c, c, b, d]) {
      pos.push(p.x, p.y, p.z)
      col.push(cc.r, cc.g, cc.b)
    }
  }
  const dark = color.clone().multiplyScalar(0.8)
  // Inner face, top, outer face (both windings so either side is lit).
  quad(up(ia, h0), up(ib, h0), up(ia, h1), up(ib, h1), color)
  quad(up(ia, h1), up(ib, h1), up(ia, h0), up(ib, h0), color)
  quad(up(ia, h1), up(ib, h1), up(oa, h1), up(ob, h1), color)
  quad(up(oa, h1), up(ob, h1), up(ia, h1), up(ib, h1), color)
  quad(up(oa, 0), up(ob, 0), up(oa, h1), up(ob, h1), dark)
  quad(up(oa, h1), up(ob, h1), up(oa, 0), up(ob, 0), dark)
  // Low base plinth.
  quad(up(ia, -0.3), up(ib, -0.3), up(ia, h0), up(ib, h0), new THREE.Color('#f7e3ef'))
  quad(up(ia, h0), up(ib, h0), up(ia, -0.3), up(ib, -0.3), new THREE.Color('#f7e3ef'))
}

function hazardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#ffc400'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#102a43'
  for (let k = -64; k < 128; k += 22) {
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k + 11, 0)
    g.lineTo(k + 11 - 64, 64)
    g.lineTo(k - 64, 64)
    g.closePath()
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 72
  const g = c.getContext('2d')!
  g.fillStyle = '#e30613'
  g.fillRect(0, 0, 512, 72)
  g.fillStyle = '#ffffff'
  g.font = '900 42px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 38)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ff9a2e'
  g.fillRect(0, 0, 64, 128)
  const grad = g.createLinearGradient(0, 0, 64, 0)
  grad.addColorStop(0, '#ff6a3d')
  grad.addColorStop(0.5, '#ffd84d')
  grad.addColorStop(1, '#ff6a3d')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 128)
  g.fillStyle = '#fff8e0'
  for (let k = 0; k < 2; k += 1) {
    const y = k * 64
    g.beginPath()
    g.moveTo(6, y + 44)
    g.lineTo(32, y + 16)
    g.lineTo(58, y + 44)
    g.lineTo(58, y + 58)
    g.lineTo(32, y + 30)
    g.lineTo(6, y + 58)
    g.closePath()
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
