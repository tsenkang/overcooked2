// Entrada unificada: teclado (2 jogadores) + controles (Gamepad API).

export interface PadState {
  mx: number;
  my: number;
  grab: boolean; // apertou agora
  use: boolean; // apertou agora
  useHeld: boolean;
  dash: boolean;
  swap: boolean;
}

export const KEYMAP = {
  p1: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    grab: ['Space'],
    use: ['KeyE'],
    dash: ['ShiftLeft'],
    swap: ['KeyQ'],
  },
  p2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    grab: ['Enter', 'NumpadEnter', 'Numpad1', 'KeyK'],
    use: ['ShiftRight', 'Numpad2', 'KeyL'],
    dash: ['ControlRight', 'Numpad3', 'Semicolon'],
    swap: ['Numpad0'],
  },
};

const GAME_CODES = new Set(Object.values(KEYMAP).flatMap((m) => Object.values(m).flat()));

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private prevPad: boolean[][] = [[], [], [], []];
  pausePressed = false;

  private onDown = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code) || e.code === 'Tab') e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') this.pausePressed = true;
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => this.down.clear();

  attach() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }
  detach() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private anyDown(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }
  private anyPressed(codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }

  private keyboard(which: 'p1' | 'p2'): PadState {
    const m = KEYMAP[which];
    return {
      mx: (this.anyDown(m.right) ? 1 : 0) - (this.anyDown(m.left) ? 1 : 0),
      my: (this.anyDown(m.down) ? 1 : 0) - (this.anyDown(m.up) ? 1 : 0),
      grab: this.anyPressed(m.grab),
      use: this.anyPressed(m.use),
      useHeld: this.anyDown(m.use),
      dash: this.anyPressed(m.dash),
      swap: this.anyPressed(m.swap) || (which === 'p1' && this.pressed.has('Tab')),
    };
  }

  private gamepad(i: number): PadState | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[i];
    if (!gp) return null;
    const b = gp.buttons.map((x) => x.pressed);
    const prev = this.prevPad[i];
    const edge = (k: number) => !!b[k] && !prev[k];
    this.prevPad[i] = b;
    if (edge(9)) this.pausePressed = true;
    let mx = gp.axes[0] ?? 0;
    let my = gp.axes[1] ?? 0;
    if (Math.hypot(mx, my) < 0.25) {
      mx = 0;
      my = 0;
    }
    if (b[14]) mx = -1;
    if (b[15]) mx = 1;
    if (b[12]) my = -1;
    if (b[13]) my = 1;
    return {
      mx,
      my,
      grab: edge(0),
      use: edge(2),
      useHeld: !!b[2],
      dash: edge(1),
      swap: edge(4) || edge(5),
    };
  }

  /** Lê o estado dos dois jogadores e zera os "apertou agora". */
  poll(): [PadState, PadState] {
    const k1 = this.keyboard('p1');
    const k2 = this.keyboard('p2');
    const g1 = this.gamepad(0);
    const g2 = this.gamepad(1);
    this.pressed.clear();
    return [merge(k1, g1), merge(k2, g2)];
  }

  consumePause() {
    const p = this.pausePressed;
    this.pausePressed = false;
    return p;
  }
}

function merge(a: PadState, b: PadState | null): PadState {
  if (!b) return a;
  return {
    mx: a.mx || b.mx,
    my: a.my || b.my,
    grab: a.grab || b.grab,
    use: a.use || b.use,
    useHeld: a.useHeld || b.useHeld,
    dash: a.dash || b.dash,
    swap: a.swap || b.swap,
  };
}
