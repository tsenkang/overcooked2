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
 * Local multiplayer (split screen, up to four): every player owns one device, either one of four
 * keyboard zones or a gamepad. Pause stays shared (Esc / P / Start).
 */
export type PlayerSlot = 1 | 2 | 3 | 4
export const MAX_PLAYERS = 4
export type KeySet = 0 | 1 | 2 | 3
/** A local player's controls: a keyboard zone, or a gamepad by its browser slot. */
export type Device = { kind: 'keys'; set: KeySet } | { kind: 'pad'; index: number }
type DriveKeys = { left: string[]; right: string[]; accelerate: string[]; brake: string[]; drift: string[]; item: string[]; lookBack: string[]; caps: Record<'left' | 'right' | 'accelerate' | 'brake' | 'drift' | 'item' | 'lookBack', string> }
export const KEY_SETS: Record<KeySet, DriveKeys> = {
  0: {
    left: ['KeyA'], right: ['KeyD'], accelerate: ['KeyW'], brake: ['KeyS'], drift: ['ShiftLeft'], item: ['Space', 'KeyE'], lookBack: ['KeyC'],
    caps: { left: 'A', right: 'D', accelerate: 'W', brake: 'S', drift: 'Shift', item: 'Space', lookBack: 'C' },
  },
  1: {
    left: ['ArrowLeft'], right: ['ArrowRight'], accelerate: ['ArrowUp'], brake: ['ArrowDown'], drift: ['ShiftRight'], item: ['Enter', 'ControlRight', 'Slash'], lookBack: ['Period'],
    caps: { left: '←', right: '→', accelerate: '↑', brake: '↓', drift: 'Shift', item: 'Enter', lookBack: '.' },
  },
  2: {
    left: ['KeyJ'], right: ['KeyL'], accelerate: ['KeyI'], brake: ['KeyK'], drift: ['KeyU'], item: ['KeyO'], lookBack: ['KeyM'],
    caps: { left: 'J', right: 'L', accelerate: 'I', brake: 'K', drift: 'U', item: 'O', lookBack: 'M' },
  },
  3: {
    left: ['Numpad4'], right: ['Numpad6'], accelerate: ['Numpad8'], brake: ['Numpad5'], drift: ['Numpad0'], item: ['NumpadEnter', 'NumpadAdd'], lookBack: ['NumpadDecimal'],
    caps: { left: 'Num4', right: 'Num6', accelerate: 'Num8', brake: 'Num5', drift: 'Num0', item: 'NumEnter', lookBack: 'Num,' },
  },
}
const KEY_SET_IDS: KeySet[] = [0, 1, 2, 3]

/** One-shot lobby signal from a specific device: join, pick left/right, start, leave. */
export type DeviceEdge = { device: Device; action: 'join' | 'left' | 'right' | 'go' | 'back' }

export function sameDevice(a: Device, b: Device): boolean {
  return a.kind === b.kind && (a.kind === 'keys' ? a.set === (b as { set: KeySet }).set : a.index === (b as { index: number }).index)
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
type PadState = { index: number; steer: number; throttle: number; brake: number; moveX: number; moveY: number; held: Set<Action>; buttons: boolean[] }

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
  /** Last frame's raw buttons and stick direction per pad, for lobby edges. */
  private padRaw = new Map<number, { buttons: boolean[]; dir: number }>()
  private pads: PadState[] = []
  private edges: (DeviceEdge & { frame: number })[] = []
  private frame = 0
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
        for (const set of KEY_SET_IDS) {
          const k = KEY_SETS[set]
          const device: Device = { kind: 'keys', set }
          const edge = (action: DeviceEdge['action']) => this.edges.push({ device, action, frame: this.frame })
          if (k.accelerate.includes(e.code)) edge('join')
          if (k.left.includes(e.code)) edge('left')
          if (k.right.includes(e.code)) edge('right')
          if (k.item.includes(e.code)) edge('go')
        }
        for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
          if (codes.includes(e.code)) this.pressed_.add(action)
        }
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Slash' || e.code.startsWith('Numpad')) e.preventDefault()
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
      if (lx !== 0 || ly !== 0 || rt > 0.05 || lt > 0.05 || pad.buttons.some(b => b.pressed)) this.method = 'gamepad'
      // Lobby edges: A joins, X/Y/Start starts, B leaves, stick or d-pad flicks pick a racer.
      const buttons = pad.buttons.map(b => b.pressed)
      const raw = this.padRaw.get(pad.index)
      const down = (i: number) => buttons[i] && !raw?.buttons[i]
      const device: Device = { kind: 'pad', index: pad.index }
      const edge = (action: DeviceEdge['action']) => this.edges.push({ device, action, frame: this.frame })
      if (down(0)) edge('join')
      if (down(2) || down(3) || down(9)) edge('go')
      if (down(1)) edge('back')
      const dir = (lx || dpadX) > 0.6 ? 1 : (lx || dpadX) < -0.6 ? -1 : 0
      if (dir !== 0 && dir !== (raw?.dir ?? 0)) edge(dir > 0 ? 'right' : 'left')
      this.padRaw.set(pad.index, { buttons, dir })
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
        buttons,
      }
    })
    for (const index of [...this.padPrev.keys()]) if (!seen.has(index)) this.padPrev.delete(index)
    for (const index of [...this.padRaw.keys()]) if (!seen.has(index)) this.padRaw.delete(index)
    // Edges live for one rendered frame; whoever needs them (the lobby) takes them in that frame.
    this.edges = this.edges.filter(e => e.frame >= this.frame)
    this.frame += 1
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

  /** Gamepads connected right now. */
  get padCount(): number {
    return this.pads.length
  }

  /** Lobby: device signals since the last frame (join, pick, start, leave). */
  takeEdges(): DeviceEdge[] {
    const out = this.edges.map(({ device, action }) => ({ device, action }))
    this.edges = []
    return out
  }

  /** Driving axes from one player's own device (split screen). */
  deviceAxes(d: Device): { steer: number; throttle: number; brake: number } {
    if (d.kind === 'pad') {
      const pad = this.pads.find(p => p.index === d.index)
      return pad ? { steer: pad.steer, throttle: pad.throttle, brake: pad.brake } : { steer: 0, throttle: 0, brake: 0 }
    }
    const keys = KEY_SETS[d.set]
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    return { steer: (k(keys.right) ? 1 : 0) - (k(keys.left) ? 1 : 0), throttle: k(keys.accelerate) ? 1 : 0, brake: k(keys.brake) ? 1 : 0 }
  }

  deviceHeld(d: Device, action: 'drift' | 'item' | 'lookBack'): boolean {
    if (d.kind === 'pad') return !!this.pads.find(p => p.index === d.index)?.held.has(action)
    return KEY_SETS[d.set][action].some(code => this.keys.has(code))
  }

  /** Is this gamepad still plugged in? */
  padConnected(index: number): boolean {
    return this.pads.some(p => p.index === index)
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

  /** Gamepad rumble where supported (Chrome/Edge dual-rumble). With a device, only that player's pad. */
  rumble(strong: number, weak: number, ms: number, device?: Device): void {
    if (device === undefined && this.method !== 'gamepad') return
    if (device?.kind === 'keys') return
    const index = device === undefined ? this.pads[0]?.index : device.index
    if (index === undefined) return
    const pad = connectedPads().find(p => p.index === index) as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | undefined
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => undefined)
  }

  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
