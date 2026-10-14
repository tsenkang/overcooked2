/**
 * Unified input: keyboard, gamepad and touch all feed one action state plus three analog
 * driving axes. Gameplay reads `axes`, `held()` and `consume()`; it never checks raw keys.
 *
 * Driving: W/↑ throttle, S/↓ brake/reverse, A/D or ←/→ steer, Shift drift, Space item.
 * Gamepad: RT throttle, LT brake, left stick steer, RB/LB drift, X/Y item (A/B also drive).
 * Touch: on-screen stick + buttons call `setTouchSteer()` / `setTouchButton()`.
 */
export type Action = 'accelerate' | 'brake' | 'drift' | 'item' | 'pause' | 'confirm' | 'back' | 'lookBack'
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

const KEY_BINDINGS: Record<Action, string[]> = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  drift: ['ShiftLeft', 'ShiftRight'],
  item: ['Space', 'KeyE'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  // Menus handle Escape/Backspace through DOM keydown; `back` is the gamepad B button.
  back: [],
  lookBack: ['KeyC'],
}
const STEER_KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }

/**
 * Local two-player on one keyboard (split screen): the left hand drives Player 1, the right hand
 * drives Player 2. Pause stays shared (Esc / P).
 */
export type PlayerSlot = 1 | 2
type DriveKeys = { left: string[]; right: string[]; accelerate: string[]; brake: string[]; drift: string[]; item: string[]; lookBack: string[] }
export const SPLIT_KEYS: Record<PlayerSlot, DriveKeys> = {
  1: { left: ['KeyA'], right: ['KeyD'], accelerate: ['KeyW'], brake: ['KeyS'], drift: ['ShiftLeft'], item: ['Space', 'KeyE'], lookBack: ['KeyC'] },
  2: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    accelerate: ['ArrowUp'],
    brake: ['ArrowDown'],
    drift: ['ShiftRight', 'Numpad0'],
    item: ['Enter', 'NumpadEnter', 'ControlRight', 'Slash'],
    lookBack: ['Period', 'NumpadDecimal'],
  },
}
// Standard mapping: A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Back=8 Start=9 L3=10 R3=11 D-pad 12..15.
const PAD_BINDINGS: Record<Action, number[]> = {
  accelerate: [7, 0],
  brake: [6, 1],
  drift: [5, 4],
  item: [2, 3],
  pause: [9],
  confirm: [0],
  back: [1],
  lookBack: [11],
}

/** One connected gamepad, sampled this frame. */
type PadState = { index: number; steer: number; throttle: number; brake: number; moveX: number; moveY: number; held: Set<Action> }

/** Connected gamepads in slot order. Never throws (a frame's permissions policy can block the API). */
function connectedPads(): Gamepad[] {
  try {
    // Some browsers report connected=false for one frame after focus changes; the slot itself is enough.
    return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => p != null).sort((a, b) => a.index - b.index)
  } catch {
    return []
  }
}

/** The value pushed furthest from zero (so an idle source never cancels an active one). */
function strongest(values: number[]): number {
  return values.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0)
}

export class Input {
  /** Driving axes: steer -1..1 (right +), throttle/brake 0..1. */
  readonly axes = { steer: 0, throttle: 0, brake: 0 }
  readonly keyboardAxes = { steer: 0, throttle: 0, brake: 0 }
  readonly gamepadAxes = { steer: 0, throttle: 0, brake: 0 }
  /** Menu navigation vector in [-1, 1] (x right, y up). */
  readonly move = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  /** Touch play accelerates automatically (setting). */
  autoThrottle = true
  private keys = new Set<string>()
  private held_ = new Set<Action>()
  private pressed_ = new Set<Action>()
  private touchSteer = 0
  private touchButtons = new Set<Action>()
  private padPrev = new Map<number, Set<Action>>()
  private pads: PadState[] = []
  /** Pad indices in the order they were first used; idle or phantom pads never get a player. */
  private padOrder: number[] = []
  /** Which half of the keyboard last steered or pedalled (split screen). */
  private lastKeyboardHalf: PlayerSlot | 0 = 0
  private gamepadHeld_ = new Set<Action>()
  private listeners: Array<() => void> = []

  constructor() {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn as EventListener)
      this.listeners.push(() => window.removeEventListener(type, fn as EventListener))
    }
    on('keydown', e => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
      if (typing) return
      if (!e.repeat) {
        this.keys.add(e.code)
        this.method = 'keyboard'
        for (const slot of [1, 2] as PlayerSlot[]) {
          const k = SPLIT_KEYS[slot]
          if ([...k.left, ...k.right, ...k.accelerate, ...k.brake].includes(e.code)) this.lastKeyboardHalf = slot
        }
        for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
          if (codes.includes(e.code)) this.pressed_.add(action)
        }
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Slash') e.preventDefault()
    })
    on('keyup', e => this.keys.delete(e.code))
    on('blur', () => this.keys.clear())
  }

  /** Touch controls: steer from the on-screen stick. */
  setTouchSteer(x: number): void {
    this.method = 'touch'
    this.touchSteer = Math.max(-1, Math.min(1, x))
  }

  setTouchButton(action: Action, down: boolean): void {
    this.method = 'touch'
    if (down && !this.touchButtons.has(action)) this.pressed_.add(action)
    if (down) this.touchButtons.add(action)
    else this.touchButtons.delete(action)
  }

  /** Sample continuous sources. Call once per rendered frame before gameplay reads input. */
  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let steer = (k(STEER_KEYS.right) ? 1 : 0) - (k(STEER_KEYS.left) ? 1 : 0)
    let throttle = k(KEY_BINDINGS.accelerate) ? 1 : 0
    let brake = k(KEY_BINDINGS.brake) ? 1 : 0
    let mx = steer
    let my = throttle - brake
    this.held_.clear()
    this.gamepadHeld_.clear()
    this.gamepadAxes.steer = this.gamepadAxes.throttle = this.gamepadAxes.brake = 0
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
      if (k(codes)) this.held_.add(action)
    }
    for (const action of this.touchButtons) this.held_.add(action)
    if (this.method === 'touch') {
      steer = this.touchSteer
      mx = this.touchSteer
      throttle = this.touchButtons.has('brake') ? 0 : this.autoThrottle || this.touchButtons.has('accelerate') ? 1 : 0
      brake = this.touchButtons.has('brake') ? 1 : 0
    }

    // Every connected gamepad is sampled on its own so split screen can give each player a pad.
    const dead = (v: number, d = 0.16) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d))
    const seen = new Set<number>()
    this.pads = connectedPads().map(pad => {
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const rt = pad.buttons[7]?.value ?? 0
      const lt = pad.buttons[6]?.value ?? 0
      const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
      const dpadY = (pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0)
      if (lx !== 0 || ly !== 0 || rt > 0.05 || lt > 0.05 || pad.buttons.some(b => b.pressed)) {
        this.method = 'gamepad'
        if (!this.padOrder.includes(pad.index)) this.padOrder.push(pad.index)
      }
      const held = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) {
        if (buttons.some(i => pad.buttons[i]?.pressed)) held.add(action)
      }
      const prev = this.padPrev.get(pad.index)
      for (const action of held) if (!prev?.has(action)) this.pressed_.add(action)
      this.padPrev.set(pad.index, held)
      seen.add(pad.index)
      return {
        index: pad.index,
        steer: lx || dpadX,
        throttle: Math.max(rt > 0.05 ? rt : 0, pad.buttons[0]?.pressed ? 1 : 0),
        brake: Math.max(lt > 0.05 ? lt : 0, pad.buttons[1]?.pressed ? 1 : 0),
        moveX: lx || dpadX,
        moveY: -ly || dpadY,
        held,
      }
    })
    for (const index of [...this.padPrev.keys()]) if (!seen.has(index)) this.padPrev.delete(index)
    this.padOrder = this.padOrder.filter(index => seen.has(index))
    if (this.pads.length) {
      // Solo play and menus: any pad drives.
      const merged = {
        steer: strongest(this.pads.map(p => p.steer)),
        throttle: Math.max(...this.pads.map(p => p.throttle)),
        brake: Math.max(...this.pads.map(p => p.brake)),
      }
      if (this.method === 'gamepad') {
        steer = merged.steer
        throttle = merged.throttle
        brake = merged.brake
        mx = strongest(this.pads.map(p => p.moveX))
        my = strongest(this.pads.map(p => p.moveY))
      }
      for (const p of this.pads) for (const action of p.held) {
        this.held_.add(action)
        this.gamepadHeld_.add(action)
      }
      Object.assign(this.gamepadAxes, merged)
    }
    this.axes.steer = Math.max(-1, Math.min(1, steer))
    this.axes.throttle = Math.max(0, Math.min(1, throttle))
    this.axes.brake = Math.max(0, Math.min(1, brake))
    this.move.x = mx
    this.move.y = my
    this.keyboardAxes.steer = Math.max(-1, Math.min(1, (k(STEER_KEYS.right) ? 1 : 0) - (k(STEER_KEYS.left) ? 1 : 0)))
    this.keyboardAxes.throttle = k(KEY_BINDINGS.accelerate) ? 1 : 0
    this.keyboardAxes.brake = k(KEY_BINDINGS.brake) ? 1 : 0
  }

  held(action: Action): boolean {
    return this.held_.has(action)
  }

  keyboardHeld(action: Action): boolean {
    const codes = KEY_BINDINGS[action]
    return codes.some(code => this.keys.has(code))
  }

  gamepadHeld(action: Action): boolean {
    return this.gamepadHeld_.has(action)
  }

  /** Gamepads that have been used (connected but untouched pads don't count). */
  get padCount(): number {
    return this.activePads().length
  }

  private activePads(): PadState[] {
    return this.padOrder.map(i => this.pads.find(p => p.index === i)).filter((p): p is PadState => !!p)
  }

  /**
   * Which gamepad a split-screen player owns. Two used pads: the first one touched drives P1,
   * the second P2. One pad: it drives the kart the keyboard is not driving (WASD in use → P2,
   * arrows in use → P1, keyboard untouched → P1), so a keyboard player and a pad player never
   * end up on the same kart.
   */
  private padFor(slot: PlayerSlot): PadState | undefined {
    const pads = this.activePads()
    if (pads.length >= 2) return pads[slot - 1]
    const owner: PlayerSlot = this.lastKeyboardHalf === 1 ? 2 : 1
    return slot === owner ? pads[0] : undefined
  }

  /**
   * Split-screen driving: each player's half of the keyboard plus their own gamepad, if any.
   * Whichever source pushes harder wins, so both work without a setting.
   */
  splitAxes(slot: PlayerSlot): { steer: number; throttle: number; brake: number } {
    const keys = SPLIT_KEYS[slot]
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    const out = { steer: (k(keys.right) ? 1 : 0) - (k(keys.left) ? 1 : 0), throttle: k(keys.accelerate) ? 1 : 0, brake: k(keys.brake) ? 1 : 0 }
    const pad = this.padFor(slot)
    if (pad) {
      out.steer = strongest([out.steer, pad.steer])
      out.throttle = Math.max(out.throttle, pad.throttle)
      out.brake = Math.max(out.brake, pad.brake)
    }
    return out
  }

  splitHeld(slot: PlayerSlot, action: 'drift' | 'item' | 'lookBack'): boolean {
    const held = SPLIT_KEYS[slot][action].some(code => this.keys.has(code))
    return held || !!this.padFor(slot)?.held.has(action)
  }

  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }

  /** Read and clear a press (use inside fixed simulation steps). */
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }

  clearPresses(): void {
    this.pressed_.clear()
  }

  /** Gamepad rumble where supported (Chrome/Edge dual-rumble). With a slot, only that player's pad. */
  rumble(strong: number, weak: number, ms: number, slot?: PlayerSlot): void {
    if (slot === undefined && this.method !== 'gamepad') return
    const index = slot === undefined ? this.pads[0]?.index : this.padFor(slot)?.index
    if (index === undefined) return
    const pad = connectedPads().find(p => p.index === index) as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | undefined
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => undefined)
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
