import * as THREE from 'three'
import { COLLISION, groups, type SurfaceInfo } from '../engine/kart'
import type { Physics } from '../engine/physics'
import { TrackSpline } from '../engine/spline'
import { CONFIG } from './config'
import type { Theme } from './themes'
import type { CrosserKind, Lake, MoverKind, PushKind, TrackDef, XZ } from './tracks'

/**
 * A circuit built from a `TrackDef` (see tracks.ts): road, shortcut, walls, colliders, boost pads,
 * ramps, bridges and every hazard. Everything is generated from the splines, so moving a control
 * point keeps meshes, physics, AI lines and the minimap consistent.
 */
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
/** Something travelling along the road inside [from, from + span] (traffic, rolling snowballs). */
export type Mover = { kind: MoverKind; from: number; span: number; speed: number; lateral: number; phase: number; len: number; wid: number; height: number }
/** Something crossing the road on a timer (trains, boulders, penguins). */
export type Crosser = { kind: CrosserKind; s: number; period: number; phase: number; len: number; depth: number; speed: number; height: number }
/** A stretch that shoves karts sideways. */
export type Push = { from: number; to: number; kind: PushKind; force: number; period: number }
/** A solid post on the road; bumpers also bounce karts away. */
export type Pillar = { s: number; lateral: number; radius: number; bumper: boolean }
/** A vent that erupts on a cycle. */
export type Geyser = { s: number; lateral: number; period: number; phase: number; radius: number }
/** What a hazard does to the kart it catches. */
export type HazardHit = { kind: 'press' | 'turbine' | 'mover' | 'crosser' | 'geyser' | 'bumper'; spin: number; lift: number; push: THREE.Vector3; squash: boolean }
type Obstacle = { position: THREE.Vector3; radius: number; hazard: boolean }

const MOVER_SIZE: Record<MoverKind, { len: number; wid: number; height: number }> = {
  car: { len: 4.4, wid: 2.3, height: 1.7 },
  bus: { len: 9.5, wid: 2.9, height: 3.3 },
  snowball: { len: 3.6, wid: 3.6, height: 3.6 },
  boulder: { len: 3.4, wid: 3.4, height: 3.2 },
  cart: { len: 3.2, wid: 2.2, height: 1.6 },
  ball: { len: 3, wid: 3, height: 3 },
  barrel: { len: 2.6, wid: 2.6, height: 2.6 },
}
const CROSSER_SIZE: Record<CrosserKind, { len: number; depth: number; speed: number; height: number }> = {
  train: { len: 34, depth: 3.6, speed: 24, height: 4 },
  boulder: { len: 3.6, depth: 3.6, speed: 11, height: 3.4 },
  penguin: { len: 5, depth: 2.2, speed: 4.5, height: 1.6 },
  gumball: { len: 3.2, depth: 3.2, speed: 12, height: 3.2 },
  forklift: { len: 4.6, depth: 2.4, speed: 6.5, height: 2.6 },
  ghost: { len: 3, depth: 2.4, speed: 7, height: 3.2 },
  dino: { len: 14, depth: 4, speed: 8, height: 7 },
  cannonball: { len: 1.8, depth: 1.8, speed: 34, height: 1.8 },
  meteor: { len: 3.4, depth: 3.4, speed: 26, height: 3.4 },
  toytrain: { len: 22, depth: 3, speed: 16, height: 2.8 },
}

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

export class Track {
  readonly main: TrackSpline
  readonly short: TrackSpline
  readonly group = new THREE.Group()
  readonly pads: Pad[] = []
  readonly ramps: Ramp[] = []
  readonly itemSpots: ItemSpot[] = []
  readonly presses: Press[] = []
  readonly spinners: Spinner[] = []
  readonly movers: Mover[] = []
  readonly crossers: Crosser[] = []
  readonly geysers: Geyser[] = []
  /** Main-loop s-ranges with no road at all (ravine jumps). */
  readonly gaps: { from: number; to: number }[] = []
  /** Main-loop s-ranges carried by bridges (no embankment underneath). */
  readonly bridges: { from: number; to: number }[] = []
  /** Covered halls (main-loop s-ranges) with their sign text. */
  readonly halls: { from: number; to: number; label: string }[] = []
  /** Low-grip stretches. */
  readonly slick: { from: number; to: number }[] = []
  /** No guard rails here. */
  readonly open: { from: number; to: number }[] = []
  readonly pushes: Push[] = []
  readonly pillars: Pillar[] = []
  private readonly pushViews: { mesh: THREE.Mesh; push: Push; sign: number }[] = []
  /** Lakes the scenery carves and fills (including the ones under bridges). */
  readonly lakes: Lake[]
  private readonly spinnerViews: THREE.Object3D[] = []
  private readonly pressViews: { head: THREE.Object3D; rod: THREE.Mesh; shadow: THREE.Mesh; top: number }[] = []
  private readonly moverViews: THREE.Object3D[] = []
  private readonly crosserViews: { body: THREE.Object3D; lights: THREE.Mesh[] }[] = []
  private readonly geyserViews: { column: THREE.Mesh; cap: THREE.Mesh; ring: THREE.Mesh }[] = []
  /** Shortcut s-range (fraction of its length) with a slow surface. */
  readonly fluff: { from: number; to: number }
  readonly shortMap: { start: number; end: number }
  readonly padMeshes: THREE.Mesh[] = []
  readonly landmarks: { arch: THREE.Vector3; archYaw: number; ramp: THREE.Vector3 } | null
  private readonly shortBox = new THREE.Box3()
  private readonly chevron: THREE.CanvasTexture
  private readonly c: { road: THREE.Color; road2: THREE.Color; lane: THREE.Color; kerbA: THREE.Color; kerbB: THREE.Color; shoulder: THREE.Color; sprinkles: THREE.Color[]; caramel: THREE.Color; fluff: THREE.Color; railA: THREE.Color; railB: THREE.Color }

  constructor(
    private readonly physics: Physics,
    readonly def: TrackDef,
    readonly theme: Theme,
  ) {
    const R = theme.road
    this.c = {
      road: new THREE.Color(R.asphalt),
      road2: new THREE.Color(R.patch),
      lane: new THREE.Color(R.lane),
      kerbA: new THREE.Color(R.kerbA),
      kerbB: new THREE.Color(R.kerbB),
      shoulder: new THREE.Color(R.shoulder),
      sprinkles: R.sprinkles.map(c => new THREE.Color(c)),
      caramel: new THREE.Color(R.shortcut),
      fluff: new THREE.Color(R.shortcutSlow),
      railA: new THREE.Color(theme.railA),
      railB: new THREE.Color(theme.railB),
    }
    this.main = new TrackSpline(def.points.map(([x, z, y]) => ({ x, y, z })), { closed: true, step: 1, halfWidth: HALF_WIDTH })
    const SC = def.shortcut
    const sA = this.main.closest(new THREE.Vector3(SC.from[0], 0, SC.from[1])).s
    const sB = this.main.closest(new THREE.Vector3(SC.to[0], 1, SC.to[1])).s
    const probe = this.main.closest(new THREE.Vector3(SC.via[0][0], 0, SC.via[0][1]))
    const inner = Math.sign(probe.lateral) || 1
    // Branch mouths follow the main road's tangent before peeling away, so the split reads as a
    // clear fork and karts never meet a wall end head-on.
    const pts = [
      this.main.pointAt(sA - 20, inner * 2.5),
      this.main.pointAt(sA - 8, inner * 6),
      this.main.pointAt(sA + 4, inner * 11.5),
      ...SC.via.map(([x, z, y]) => new THREE.Vector3(x, y, z)),
      this.main.pointAt(sB - 4, inner * 11.5),
      this.main.pointAt(sB + 8, inner * 6),
      this.main.pointAt(sB + 20, inner * 2.5),
    ]
    this.short = new TrackSpline(pts, { closed: false, step: 1, halfWidth: SHORT_HALF })
    this.shortMap = { start: this.main.wrap(sA - 20), end: this.main.wrap(sB + 20) }
    this.fluff = { from: SC.slow?.[0] ?? 2, to: SC.slow?.[1] ?? 2 }
    for (const smp of this.short.samples) this.shortBox.expandByPoint(smp.pos)
    this.shortBox.expandByScalar(SHORT_WALL + 2)
    this.chevron = chevronTexture()

    // Feature anchors by world position (robust to spline edits).
    const sAt = (at: XZ, ahead = 0) => this.main.wrap(this.main.closest(new THREE.Vector3(at[0], 0, at[1])).s + ahead)
    for (const p of def.pads ?? []) this.pads.push({ path: 'main', s: sAt(p.at, p.ahead), lateral: p.lateral ?? 0, length: p.length ?? 5, width: p.width ?? 4.5 })
    for (const f of def.shortcutPads ?? []) this.pads.push({ path: 'short', s: this.short.length * f, lateral: 0, length: 5, width: 5 })
    for (const r of def.ramps ?? []) {
      const s = sAt(r.at, r.ahead)
      const length = r.length ?? 9
      this.ramps.push({ s, length, width: r.width ?? 8, lip: r.lip ?? 1.6 })
      if (r.pad) this.pads.push({ path: 'main', s: s - length - (r.gap ? 6 : 3.5), lateral: 0, length: 5, width: Math.min(8, r.width ?? 8) })
      if (r.gap) this.gaps.push({ from: s + 0.5, to: s + 0.5 + r.gap })
    }
    const bridgeLakes: Lake[] = []
    for (const b of def.bridges ?? []) {
      const mid = sAt([b.lake.x, b.lake.z])
      const span = b.span ?? 27
      this.bridges.push({ from: mid - span, to: mid + span })
      bridgeLakes.push(b.lake)
    }
    this.lakes = [...(def.lakes ?? []), ...bridgeLakes]
    for (const h of def.halls ?? []) {
      const t0 = sAt(h.from)
      const span = this.main.delta(t0, sAt(h.to))
      this.halls.push({ from: t0, to: t0 + span, label: h.label })
      ;[
        { f: 0.25, lateral: -3.6, phase: 0 },
        { f: 0.5, lateral: 3.6, phase: 0.33 },
        { f: 0.75, lateral: 0, phase: 0.66 },
      ].forEach(p => this.presses.push({ s: t0 + span * p.f, lateral: p.lateral, size: 5.2, period: 3.2, phase: p.phase }))
    }
    for (const sp of def.spinners ?? []) this.spinners.push({ s: sAt(sp.at, sp.ahead), radius: sp.radius ?? 5, speed: sp.speed, phase: sp.phase ?? 0 })
    for (const m of def.movers ?? []) {
      const from = sAt(m.from)
      const span = this.main.delta(from, sAt(m.to))
      const size = MOVER_SIZE[m.kind]
      for (let i = 0; i < m.count; i += 1) {
        this.movers.push({ kind: m.kind, from, span, speed: m.speed, lateral: m.lanes[i % m.lanes.length], phase: i / m.count, ...size })
      }
    }
    for (const c of def.crossers ?? []) this.crossers.push({ kind: c.kind, s: sAt(c.at, c.ahead), period: c.period, phase: c.phase ?? 0, ...CROSSER_SIZE[c.kind] })
    for (const g of def.geysers ?? []) this.geysers.push({ s: sAt(g.at, g.ahead), lateral: g.lateral, period: g.period ?? 4, phase: g.phase ?? 0, radius: 2.6 })
    for (const o of def.open ?? []) {
      const from = sAt(o.from)
      this.open.push({ from, to: from + this.main.delta(from, sAt(o.to)) })
    }
    for (const pz of def.push ?? []) {
      const from = sAt(pz.from)
      this.pushes.push({ from, to: from + this.main.delta(from, sAt(pz.to)), kind: pz.kind, force: pz.force, period: pz.period ?? 3 })
    }
    for (const pl of def.pillars ?? []) this.pillars.push({ s: sAt(pl.at, pl.ahead), lateral: pl.lateral, radius: pl.radius ?? 1.4, bumper: !!pl.bumper })
    for (const sl of def.slick ?? []) {
      const from = sAt(sl.from)
      this.slick.push({ from, to: from + this.main.delta(from, sAt(sl.to)) })
    }

    const lats = [-5.4, -1.8, 1.8, 5.4]
    for (const r of def.rows) {
      const s = sAt(r.at, r.ahead)
      for (const lat of lats) this.itemSpots.push({ pos: this.main.pointAt(s, lat).add(new THREE.Vector3(0, 1.1, 0)), path: 'main', mainS: this.main.wrap(s) })
    }
    for (const lat of [-1.6, 1.6]) {
      const s = this.short.length * 0.83
      this.itemSpots.push({ pos: this.short.pointAt(s, lat).add(new THREE.Vector3(0, 1.1, 0)), path: 'short', mainS: this.mapShort(s) })
    }

    this.buildRoad()
    this.buildShortcut()
    this.buildWalls()
    this.buildPads()
    this.buildRamps()
    this.buildBridges()
    this.buildHalls()
    this.buildSpinners()
    this.buildMovers()
    this.buildCrossers()
    this.buildGeysers()
    this.buildSlick()
    this.buildPushes()
    this.buildPillars()
    if (theme.floating) {
      this.buildDeck(this.main, WALL + 3)
      this.buildDeck(this.short, SHORT_WALL + 2.5)
    }
    this.buildStartLine()
    if (def.landmark) {
      const archS = sAt(def.landmark.at, def.landmark.ahead)
      this.landmarks = { arch: this.main.pointAt(archS), archYaw: this.main.yawAt(archS), ramp: this.main.pointAt(this.ramps[0]?.s ?? archS) }
    } else this.landmarks = null
  }

  /** On a bridge deck (no ground below). */
  inBridge(s: number): boolean {
    return this.bridges.some(b => this.main.delta(b.from, s) > 0 && this.main.delta(s, b.to) > 0)
  }

  inOpen(s: number): boolean {
    return this.open.some(b => this.main.delta(b.from, s) > -2 && this.main.delta(s, b.to) > -2)
  }

  /** Sideways acceleration (m/s², + = towards `right`) a push zone applies here right now. */
  pushAt(loc: Loc, time: number): number {
    if (loc.path !== 'main') return 0
    for (const p of this.pushes) {
      const d = this.main.delta(p.from, loc.s)
      if (d < 0 || this.main.delta(loc.s, p.to) < 0) continue
      return p.force * this.pushSign(p, d, time)
    }
    return 0
  }

  /** Conveyors alternate every 12 m; wind and currents swing back and forth over time. */
  private pushSign(p: Push, d: number, time: number): number {
    if (p.kind === 'conveyor') return Math.floor(d / 12) % 2 === 0 ? 1 : -1
    return Math.sin((time / p.period) * Math.PI * 2) >= 0 ? 1 : -1
  }

  inSlick(s: number): boolean {
    return this.slick.some(b => this.main.delta(b.from, s) > 0 && this.main.delta(s, b.to) > 0)
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
    if (loc.path === 'main' && this.inSlick(loc.s) && Math.abs(loc.lateral) < loc.half + 0.25) gripMul = Math.min(gripMul, 0.3)
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
    this.movers.forEach((m, i) => {
      const v = this.moverViews[i]
      const { s, fade } = this.moverAt(m, time)
      const p = this.main.pointAt(s, m.lateral)
      v.position.set(p.x, p.y, p.z)
      v.rotation.set(0, this.main.yawAt(s) + (m.speed < 0 ? Math.PI : 0), 0)
      v.scale.setScalar(Math.max(0.001, fade))
      v.visible = fade > 0.01
      const roll = v.userData.roll as THREE.Object3D | undefined
      if (roll) roll.rotation.x = (time * m.speed) / (m.height / 2)
      if (m.kind === 'ball' && roll) roll.position.y = m.height / 2 + Math.abs(Math.sin(time * 4 + i)) * 2.2
    })
    this.crossers.forEach((c, i) => {
      const v = this.crosserViews[i]
      const st = this.crosserAt(c, time)
      const p = this.main.pointAt(c.s, st.lateral)
      v.body.visible = st.active
      v.body.position.set(p.x, this.main.pointAt(c.s).y, p.z)
      v.body.rotation.y = this.main.yawAt(c.s) + Math.PI / 2 + (st.dir < 0 ? Math.PI : 0)
      const roll = v.body.userData.roll as THREE.Object3D | undefined
      if (roll) roll.rotation.x = time * c.speed * 0.6
      const float = v.body.userData.float as THREE.Object3D | undefined
      if (float) float.position.y = 1.2 + Math.sin(time * 3 + i) * 0.5
      const waddle = v.body.userData.waddle as THREE.Object3D | undefined
      if (waddle) waddle.rotation.z = Math.sin(time * 9) * 0.18
      const on = st.warning && Math.floor(time * 4) % 2 === 0
      for (const [k, l] of v.lights.entries()) (l.material as THREE.MeshBasicMaterial).color.set(st.warning && (on ? k % 2 === 0 : k % 2 === 1) ? '#ff2a2a' : '#401010')
    })
    for (const v of this.pushViews) {
      const tex = (v.mesh.material as THREE.MeshBasicMaterial).map!
      const dir = v.push.kind === 'conveyor' ? v.sign : this.pushSign(v.push, 0, time)
      tex.offset.x -= dir * (v.push.kind === 'wind' ? 0.05 : 0.02)
    }
    this.geysers.forEach((g, i) => {
      const v = this.geyserViews[i]
      const st = this.geyserState(g, time)
      const h = st.erupting ? 1 + Math.sin(st.t * Math.PI) * 9 : st.warning ? 0.3 + Math.abs(Math.sin(time * 18)) * 0.4 : 0.05
      v.column.scale.set(1, h, 1)
      v.column.position.y = h / 2
      v.cap.position.y = h
      v.cap.visible = st.erupting || st.warning
      ;(v.ring.material as THREE.MeshBasicMaterial).opacity = st.warning || st.erupting ? 0.95 : 0.45
    })
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
    // The volcano's turbines are fire bars.
    const barMat = this.theme.id === 'volcano' ? new THREE.MeshBasicMaterial({ color: '#ff6a2b', toneMapped: false }) : new THREE.MeshStandardMaterial({ map: stripes, flatShading: true, roughness: 0.5 })
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

  // ─── traffic, crossers, geysers ────────────────────────────────────

  /** Where a mover is now; `fade` shrinks it in/out at the ends of its stretch. */
  moverAt(m: Mover, time: number): { s: number; fade: number } {
    const t = (time * Math.abs(m.speed)) / Math.max(1, m.span) + m.phase
    const u = t - Math.floor(t)
    const s = m.speed >= 0 ? m.from + u * m.span : m.from + (1 - u) * m.span
    const fade = THREE.MathUtils.smoothstep(u, 0, 0.05) * (1 - THREE.MathUtils.smoothstep(u, 0.95, 1))
    return { s: this.main.wrap(s), fade }
  }

  /** Crossers travel side to side for part of each period, alternating direction. */
  crosserAt(c: Crosser, time: number): { lateral: number; active: boolean; warning: boolean; dir: number } {
    const X = WALL + c.len / 2 + 2
    const travel = (2 * X) / c.speed
    const m = Math.min(0.92, travel / c.period)
    const t = time / c.period + c.phase
    const u = t - Math.floor(t)
    const dir = Math.floor(t) % 2 === 0 ? 1 : -1
    const active = u < m
    const lateral = dir * (-X + 2 * X * (active ? u / m : 1))
    const warning = active || 1 - u < 2.2 / c.period
    return { lateral, active, warning, dir }
  }

  geyserState(g: Geyser, time: number): { warning: boolean; erupting: boolean; t: number } {
    const v = time / g.period + g.phase
    const u = v - Math.floor(v)
    return { warning: u >= 0.42 && u < 0.6, erupting: u >= 0.6 && u < 0.82, t: (u - 0.6) / 0.22 }
  }

  /** Whatever hazard is catching a kart at `pos` right now. */
  hazardAt(pos: THREE.Vector3, loc: Loc, grounded: boolean, time: number): HazardHit | null {
    if (grounded && this.pressAt(loc, time)) return { kind: 'press', spin: 1.1, lift: 0, push: new THREE.Vector3(), squash: true }
    const sp = this.spinnerAt(pos, loc, time)
    if (sp) {
      const c = this.main.pointAt(sp.s)
      return { kind: 'turbine', spin: 0.9, lift: 5, push: pos.clone().sub(c).setY(0).normalize().multiplyScalar(8), squash: false }
    }
    if (loc.path !== 'main') return null
    for (const pl of this.pillars) {
      if (!pl.bumper || Math.abs(this.main.delta(pl.s, loc.s)) > pl.radius + 2) continue
      const c = this.main.pointAt(pl.s, pl.lateral)
      const away = pos.clone().sub(c).setY(0)
      if (away.length() < pl.radius + 1.4) return { kind: 'bumper', spin: 0, lift: 2.5, push: away.normalize().multiplyScalar(13), squash: false }
    }
    for (const m of this.movers) {
      const { s, fade } = this.moverAt(m, time)
      if (fade < 0.6) continue
      if (Math.abs(this.main.delta(s, loc.s)) < m.len / 2 + 0.9 && Math.abs(loc.lateral - m.lateral) < m.wid / 2 + 0.9) {
        const ahead = this.main.at(s).tan.clone().multiplyScalar(Math.sign(m.speed) * 6)
        const side = this.main.at(s).right.clone().multiplyScalar(Math.sign(loc.lateral - m.lateral || 1) * 6)
        return { kind: 'mover', spin: 0.9, lift: 5, push: ahead.add(side), squash: false }
      }
    }
    for (const c of this.crossers) {
      const st = this.crosserAt(c, time)
      if (!st.active) continue
      if (Math.abs(this.main.delta(c.s, loc.s)) < c.depth / 2 + 0.9 && Math.abs(loc.lateral - st.lateral) < c.len / 2 + 0.9) {
        return { kind: 'crosser', spin: 1.0, lift: 6, push: this.main.at(c.s).right.clone().multiplyScalar(st.dir * 11), squash: false }
      }
    }
    for (const g of this.geysers) {
      if (!this.geyserState(g, time).erupting) continue
      if (Math.abs(this.main.delta(g.s, loc.s)) < g.radius + 0.5 && Math.abs(loc.lateral - g.lateral) < g.radius + 0.5) {
        return { kind: 'geyser', spin: 0.8, lift: 15, push: new THREE.Vector3(), squash: false }
      }
    }
    return null
  }

  /** Every hazard the AI should steer around right now. */
  hazardObstacles(time: number): Obstacle[] {
    const out: Obstacle[] = [...this.pressObstacles(time), ...this.spinnerObstacles(time)]
    for (const pl of this.pillars) out.push({ position: this.main.pointAt(pl.s, pl.lateral), radius: pl.radius + 1.2, hazard: true })
    for (const m of this.movers) {
      const { s, fade } = this.moverAt(m, time)
      if (fade < 0.3) continue
      out.push({ position: this.main.pointAt(s, m.lateral), radius: Math.max(m.len, m.wid) / 2 + 0.6, hazard: true })
      if (m.len > 6) out.push({ position: this.main.pointAt(s - Math.sign(m.speed) * m.len * 0.35, m.lateral), radius: m.wid / 2 + 0.8, hazard: true })
    }
    for (const c of this.crossers) {
      const st = this.crosserAt(c, time)
      if (!st.warning) continue
      // Treat a warned crossing as blocked where the crosser is (or is about to enter).
      const lat = st.active ? st.lateral : -st.dir * (WALL - 1)
      for (const k of [-0.35, 0, 0.35]) out.push({ position: this.main.pointAt(c.s, THREE.MathUtils.clamp(lat + k * c.len, -WALL, WALL)), radius: c.depth / 2 + 1, hazard: true })
    }
    for (const g of this.geysers) {
      const st = this.geyserState(g, time)
      if (st.warning || st.erupting) out.push({ position: this.main.pointAt(g.s, g.lateral), radius: g.radius + 0.8, hazard: true })
    }
    return out
  }

  private buildMovers(): void {
    const palette = ['#e30613', '#2b9de9', '#ffc400', '#00a99d', '#ff7aa2', '#ffffff', '#7b5cff']
    const dark = new THREE.MeshStandardMaterial({ color: '#1d232b', flatShading: true, roughness: 0.6 })
    const glass = new THREE.MeshStandardMaterial({ color: '#9fd3ff', emissive: '#3a6f9a', emissiveIntensity: 0.4, flatShading: true, roughness: 0.2 })
    const lamp = new THREE.MeshBasicMaterial({ color: '#fff6c4', toneMapped: false })
    this.movers.forEach((m, i) => {
      const g = new THREE.Group()
      const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.45 })
      if (m.kind === 'car' || m.kind === 'bus' || m.kind === 'cart') {
        const color = m.kind === 'bus' ? (i % 2 ? '#ffc400' : '#2b9de9') : m.kind === 'cart' ? ['#ff5fa2', '#7fe0ff', '#ffe066'][i % 3] : palette[i % palette.length]
        const body = new THREE.Mesh(new THREE.BoxGeometry(m.wid, m.height * 0.55, m.len), mat(color))
        body.position.y = m.height * 0.42
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(m.wid * 0.92, m.height * 0.4, m.kind === 'bus' ? m.len * 0.94 : m.len * 0.5), glass)
        cabin.position.set(0, m.height * 0.86, m.kind === 'bus' ? 0 : -m.len * 0.05)
        g.add(body, cabin)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 10), dark)
          w.rotation.z = Math.PI / 2
          w.position.set((sx * m.wid) / 2, 0.45, (sz * m.len) / 2.8)
          g.add(w)
        }
        for (const sx of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), lamp)
          l.position.set(sx * m.wid * 0.32, m.height * 0.45, m.len / 2 + 0.03)
          g.add(l)
        }
      } else {
        // Rolling ball (snowball / boulder).
        const roll = new THREE.Group()
        const geo =
          m.kind === 'snowball' || m.kind === 'ball'
            ? new THREE.IcosahedronGeometry(m.height / 2, 2)
            : m.kind === 'barrel'
              ? new THREE.CylinderGeometry(m.height / 2, m.height / 2, m.wid * 0.9, 12).rotateZ(Math.PI / 2)
              : new THREE.DodecahedronGeometry(m.height / 2, 0)
        const color = m.kind === 'snowball' ? '#ffffff' : m.kind === 'ball' ? palette[i % palette.length] : m.kind === 'barrel' ? '#8a5a35' : '#8c6b52'
        const ball = new THREE.Mesh(geo, mat(color))
        roll.add(ball)
        roll.position.y = m.height / 2
        g.add(roll)
        g.userData.roll = roll
      }
      g.traverse(o => ((o as THREE.Mesh).castShadow = true))
      this.group.add(g)
      this.moverViews.push(g)
    })
  }

  private buildCrossers(): void {
    const post = new THREE.MeshStandardMaterial({ color: '#2b2b33', flatShading: true })
    for (const c of this.crossers) {
      const body = new THREE.Group()
      const mat = (col: string, emissive = '#000000') => new THREE.MeshStandardMaterial({ color: col, emissive, flatShading: true, roughness: 0.5 })
      if (c.kind === 'train') {
        // Locomotive + carriages laid along the crossing direction (local z).
        const cars = 3
        const each = c.len / cars
        for (let k = 0; k < cars; k += 1) {
          const car = new THREE.Mesh(new THREE.BoxGeometry(c.depth, c.height, each - 0.6), mat(k === 0 ? '#e30613' : '#2b4e7a'))
          car.position.set(0, c.height / 2 + 0.5, c.len / 2 - each * (k + 0.5))
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(c.depth + 0.05, 0.4, each - 0.6), mat('#ffc400', '#806000'))
          stripe.position.copy(car.position).setY(c.height * 0.55 + 0.5)
          const win = new THREE.Mesh(new THREE.BoxGeometry(c.depth + 0.06, 0.8, each - 1.6), mat('#9fd3ff', '#3a6f9a'))
          win.position.copy(car.position).setY(c.height * 0.8 + 0.5)
          body.add(car, stripe, win)
        }
        const head = new THREE.Mesh(new THREE.BoxGeometry(c.depth * 0.6, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: '#fff6c4', toneMapped: false }))
        head.position.set(0, c.height * 0.4 + 0.5, c.len / 2 + 0.02)
        body.add(head)
        // Rails across the road.
        const rails = new THREE.Mesh(new THREE.BoxGeometry((WALL + 18) * 2, 0.12, 2.4), mat('#5a5f6b'))
        const at = this.main.at(c.s)
        rails.position.copy(at.pos).setY(at.pos.y + 0.07)
        rails.rotation.y = Math.atan2(at.tan.x, at.tan.z) + Math.PI / 2
        this.group.add(rails)
      } else if (c.kind === 'toytrain') {
        const colors = ['#e30613', '#ffc400', '#2b9de9', '#00a99d']
        const cars = 4
        const each = c.len / cars
        for (let k = 0; k < cars; k += 1) {
          const car = new THREE.Mesh(new THREE.BoxGeometry(c.depth, c.height * 0.7, each - 0.5), mat(colors[k % colors.length]))
          car.position.set(0, c.height * 0.45 + 0.4, c.len / 2 - each * (k + 0.5))
          body.add(car)
          for (const z of [-1, 1]) for (const x of [-1, 1]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), mat('#1d232b'))
            w.rotation.z = Math.PI / 2
            w.position.set((x * c.depth) / 2, 0.45, car.position.z + (z * each) / 3.2)
            body.add(w)
          }
        }
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 1.3, 10), mat('#1d232b'))
        chimney.position.set(0, c.height + 0.6, c.len / 2 - each * 0.3)
        body.add(chimney)
        const rails = new THREE.Mesh(new THREE.BoxGeometry((WALL + 18) * 2, 0.12, 2.2), mat('#b07a45'))
        const at = this.main.at(c.s)
        rails.position.copy(at.pos).setY(at.pos.y + 0.07)
        rails.rotation.y = Math.atan2(at.tan.x, at.tan.z) + Math.PI / 2
        this.group.add(rails)
      } else if (c.kind === 'ghost') {
        const float = new THREE.Group()
        const sheet = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 1.4, 6, 12), new THREE.MeshStandardMaterial({ color: '#f2f0ff', emissive: '#b8a6ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.82, flatShading: true }))
        for (const x of [-0.4, 0.4]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: '#1d1030' }))
          eye.position.set(x, 0.6, 1.0)
          float.add(eye)
        }
        float.add(sheet)
        body.add(float)
        body.userData.float = float
      } else if (c.kind === 'dino') {
        const green = mat('#4f9a52')
        const torso = new THREE.Mesh(new THREE.BoxGeometry(c.depth, c.height * 0.45, c.len * 0.42), green)
        torso.position.y = c.height * 0.5
        const neck = new THREE.Mesh(new THREE.BoxGeometry(c.depth * 0.45, c.height * 0.55, 1.2), green)
        neck.position.set(0, c.height * 0.8, c.len * 0.22)
        neck.rotation.x = 0.35
        const head = new THREE.Mesh(new THREE.BoxGeometry(c.depth * 0.6, 1.3, 2.4), green)
        head.position.set(0, c.height * 1.05, c.len * 0.3)
        const tail = new THREE.Mesh(new THREE.ConeGeometry(c.depth * 0.35, c.len * 0.5, 6), green)
        tail.rotation.x = -Math.PI / 2
        tail.position.set(0, c.height * 0.45, -c.len * 0.42)
        body.add(torso, neck, head, tail)
        for (const z of [-1, 1]) for (const x of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, c.height * 0.4, 1.1), mat('#3c8f3a'))
          leg.position.set((x * c.depth) / 2.6, c.height * 0.2, (z * c.len) / 6)
          body.add(leg)
        }
        for (let k = 0; k < 5; k += 1) {
          const plate = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), mat('#ff9f3a'))
          plate.position.set(0, c.height * 0.78, c.len * 0.15 - k * 1.4)
          body.add(plate)
        }
      } else if (c.kind === 'cannonball' || c.kind === 'meteor') {
        const roll = new THREE.Group()
        const ball =
          c.kind === 'meteor'
            ? new THREE.Mesh(new THREE.DodecahedronGeometry(c.height / 2, 0), new THREE.MeshStandardMaterial({ color: '#ff7b3d', emissive: '#ff3b00', emissiveIntensity: 1.3, flatShading: true }))
            : new THREE.Mesh(new THREE.SphereGeometry(c.height / 2, 14, 10), mat('#1d232b'))
        roll.add(ball)
        roll.position.y = c.height / 2 + 0.3
        body.add(roll)
        body.userData.roll = roll
        // Cannons on both banks (pirate bay), or nothing for meteors.
        if (c.kind === 'cannonball') {
          const at = this.main.at(c.s)
          for (const side of [-1, 1]) {
            const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3.2, 12), mat('#2b2b33'))
            cannon.rotation.z = Math.PI / 2
            const g2 = new THREE.Group()
            g2.add(cannon)
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 10), mat('#8a5a35'))
            wheel.rotation.x = Math.PI / 2
            wheel.position.y = -0.6
            g2.add(wheel)
            g2.position.copy(at.pos).addScaledVector(at.right, side * (WALL + 4)).setY(at.pos.y + 1.2)
            g2.rotation.y = Math.atan2(at.tan.x, at.tan.z)
            this.group.add(g2)
          }
        }
      } else if (c.kind === 'forklift') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(c.depth, 1.3, c.len * 0.7), mat('#ffc400'))
        base.position.y = 1
        const mast = new THREE.Mesh(new THREE.BoxGeometry(c.depth * 0.8, 2.6, 0.25), mat('#2b2b33'))
        mast.position.set(0, 1.6, c.len * 0.38)
        const fork = new THREE.Mesh(new THREE.BoxGeometry(c.depth * 0.7, 0.15, 1.4), mat('#8a96a3'))
        fork.position.set(0, 0.5, c.len * 0.5)
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), mat('#b07a45'))
        crate.position.set(0, 1.2, c.len * 0.52)
        body.add(base, mast, fork, crate)
      } else if (c.kind === 'penguin') {
        const waddle = new THREE.Group()
        for (const k of [-1, 0, 1]) {
          const p = new THREE.Group()
          const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.7, 4, 8), mat('#1d232b'))
          b.position.y = 0.85
          const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), mat('#ffffff'))
          belly.position.set(0, 0.8, 0.22)
          const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), mat('#ff9f3a'))
          beak.rotation.x = Math.PI / 2
          beak.position.set(0, 1.35, 0.42)
          p.add(b, belly, beak)
          p.position.z = k * 1.6
          waddle.add(p)
        }
        body.add(waddle)
        body.userData.waddle = waddle
      } else {
        const roll = new THREE.Group()
        const geo = c.kind === 'gumball' ? new THREE.SphereGeometry(c.height / 2, 14, 10) : new THREE.DodecahedronGeometry(c.height / 2, 0)
        roll.add(new THREE.Mesh(geo, mat(c.kind === 'gumball' ? ['#ff5fa2', '#7fe0ff', '#ffe066'][this.crosserViews.length % 3] : '#8c6b52')))
        roll.position.y = c.height / 2
        body.add(roll)
        body.userData.roll = roll
      }
      body.traverse(o => ((o as THREE.Mesh).castShadow = true))
      this.group.add(body)
      // Warning posts on both sides.
      const lights: THREE.Mesh[] = []
      const at = this.main.at(c.s)
      for (const side of [-1, 1]) {
        const base = at.pos.clone().addScaledVector(at.right, side * (WALL + 1.2)).addScaledVector(at.tan, -c.depth / 2 - 1.2)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), post)
        pole.position.copy(base).setY(base.y + 1.7)
        this.group.add(pole)
        for (const k of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.CircleGeometry(0.32, 12), new THREE.MeshBasicMaterial({ color: '#401010', toneMapped: false, side: THREE.DoubleSide }))
          l.position.copy(base).addScaledVector(at.right, k * 0.42).setY(base.y + 3.1)
          l.rotation.y = Math.atan2(at.tan.x, at.tan.z) + Math.PI
          this.group.add(l)
          lights.push(l)
        }
      }
      this.crosserViews.push({ body, lights })
    }
  }

  private buildGeysers(): void {
    const tone = { campus: '#e8f6ff', desert: '#3a2a20', snow: '#bfefff', candy: '#ff8ad0', neon: '#2bf3ff', volcano: '#ff5a1f', rainbow: '#7fe0ff', haunted: '#7bff9a', toys: '#5ad1ff', pirate: '#bfeaff', sky: '#ffffff', dino: '#ff7b3d' }[this.theme.id]
    const colMat = new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.8, toneMapped: false })
    for (const g of this.geysers) {
      const at = this.main.pointAt(g.s, g.lateral)
      const root = new THREE.Group()
      root.position.copy(at)
      const ring = new THREE.Mesh(new THREE.RingGeometry(g.radius - 0.5, g.radius, 24), new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.45, toneMapped: false, side: THREE.DoubleSide }))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.07
      const vent = new THREE.Mesh(new THREE.CircleGeometry(g.radius - 0.5, 20), new THREE.MeshBasicMaterial({ color: '#141418' }))
      vent.rotation.x = -Math.PI / 2
      vent.position.y = 0.06
      const column = new THREE.Mesh(new THREE.CylinderGeometry(g.radius * 0.55, g.radius * 0.8, 1, 12, 1, true), colMat)
      const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(g.radius * 0.9, 1), colMat)
      root.add(ring, vent, column, cap)
      this.group.add(root)
      this.geyserViews.push({ column, cap, ring })
    }
  }

  private buildPushes(): void {
    const tone = { conveyor: '#2b2b33', wind: '#ffffff', current: '#3cb4ff' } as const
    for (const p of this.pushes) {
      const seg = p.kind === 'conveyor' ? 12 : p.to - p.from
      for (let a = p.from, k = 0; a < p.to - 0.5; a += seg, k += 1) {
        const b = Math.min(p.to, a + seg)
        const pos: number[] = []
        const uv: number[] = []
        const steps = Math.max(2, Math.ceil((b - a) / 2))
        for (let i = 0; i <= steps; i += 1) {
          const s = a + ((b - a) * i) / steps
          const l = this.main.pointAt(s, -HALF_WIDTH + 0.9)
          const r = this.main.pointAt(s, HALF_WIDTH - 0.9)
          pos.push(l.x, l.y + 0.055, l.z, r.x, r.y + 0.055, r.z)
          uv.push(0, (s - a) / 4, 4, (s - a) / 4)
        }
        const idx: number[] = []
        for (let i = 0; i < steps; i += 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
        geo.setIndex(idx)
        const tex = sideArrowTexture(tone[p.kind], p.kind === 'conveyor' ? '#ffc400' : p.kind === 'wind' ? '#cfe6ff' : '#e8fbff')
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: p.kind === 'conveyor' ? 0.95 : 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }))
        mesh.renderOrder = 1
        this.group.add(mesh)
        this.pushViews.push({ mesh, push: p, sign: k % 2 === 0 ? 1 : -1 })
      }
    }
  }

  private buildPillars(): void {
    const walls = groups(COLLISION.WALL, COLLISION.KART | COLLISION.DEBRIS)
    const look = {
      rainbow: ['#ffe066', '#ff5fa2'], haunted: ['#3d3448', '#7bff9a'], toys: ['#2b9de9', '#ffc400'], pirate: ['#8a5a35', '#d9b36b'],
      sky: ['#f2f0ea', '#7fd36b'], dino: ['#6b4f3a', '#3c8f3a'],
    } as Record<string, [string, string]>
    const [body, cap] = look[this.theme.id] ?? ['#8794a3', '#e30613']
    for (const pl of this.pillars) {
      const c = this.main.pointAt(pl.s, pl.lateral)
      const g = new THREE.Group()
      g.position.copy(c)
      if (pl.bumper) {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(pl.radius, pl.radius * 1.1, 1.4, 16), new THREE.MeshStandardMaterial({ color: body, emissive: body, emissiveIntensity: 0.5, flatShading: true }))
        base.position.y = 0.7
        const ring = new THREE.Mesh(new THREE.TorusGeometry(pl.radius, 0.22, 8, 20), new THREE.MeshBasicMaterial({ color: cap, toneMapped: false }))
        ring.rotation.x = Math.PI / 2
        ring.position.y = 1.45
        g.add(base, ring)
      } else {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(pl.radius, pl.radius * 1.15, 6, 10), new THREE.MeshStandardMaterial({ color: body, flatShading: true, roughness: 0.8 }))
        col.position.y = 3
        const top = new THREE.Mesh(new THREE.SphereGeometry(pl.radius * 1.15, 10, 8), new THREE.MeshStandardMaterial({ color: cap, flatShading: true }))
        top.position.y = 6.2
        g.add(col, top)
      }
      g.traverse(o => ((o as THREE.Mesh).castShadow = true))
      this.group.add(g)
      this.physics.addStaticCylinder(c.clone().setY(c.y + 2), pl.radius, 6, 0, walls)
    }
  }

  /** Floating worlds: a thick deck under the road so it reads as a road in the sky. */
  private buildDeck(sp: TrackSpline, half: number): void {
    const pos: number[] = []
    const n = sp.samples.length
    const rows = sp.closed ? n : n - 1
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z)
    for (let i = 0; i < rows; i += 2) {
      const A = sp.samples[i]
      const B = sp.samples[Math.min(sp.closed ? (i + 2) % n : i + 2, n - 1)]
      if (sp === this.main && (this.inGap(A.s) || this.inGap(B.s))) continue
      const at = (smp: typeof A, l: number, dy: number) => smp.pos.clone().addScaledVector(smp.right, l).setY(smp.pos.y + dy)
      quad(at(A, -half, -1.6), at(B, -half, -1.6), at(A, half, -1.6), at(B, half, -1.6))
      quad(at(A, -half, -0.05), at(B, -half, -0.05), at(A, -half, -1.6), at(B, -half, -1.6))
      quad(at(A, half, -1.6), at(B, half, -1.6), at(A, half, -0.05), at(B, half, -0.05))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: this.theme.road.patch, emissive: this.theme.rainbow ? '#3a1d6b' : '#000000', flatShading: true, roughness: 0.8, side: THREE.DoubleSide }))
    mesh.receiveShadow = true
    this.group.add(mesh)
  }

  private buildSlick(): void {
    for (const sl of this.slick) {
      const pos: number[] = []
      for (let s = sl.from; s <= sl.to; s += 2) {
        const a = this.main.pointAt(s, -HALF_WIDTH + 0.9)
        const b = this.main.pointAt(s, HALF_WIDTH - 0.9)
        pos.push(a.x, a.y + 0.05, a.z, b.x, b.y + 0.05, b.z)
      }
      const idx: number[] = []
      for (let i = 0; i < pos.length / 6 - 1; i += 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setIndex(idx)
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.theme.road.slick, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }))
      mesh.renderOrder = 1
      this.group.add(mesh)
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

  private sprinkle(i: number, j: number): THREE.Color {
    const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
    const r = h - Math.floor(h)
    return r > 0.8 ? this.c.sprinkles[Math.floor(r * 50) % this.c.sprinkles.length] : this.c.shoulder
  }

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
    const rainbow = (i: number, j: number) => new THREE.Color().setHSL((((j % 10) + Math.floor(j / 10) * 2) * 0.07 + i * 0.006) % 1, 0.85, 0.6)
    const bands: { a: number; b: number; color: (i: number, j: number) => THREE.Color; y?: number }[] = this.theme.rainbow
      ? [
          { a: -hw - SHOULDER, b: -hw, color: () => this.c.shoulder },
          { a: -hw, b: hw, color: rainbow },
          { a: hw, b: hw + SHOULDER, color: () => this.c.shoulder },
        ]
      : [
      { a: -hw - SHOULDER, b: -hw, color: (i, j) => this.sprinkle(i, j) },
      { a: -hw, b: -hw + 0.9, color: i => (Math.floor(i / 2) % 2 ? this.c.kerbA : this.c.kerbB), y: 0.03 },
      { a: -hw + 0.9, b: -0.18, color: (i, j) => ((i * 7 + j) % 5 === 0 ? this.c.road2 : this.c.road) },
      { a: -0.18, b: 0.18, color: i => (Math.floor(i / 3) % 2 ? this.c.lane : this.c.road) },
      { a: 0.18, b: hw - 0.9, color: (i, j) => ((i * 5 + j) % 7 === 0 ? this.c.road2 : this.c.road) },
      { a: hw - 0.9, b: hw, color: i => (Math.floor(i / 2) % 2 ? this.c.kerbB : this.c.kerbA), y: 0.03 },
      { a: hw, b: hw + SHOULDER, color: (i, j) => this.sprinkle(i + 3, j) },
        ]
    const geo = ribbon(sp, bands, 2, this.theme.rainbow ? 7 : 2, 0, (_p, s) => this.inGap(s))
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }))
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.addGroundCollider(sp, WALL + 3, 0, s => this.inGap(s))
  }

  private buildShortcut(): void {
    const sp = this.short
    const L = sp.length
    const hw = SHORT_HALF
    const fluff2 = this.c.fluff.clone().multiplyScalar(0.92)
    const fluffAt = (i: number) => {
      const f = (i * 2) / L
      return f > this.fluff.from && f < this.fluff.to
    }
    const bands = [
      { a: -hw - 0.7, b: -hw, color: (i: number) => (Math.floor(i / 2) % 2 ? this.c.kerbA : this.c.kerbB), y: 0.03 },
      { a: -hw, b: 0, color: (i: number, j: number) => (fluffAt(i) ? (j % 2 ? this.c.fluff : fluff2) : this.c.caramel) },
      { a: 0, b: hw, color: (i: number, j: number) => (fluffAt(i) ? (j % 2 ? fluff2 : this.c.fluff) : this.c.caramel) },
      { a: hw, b: hw + 0.7, color: (i: number) => (Math.floor(i / 2) % 2 ? this.c.kerbB : this.c.kerbA), y: 0.03 },
    ]
    const geo = ribbon(sp, bands, 2, 2, -0.03, (p: THREE.Vector3) => this.insideMainFootprint(p, -0.4))
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }))
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.addGroundCollider(sp, SHORT_WALL + 2.5, -0.02)

    // Safety blocks along the slick workshop-floor detour (visual only).
    const puffGeo = new THREE.BoxGeometry(0.72, 0.16, 0.72)
    const puffs = new THREE.InstancedMesh(puffGeo, new THREE.MeshStandardMaterial({ color: this.theme.railB, flatShading: true, roughness: 0.8 }), 80)
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
          const col = k % 2 ? this.c.railA : this.c.railB
          rail(positions, colors, pa, pb, a.right, b.right, side, col)
          if (k % 4 === 0) posts.push(pa)
        }
      }
    }
    addWall(this.main, WALL, p => this.insideShortFootprint(p, 1.2) || this.inOpen(this.main.closest(p).s))
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
  private buildBridges(): void {
    for (const b of this.bridges) this.buildBridge(b.from, b.to)
  }

  private buildBridge(from: number, to: number): void {
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
  private buildHalls(): void {
    for (const h of this.halls) this.buildWorkshop(h.from, h.to, h.label)
    this.buildPresses()
  }

  private buildWorkshop(from: number, to: number, label: string): void {
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
      const sign = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 0.25), new THREE.MeshStandardMaterial({ map: labelTexture(label, this.theme.gate.beam), roughness: 0.6 }))
      sign.position.copy(smp.pos).setY(smp.pos.y + H + 1.3)
      sign.rotation.y = Math.atan2(smp.tan.x, smp.tan.z) + Math.PI + flip
      this.group.add(sign)
    }
  }

  private buildPresses(): void {
    const H = 8.5
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

function labelTexture(text: string, background = '#e30613'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 72
  const g = c.getContext('2d')!
  g.fillStyle = background
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

/** Arrows pointing sideways (u axis) for conveyors, wind and currents. */
function sideArrowTexture(bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.fillRect(0, 0, 128, 64)
  g.fillStyle = fg
  for (let k = 0; k < 2; k += 1) {
    const x = k * 64
    g.beginPath()
    g.moveTo(x + 14, 12)
    g.lineTo(x + 44, 32)
    g.lineTo(x + 14, 52)
    g.lineTo(x + 24, 32)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
