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

// ─── Analógico ──────────────────────────────────────────────────────────────
const STICK_DEADZONE = 0.22;

/**
 * Zona morta com reescala suave: em vez de cortar tudo abaixo do limite (o que
 * faz o chef pular de parado pra velocidade máxima no instante em que passa do
 * limite), reaproveita o trecho 0..limite pra uma rampa de 0 a 1. Fica macio
 * tanto puxando de leve quanto no fundo do curso.
 */
function applyDeadzone(x: number, y: number, dz: number): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag < dz) return [0, 0];
  const scaled = Math.min(1, (mag - dz) / (1 - dz)) / mag;
  return [x * scaled, y * scaled];
}

/** Um controle "padrão" do Gamepad API: botões e eixos nas posições de sempre. */
export interface GamepadSlot {
  /** índice bruto que o navegador deu a esse controle (pode não ser 0/1) */
  rawIndex: number;
  id: string;
}

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** estado anterior dos botões, por índice BRUTO do navegador — não por slot
   * lógico de jogador, porque esse índice é estável mesmo se a ordem dos
   * controles conectados mudar de um quadro pro outro. */
  private prevButtons = new Map<number, boolean[]>();
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

  /**
   * Controles de verdade conectados agora, em ordem estável (pelo índice que
   * o navegador deu, que é o que existe desde a primeira vez que o controle
   * mandou um botão — plugar um 2º controle nunca reordena o 1º).
   *
   * O bug que isso corrige: a versão antiga lia getGamepads()[0] pro jogador 1
   * e [1] pro jogador 2. Só que esse índice é a POSIÇÃO NA LISTA do navegador,
   * não "o primeiro controle plugado" — se só um controle está ligado e ele
   * calhou de ocupar o slot 1 (comum depois de desconectar e reconectar, ou
   * com controle via Bluetooth), o jogador 1 ficava sem resposta nenhuma.
   */
  private connectedPads(): (Gamepad | null)[] {
    const raw = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const found: Gamepad[] = [];
    for (const gp of raw) if (gp) found.push(gp);
    found.sort((a, b) => a.index - b.index);
    return found;
  }

  /** Pra UI: quantos controles estão plugados e respondendo agora. */
  gamepadCount(): number {
    return this.connectedPads().length;
  }

  private readPad(gp: Gamepad): PadState {
    const b = gp.buttons.map((x) => x.pressed);
    const prev = this.prevButtons.get(gp.index) ?? [];
    const edge = (k: number) => !!b[k] && !prev[k];
    this.prevButtons.set(gp.index, b);
    if (edge(9)) this.pausePressed = true;

    let mx = gp.axes[0] ?? 0;
    let my = gp.axes[1] ?? 0;
    [mx, my] = applyDeadzone(mx, my, STICK_DEADZONE);
    if (b[14]) mx = -1; // d-pad
    if (b[15]) mx = 1;
    if (b[12]) my = -1;
    if (b[13]) my = 1;

    return {
      mx,
      my,
      grab: edge(0), // A
      use: edge(2), // X
      useHeld: !!b[2],
      dash: edge(1), // B
      swap: edge(4) || edge(5), // LB / RB
    };
  }

  /** Lê o estado dos dois jogadores e zera os "apertou agora". */
  poll(): [PadState, PadState] {
    const k1 = this.keyboard('p1');
    const k2 = this.keyboard('p2');
    const pads = this.connectedPads();
    const g1 = pads[0] ? this.readPad(pads[0]) : null;
    const g2 = pads[1] ? this.readPad(pads[1]) : null;
    this.pressed.clear();
    return [merge(k1, g1), merge(k2, g2)];
  }

  consumePause() {
    const p = this.pausePressed;
    this.pausePressed = false;
    return p;
  }

  /** Dá um "tap" no controle (se ele suportar), pra feedback tátil em eventos
   * marcantes — nocautear o ladrão, entregar um pedido, pegar fogo. Falha
   * calada em controles/navegadores sem suporte. */
  rumble(slot: 0 | 1, strength: number, durationMs: number) {
    try {
      const pads = this.connectedPads();
      const gp = pads[slot] as (Gamepad & { vibrationActuator?: { playEffect: (type: string, params: object) => Promise<unknown> } }) | undefined;
      void gp?.vibrationActuator?.playEffect('dual-rumble', {
        duration: durationMs,
        strongMagnitude: strength,
        weakMagnitude: strength * 0.7,
      });
    } catch {
      /* controle sem suporte a vibração: ignora */
    }
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
