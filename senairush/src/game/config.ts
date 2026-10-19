import type { KartSpec } from '../engine/kart'

/**
 * Arcade kart physics shared by the supplied Critter Kart source. Gameplay code reads CONFIG so
 * the development Tweak catalog can safely adjust real consumers without a second parameter store.
 */
export const BASE_KART: KartSpec = {
  radius: 0.62,
  rideHeight: 0.62,
  mass: 1,
  maxSpeed: 25,
  accel: 17,
  reverseSpeed: 8,
  brakeDecel: 32,
  coastDecel: 5,
  turnRate: 2.05,
  grip: 11,
  driftGrip: 2.4,
  driftWide: 0.2,
  driftTight: 0.82,
  driftMinSpeed: 10,
  hopSpeed: 5.4,
  gravity: -34,
  maxFall: -42,
  tiers: [0.75, 1.65, 2.7],
  tierBoost: [0.55, 1.0, 1.5],
  boostSpeed: 32,
  boostAccel: 46,
  wallGlance: 0.6,
}

export const DEFAULT_CONFIG = {
  race: {
    laps: 3,
    racers: 6,
    countdown: 3,
    /** Throttle held within this window before GO earns a start boost. */
    startBoostWindow: 0.45,
    /** Throttle held earlier than this (seconds before GO) stalls the engine briefly. */
    stallBefore: 1.6,
    killDepth: 14,
    respawnSeconds: 1.1,
    /** Metres back down the road a fallen racer is put back. */
    respawnBack: 30,
    /** Seconds after the player finishes before the results screen. */
    resultsDelay: 3.2,
  },
  surface: {
    offroadSpeed: 0.74,
    offroadGrip: 0.85,
    /** The shortcut is a slick workshop-floor detour. */
    fluffSpeed: 0.5,
  },
  items: {
    boxRespawn: 3.2,
    roulette: 1.1,
    shieldSeconds: 8,
    pepperSeconds: 1.7,
    pepperPower: 1.2,
    trapStick: 1.35,
    trapLife: 40,
    maxTraps: 10,
    beeSpeed: 40,
    beeLife: 9,
    beeSpin: 1.25,
    /** Distance at which a bee stops following the track and dives at its target. */
    beeHoming: 22,
    /** Turbo Star: invincible, faster, knocks rivals aside. */
    starSeconds: 7,
    starPower: 1.17,
    /** Power Outage: every rival shrinks and slows. */
    boltShrink: 4,
    boltSlow: 0.72,
    /** Workshop Bomb: lobbed ahead, blows up on a fuse or on contact. */
    bombFuse: 2.4,
    bombRadius: 7,
    /** Turbo Tyre: rolls straight down the track in its lane. */
    wheelSpeed: 46,
    wheelLife: 4.5,
  },
  ai: {
    /** Catch-up: top-speed multiplier range relative to the player's track distance. */
    catchUpMax: 0.07,
    slowDownMax: 0.06,
    catchUpRange: 140,
    shortcutChance: [0.15, 0.35, 0.55, 0.7, 0.85],
    /**
     * Difficulty levels. `skills` go to the AI field from the front of the grid back; `speed` scales
     * their top speed; the catch-up pair is the rubber band; `itemDelay` is how long they sit on items.
     */
    levels: {
      easy: { skills: [0.78, 0.7, 0.62, 0.55, 0.5], speed: 0.95, catchUpMax: 0.03, slowDownMax: 0.08, itemDelay: 0.7, startBoost: 0.35 },
      normal: { skills: [0.97, 0.92, 0.87, 0.82, 0.77], speed: 1.0, catchUpMax: 0.08, slowDownMax: 0.04, itemDelay: 0.3, startBoost: 0.65 },
      hard: { skills: [1, 0.98, 0.95, 0.92, 0.89], speed: 1.03, catchUpMax: 0.1, slowDownMax: 0.02, itemDelay: 0.15, startBoost: 0.85 },
      insane: { skills: [1, 1, 1, 1, 0.98], speed: 1.045, catchUpMax: 0.17, slowDownMax: 0, itemDelay: 0.05, startBoost: 1 },
    },
  },
  camera: {
    fov: 64,
    boostFov: 80,
    distance: 6.2,
    height: 2.35,
    lookAhead: 5,
    follow: 9,
  },
} as const

type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends readonly number[] ? T[K] : T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }

/** Active values are intentionally separate from immutable source defaults for Tweak Reset/Save. */
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)

export type ItemKind = 'shield' | 'pepper' | 'taffy' | 'bee' | 'triple' | 'star' | 'bolt' | 'bomb' | 'wheel'
export const ITEM_KINDS: ItemKind[] = ['shield', 'pepper', 'taffy', 'bee', 'triple', 'star', 'bolt', 'bomb', 'wheel']

/** Character stats on a 1..5 scale; mapped to small spec deltas so every pick is viable. */
export type Stats = { speed: number; accel: number; handling: number; weight: number }

export function specFor(stats: Stats): KartSpec {
  const d = (v: number) => (v - 3) / 2 // -1..1
  return {
    ...BASE_KART,
    maxSpeed: BASE_KART.maxSpeed * (1 + d(stats.speed) * 0.035),
    boostSpeed: BASE_KART.boostSpeed * (1 + d(stats.speed) * 0.025),
    accel: BASE_KART.accel * (1 + d(stats.accel) * 0.14),
    turnRate: BASE_KART.turnRate * (1 + d(stats.handling) * 0.07),
    driftTight: BASE_KART.driftTight * (1 + d(stats.handling) * 0.05),
    grip: BASE_KART.grip * (1 + d(stats.handling) * 0.12),
    mass: 1 + d(stats.weight) * 0.35,
  }
}
