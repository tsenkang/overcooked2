import { sfx } from './audio';
import { CHOPPABLE, RECIPES, canAddPart, matchRecipe } from './content';
import type { PadState } from './input';
import type {
  FoodId,
  FoodItem,
  GameState,
  Item,
  LevelDef,
  PlateItem,
  Player,
  Tile,
  TileType,
  VesselItem,
} from './types';
import { TUNING as K } from './types';

// ─── Criação ────────────────────────────────────────────────────────────────
const CRATES: Record<string, FoodId> = { T: 'tomato', O: 'onion', L: 'lettuce', M: 'meat', B: 'bun' };

export function createGame(level: LevelDef, solo: boolean): GameState {
  const h = level.map.length;
  const w = level.map[0].length;
  const tiles: Tile[][] = [];
  const spawns: Record<string, { x: number; y: number }> = {};

  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) {
      const c = level.map[y][x] ?? ' ';
      let type: TileType = 'floor';
      let item: Item | null = null;
      let crateFood: FoodId | undefined;
      switch (c) {
        case '.': type = 'floor'; break;
        case ' ': type = 'void'; break;
        case '~': type = 'gap'; break;
        case '#': type = 'counter'; break;
        case 'K': type = 'board'; break;
        case 'S': type = 'stove'; item = vessel('pot', x, y); break;
        case 'F': type = 'stove'; item = vessel('pan', x, y); break;
        case 'W': type = 'serve'; break;
        case 'R': type = 'return'; break;
        case 'X': type = 'trash'; break;
        case 'Z': type = 'sink'; break;
        case 'D': type = 'rack'; break;
        case 'P': type = 'counter'; item = { k: 'plate', parts: [] }; break;
        case 'E': type = 'counter'; item = { k: 'ext', home: { x, y } }; break;
        case '1':
        case '2':
          type = 'floor';
          spawns[c] = { x: x + 0.5, y: y + 0.5 };
          break;
        default:
          if (CRATES[c]) {
            type = 'crate';
            crateFood = CRATES[c];
          }
      }
      row.push({ type, x, y, item, crateFood, fire: 0, fireSpread: 0, sinkDirty: 0, washP: 0 });
    }
    tiles.push(row);
  }

  const s1 = spawns['1'] ?? { x: 2.5, y: 2.5 };
  const s2 = spawns['2'] ?? { x: w - 2.5, y: 2.5 };
  const players = [
    makePlayer(1, s1, '#2f7de1', '#ffd23f', '1'),
    makePlayer(2, s2, '#ef5a3c', '#7ee0c3', '2'),
  ];
  if (solo) players[1].active = false;

  return {
    level,
    w,
    h,
    tiles,
    players,
    orders: [],
    projectiles: [],
    floorItems: [],
    floats: [],
    particles: [],
    pendingPlates: [],
    respawns: [],
    score: 0,
    delivered: 0,
    failed: 0,
    tipsTotal: 0,
    combo: 0,
    time: level.duration,
    orderTimer: 0,
    orderId: 0,
    countdown: 4.6,
    over: false,
    overT: 0,
    gapPhase: 'closed',
    gapT: level.gap?.closed ?? 0,
    clock: 0,
    solo,
    shake: 0,
  };
}

function vessel(k: 'pot' | 'pan', x: number, y: number): VesselItem {
  return { k, contents: [], p: 0, burnt: false, smoke: 0, home: { x, y } };
}

function makePlayer(id: number, s: { x: number; y: number }, body: string, accent: string, label: string): Player {
  return {
    id, x: s.x, y: s.y, vx: 0, vy: 0, dirX: 0, dirY: 1, held: null, target: null, working: null,
    dashT: 0, dashCd: 0, walk: 0, spraying: false, dead: 0, spawn: { ...s }, body, accent, label, active: true,
  };
}

// ─── Consultas ──────────────────────────────────────────────────────────────
export function tileAt(gs: GameState, x: number, y: number): Tile | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (ty < 0 || ty >= gs.h || tx < 0 || tx >= gs.w) return null;
  return gs.tiles[ty][tx];
}

export function isSolid(t: Tile | null): boolean {
  if (!t) return true;
  return t.type !== 'floor' && t.type !== 'void' && t.type !== 'gap';
}

function isHole(gs: GameState, t: Tile | null): boolean {
  if (!t) return false;
  return t.type === 'void' || (t.type === 'gap' && gs.gapPhase === 'open');
}

const FLAMMABLE: TileType[] = ['counter', 'board', 'stove', 'crate', 'rack', 'return'];

export function potDone(v: VesselItem): number {
  return v.k === 'pot' ? v.contents.length * K.potPer : K.panCook;
}
export function vesselReady(v: VesselItem): boolean {
  if (v.burnt || v.contents.length === 0) return false;
  if (v.k === 'pot') return v.contents.length === 3 && v.p >= potDone(v);
  return v.p >= K.panCook;
}
export function vesselBurnLimit(v: VesselItem): number {
  return potDone(v) + (v.k === 'pot' ? K.potBurnAfter : K.panBurnAfter);
}

function foodToken(f: FoodItem): string | null {
  if (f.s === 'chopped' && (f.f === 'lettuce' || f.f === 'tomato')) return `${f.f}:chopped`;
  if (f.f === 'bun' && f.s === 'raw') return 'bun:raw';
  if (f.f === 'meat' && f.s === 'cooked') return 'meat:cooked';
  return null;
}

function vesselAccepts(v: VesselItem, f: FoodItem): boolean {
  if (v.burnt || f.s !== 'chopped') return false;
  if (v.k === 'pot') {
    return (f.f === 'tomato' || f.f === 'onion') && v.contents.length < 3 && (v.contents.length === 0 || v.contents[0] === f.f);
  }
  return f.f === 'meat' && v.contents.length === 0;
}

function resetVessel(v: VesselItem) {
  v.contents = [];
  v.p = 0;
  v.burnt = false;
  v.smoke = 0;
}

function pour(gs: GameState, plate: PlateItem, v: VesselItem): boolean {
  if (!vesselReady(v)) return false;
  const tok = v.k === 'pot' ? `soup:${v.contents[0]}` : 'meat:cooked';
  if (!canAddPart(plate.parts, tok, gs.level.recipes)) return false;
  plate.parts.push(tok);
  resetVessel(v);
  return true;
}

// ─── Atualização principal ─────────────────────────────────────────────────
let lastWarnBeat = -1;
let lastChopBeat = -1;

export function update(gs: GameState, dt: number, pads: [PadState, PadState]) {
  gs.clock += dt;
  gs.shake = Math.max(0, gs.shake - dt * 3);
  updateFx(gs, dt);

  if (gs.over) {
    gs.overT += dt;
    return;
  }

  if (gs.countdown > 0) {
    const before = Math.ceil(gs.countdown - 0.6);
    gs.countdown -= dt;
    const after = Math.ceil(gs.countdown - 0.6);
    if (after !== before) {
      if (after > 0) sfx.count();
      else if (after === 0) sfx.go();
    }
    if (gs.countdown <= 0) {
      spawnOrder(gs);
      gs.orderTimer = 5;
    }
    return;
  }

  // tempo
  gs.time -= dt;
  if (gs.time <= 0) {
    gs.time = 0;
    gs.over = true;
    for (const p of gs.players) p.working = null;
    sfx.end();
    return;
  }

  // controles → jogadores
  if (gs.solo) {
    const [a, b] = gs.players;
    if (pads[0].swap) {
      a.active = !a.active;
      b.active = !b.active;
      sfx.pick();
    }
    const act = a.active ? a : b;
    const idle = a.active ? b : a;
    updatePlayer(gs, act, pads[0], dt);
    updatePlayer(gs, idle, EMPTY_PAD, dt);
  } else {
    updatePlayer(gs, gs.players[0], pads[0], dt);
    updatePlayer(gs, gs.players[1], pads[1], dt);
  }
  separatePlayers(gs);

  updateProjectiles(gs, dt);
  updateStations(gs, dt);
  updateGap(gs, dt);
  updateOrders(gs, dt);

  // pratos voltando
  for (let i = gs.pendingPlates.length - 1; i >= 0; i--) {
    gs.pendingPlates[i] -= dt;
    if (gs.pendingPlates[i] <= 0) {
      gs.pendingPlates.splice(i, 1);
      returnPlate(gs);
    }
  }
  // itens renascendo (panela/extintor que caíram)
  for (let i = gs.respawns.length - 1; i >= 0; i--) {
    const r = gs.respawns[i];
    r.t -= dt;
    if (r.t <= 0) {
      const home = 'home' in r.item ? r.item.home : null;
      let spot = home ? gs.tiles[home.y][home.x] : null;
      if (!spot || spot.item) spot = findFreeCounter(gs);
      if (spot) {
        spot.item = r.item;
        gs.respawns.splice(i, 1);
      } else r.t = 1;
    }
  }
}

const EMPTY_PAD: PadState = { mx: 0, my: 0, grab: false, use: false, useHeld: false, dash: false, swap: false };

function findFreeCounter(gs: GameState): Tile | null {
  for (const row of gs.tiles) for (const t of row) if (t.type === 'counter' && !t.item && t.fire <= 0) return t;
  return null;
}

// ─── Jogador ────────────────────────────────────────────────────────────────
function updatePlayer(gs: GameState, p: Player, pad: PadState, dt: number) {
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.dead > 0) {
    p.dead -= dt;
    if (p.dead <= 0) {
      p.dead = 0;
      p.x = p.spawn.x;
      p.y = p.spawn.y;
      p.vx = p.vy = 0;
      burst(gs, p.x, p.y, '#ffffff', 14);
    }
    return;
  }

  let mx = pad.mx;
  let my = pad.my;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  if (mag > 0.15) {
    const n = Math.hypot(mx, my);
    p.dirX = mx / n;
    p.dirY = my / n;
    p.working = null;
  }

  if (pad.dash && p.dashCd <= 0) {
    p.dashT = K.dashTime;
    p.dashCd = K.dashCooldown;
    p.working = null;
    sfx.dash();
    for (let i = 0; i < 6; i++) puff(gs, p.x, p.y + 0.2, '#ffffff', 0.5);
  }

  let tvx = mx * K.speed;
  let tvy = my * K.speed;
  if (p.dashT > 0) {
    p.dashT -= dt;
    tvx = p.dirX * K.dashSpeed;
    tvy = p.dirY * K.dashSpeed;
  }
  const a = Math.min(1, K.accel * dt);
  p.vx += (tvx - p.vx) * (p.dashT > 0 ? 1 : a);
  p.vy += (tvy - p.vy) * (p.dashT > 0 ? 1 : a);

  moveWithCollision(gs, p, p.vx * dt, p.vy * dt);

  const speed = Math.hypot(p.vx, p.vy);
  p.walk += dt * (speed > 0.3 ? speed * 2.4 : 0);

  // caiu no buraco?
  if (isHole(gs, tileAt(gs, p.x, p.y))) {
    killPlayer(gs, p);
    return;
  }

  p.target = findTarget(gs, p);

  if (pad.grab) doGrab(gs, p);
  if (pad.use) doUse(gs, p);

  p.spraying = p.held?.k === 'ext' && pad.useHeld;
  if (p.spraying) spray(gs, p, dt);

  // trabalho contínuo (cortar / lavar)
  const w = p.working;
  if (w) {
    if (p.target !== w || w.fire > 0 || p.held) p.working = null;
    else if (w.type === 'board' && w.item?.k === 'food' && w.item.s === 'raw') {
      const f = w.item;
      f.chop += dt / K.chopTime;
      const beat = Math.floor(gs.clock * 6);
      if (beat !== lastChopBeat) {
        lastChopBeat = beat;
        sfx.chop();
        puff(gs, w.x + 0.5, w.y + 0.4, '#ffffff', 0.3);
      }
      if (f.chop >= 1) {
        f.chop = 1;
        f.s = 'chopped';
        p.working = null;
        sfx.done();
      }
    } else if (w.type === 'sink' && w.sinkDirty > 0) {
      w.washP += dt / K.washTime;
      if (Math.random() < dt * 12) bubble(gs, w.x + 0.5, w.y + 0.3);
      if (Math.floor(gs.clock * 4) !== Math.floor((gs.clock - dt) * 4)) sfx.wash();
      if (w.washP >= 1) {
        w.washP = 0;
        w.sinkDirty--;
        addToRack(gs);
        sfx.done();
        if (w.sinkDirty <= 0) p.working = null;
      }
    } else p.working = null;
  }
}

function killPlayer(gs: GameState, p: Player) {
  p.dead = K.respawn;
  p.working = null;
  sfx.fall();
  if (p.held) {
    loseItem(gs, p.held);
    p.held = null;
  }
  addFloat(gs, p.x, p.y - 0.5, 'Caiu!', '#ffffff');
}

function loseItem(gs: GameState, item: Item) {
  if (item.k === 'plate') gs.pendingPlates.push(K.plateReturn);
  else if (item.k === 'stack') for (let i = 0; i < item.n; i++) gs.pendingPlates.push(K.plateReturn);
  else if (item.k === 'pot' || item.k === 'pan') {
    resetVessel(item);
    gs.respawns.push({ t: K.respawn, item });
  } else if (item.k === 'ext') gs.respawns.push({ t: K.respawn, item });
}

function moveWithCollision(gs: GameState, p: Player, dx: number, dy: number) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.08));
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    resolve(gs, p, 'x');
    p.y += dy / steps;
    resolve(gs, p, 'y');
  }
}

function resolve(gs: GameState, p: Player, axis: 'x' | 'y') {
  const r = K.radius;
  const x0 = Math.floor(p.x - r);
  const x1 = Math.floor(p.x + r);
  const y0 = Math.floor(p.y - r);
  const y1 = Math.floor(p.y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = ty < 0 || ty >= gs.h || tx < 0 || tx >= gs.w ? null : gs.tiles[ty][tx];
      if (!isSolid(t)) continue;
      const cx = Math.max(tx, Math.min(p.x, tx + 1));
      const cy = Math.max(ty, Math.min(p.y, ty + 1));
      const ddx = p.x - cx;
      const ddy = p.y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2);
      if (d > 0.0001) {
        // empurra só no eixo que está sendo resolvido → escorrega nos cantos
        if (axis === 'x') p.x += (ddx / d) * (r - d);
        else p.y += (ddy / d) * (r - d);
      } else if (axis === 'x') {
        p.x += p.x < tx + 0.5 ? -(p.x - tx + r) : tx + 1 - p.x + r;
      } else {
        p.y += p.y < ty + 0.5 ? -(p.y - ty + r) : ty + 1 - p.y + r;
      }
    }
  }
}

function separatePlayers(gs: GameState) {
  const [a, b] = gs.players;
  if (a.dead || b.dead) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = K.radius * 2;
  if (d < min && d > 0.0001) {
    const push = (min - d) / 2;
    a.x -= (dx / d) * push;
    a.y -= (dy / d) * push;
    b.x += (dx / d) * push;
    b.y += (dy / d) * push;
    resolve(gs, a, 'x');
    resolve(gs, a, 'y');
    resolve(gs, b, 'x');
    resolve(gs, b, 'y');
  }
}

/** Escolhe a estação que está NA FRENTE do chef (não a mais próxima em qualquer direção). */
function findTarget(gs: GameState, p: Player): Tile | null {
  const fx = p.x + p.dirX * 0.7;
  const fy = p.y + p.dirY * 0.7;
  const px = Math.floor(p.x);
  const py = Math.floor(p.y);
  let best: Tile | null = null;
  let bd = 0.95;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = px + dx;
      const ty = py + dy;
      if (ty < 0 || ty >= gs.h || tx < 0 || tx >= gs.w) continue;
      const t = gs.tiles[ty][tx];
      if (!isSolid(t)) continue;
      const cx = Math.max(tx, Math.min(fx, tx + 1));
      const cy = Math.max(ty, Math.min(fy, ty + 1));
      const d = Math.hypot(fx - cx, fy - cy);
      const dot = (tx + 0.5 - p.x) * p.dirX + (ty + 0.5 - p.y) * p.dirY;
      if (dot <= 0.1) continue;
      const score = d + (1 - Math.min(1, dot)) * 0.3;
      if (score < bd) {
        bd = score;
        best = t;
      }
    }
  }
  return best;
}

function nearestFloorItem(gs: GameState, p: Player) {
  const fx = p.x + p.dirX * 0.5;
  const fy = p.y + p.dirY * 0.5;
  let best = -1;
  let bd = 0.75;
  gs.floorItems.forEach((f, i) => {
    const d = Math.hypot(f.x - fx, f.y - fy);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// ─── Pegar / soltar ─────────────────────────────────────────────────────────
function doGrab(gs: GameState, p: Player) {
  const H = p.held;
  const t = p.target;

  if (!H) {
    const fi = nearestFloorItem(gs, p);
    if (fi >= 0) {
      p.held = gs.floorItems[fi].item;
      gs.floorItems.splice(fi, 1);
      sfx.pick();
      return;
    }
  }
  if (!t) return;
  if (t.fire > 0) {
    addFloat(gs, t.x + 0.5, t.y, 'Tá pegando fogo!', '#ff6b35');
    sfx.reject();
    return;
  }
  p.working = null;

  switch (t.type) {
    case 'crate': {
      if (t.item) break; // tem algo em cima → vira bancada
      const f = t.crateFood!;
      if (!H) {
        p.held = { k: 'food', f, s: 'raw', chop: 0 };
        sfx.pick();
        return;
      }
      if (H.k === 'plate' && f === 'bun' && canAddPart(H.parts, 'bun:raw', gs.level.recipes)) {
        H.parts.push('bun:raw');
        sfx.pick();
        return;
      }
      break;
    }
    case 'trash': {
      if (!H) return;
      if (H.k === 'food') p.held = null;
      else if (H.k === 'plate') H.parts = [];
      else if (H.k === 'pot' || H.k === 'pan') resetVessel(H);
      else {
        sfx.reject();
        return;
      }
      sfx.drop();
      puff(gs, t.x + 0.5, t.y + 0.3, '#9aa0a6', 1);
      return;
    }
    case 'serve': {
      if (H?.k === 'plate' && H.parts.length) deliver(gs, p, t, H);
      else if (H) {
        addFloat(gs, t.x + 0.5, t.y, H.k === 'food' ? 'Precisa de prato!' : 'Nada pra entregar', '#ffffff');
        sfx.reject();
      }
      return;
    }
    case 'return':
    case 'rack': {
      const I = t.item;
      if (!H && I?.k === 'stack') {
        if (!I.dirty && I.n > 1) {
          I.n--;
          p.held = { k: 'plate', parts: [] };
        } else if (!I.dirty) {
          t.item = null;
          p.held = { k: 'plate', parts: [] };
        } else {
          t.item = null;
          p.held = I;
        }
        sfx.pick();
        return;
      }
      if (t.type === 'rack' && H?.k === 'plate' && H.parts.length === 0) {
        if (I?.k === 'stack' && !I.dirty) I.n++;
        else if (!I) t.item = { k: 'stack', n: 1, dirty: false };
        else return;
        p.held = null;
        sfx.drop();
      }
      return;
    }
    case 'sink': {
      if (H?.k === 'stack' && H.dirty) {
        t.sinkDirty += H.n;
        p.held = null;
        sfx.drop();
      } else if (H) {
        addFloat(gs, t.x + 0.5, t.y, 'Só prato sujo aqui', '#ffffff');
        sfx.reject();
      }
      return;
    }
  }

  // bancada / tábua / fogão / caixa com algo em cima
  const I = t.item;
  if (H && !I) {
    if (accepts(t, H)) {
      t.item = H;
      p.held = null;
      sfx.drop();
    } else {
      addFloat(gs, t.x + 0.5, t.y, t.type === 'stove' ? 'Só panela aqui' : 'Não cabe aqui', '#ffffff');
      sfx.reject();
    }
  } else if (!H && I) {
    if (I.k === 'stack' && !I.dirty && I.n > 1) {
      I.n--;
      p.held = { k: 'plate', parts: [] };
    } else if (I.k === 'stack' && !I.dirty) {
      t.item = null;
      p.held = { k: 'plate', parts: [] };
    } else {
      p.held = I;
      t.item = null;
    }
    sfx.pick();
  } else if (H && I) {
    if (combine(gs, p, t, H, I)) sfx.pick();
    else sfx.reject();
  }
}

function accepts(t: Tile, it: Item): boolean {
  if (t.type === 'counter' || t.type === 'crate') return true;
  if (t.type === 'board') return it.k === 'food' && (it.s === 'raw' || it.s === 'chopped');
  if (t.type === 'stove') return it.k === 'pot' || it.k === 'pan';
  return false;
}

function combine(gs: GameState, p: Player, t: Tile, H: Item, I: Item): boolean {
  const R = gs.level.recipes;
  if (H.k === 'food' && I.k === 'plate') {
    const tok = foodToken(H);
    if (tok && canAddPart(I.parts, tok, R)) {
      I.parts.push(tok);
      p.held = null;
      return true;
    }
    return false;
  }
  if (H.k === 'food' && (I.k === 'pot' || I.k === 'pan')) {
    if (vesselAccepts(I, H)) {
      I.contents.push(H.f);
      p.held = null;
      return true;
    }
    return false;
  }
  if (H.k === 'plate' && I.k === 'food') {
    const tok = foodToken(I);
    if (tok && canAddPart(H.parts, tok, R)) {
      H.parts.push(tok);
      t.item = null;
      return true;
    }
    return false;
  }
  if (H.k === 'plate' && (I.k === 'pot' || I.k === 'pan')) return pour(gs, H, I);
  if ((H.k === 'pot' || H.k === 'pan') && I.k === 'plate') return pour(gs, I, H);
  if ((H.k === 'pot' || H.k === 'pan') && I.k === 'food') {
    if (vesselAccepts(H, I)) {
      H.contents.push(I.f);
      t.item = null;
      return true;
    }
    return false;
  }
  if (H.k === 'plate' && H.parts.length === 0 && I.k === 'stack' && !I.dirty) {
    I.n++;
    p.held = null;
    return true;
  }
  if (H.k === 'stack' && I.k === 'stack' && H.dirty === I.dirty) {
    I.n += H.n;
    p.held = null;
    return true;
  }
  return false;
}

// ─── Usar (cortar, lavar, arremessar) ──────────────────────────────────────
function doUse(gs: GameState, p: Player) {
  const H = p.held;
  const t = p.target;
  if (H?.k === 'ext') return;
  if (t && t.fire <= 0 && !H) {
    if (t.type === 'board' && t.item?.k === 'food' && t.item.s === 'raw' && CHOPPABLE.includes(t.item.f)) {
      p.working = t;
      return;
    }
    if (t.type === 'sink' && t.sinkDirty > 0) {
      p.working = t;
      return;
    }
  }
  if (H?.k === 'food') {
    gs.projectiles.push({
      item: H,
      x: p.x + p.dirX * 0.35,
      y: p.y + p.dirY * 0.35,
      vx: p.dirX * K.throwSpeed,
      vy: p.dirY * K.throwSpeed,
      dist: 0,
      from: p.id,
    });
    p.held = null;
    sfx.throw();
  }
}

function updateProjectiles(gs: GameState, dt: number) {
  for (let i = gs.projectiles.length - 1; i >= 0; i--) {
    const pr = gs.projectiles[i];
    const steps = 4;
    let done = false;
    for (let s = 0; s < steps && !done; s++) {
      const px = pr.x;
      const py = pr.y;
      pr.x += (pr.vx * dt) / steps;
      pr.y += (pr.vy * dt) / steps;
      pr.dist += (Math.hypot(pr.vx, pr.vy) * dt) / steps;

      // alguém pegou no ar?
      for (const q of gs.players) {
        if (q.dead || q.held) continue;
        if (q.id === pr.from && pr.dist < 1) continue;
        if (Math.hypot(q.x - pr.x, q.y - pr.y) < 0.55) {
          q.held = pr.item;
          sfx.pick();
          addFloat(gs, q.x, q.y - 0.8, 'Peguei!', '#ffffff');
          done = true;
          break;
        }
      }
      if (done) break;

      const t = tileAt(gs, pr.x, pr.y);
      if (isSolid(t)) {
        if (!(t && landOn(gs, t, pr.item))) dropOnFloor(gs, pr.item, px, py);
        done = true;
      } else if (pr.dist >= K.throwRange) {
        if (isHole(gs, t)) puff(gs, pr.x, pr.y, '#333333', 0.6);
        else dropOnFloor(gs, pr.item, pr.x, pr.y);
        done = true;
      }
    }
    if (done) gs.projectiles.splice(i, 1);
  }
}

function landOn(gs: GameState, t: Tile, f: FoodItem): boolean {
  if (t.fire > 0) return false;
  if (t.type === 'trash') {
    sfx.drop();
    return true;
  }
  const I = t.item;
  if (!I) {
    if (t.type === 'counter' || t.type === 'crate' || t.type === 'board') {
      t.item = f;
      sfx.drop();
      return true;
    }
    return false;
  }
  if (I.k === 'plate') {
    const tok = foodToken(f);
    if (tok && canAddPart(I.parts, tok, gs.level.recipes)) {
      I.parts.push(tok);
      sfx.drop();
      return true;
    }
  }
  if ((I.k === 'pot' || I.k === 'pan') && vesselAccepts(I, f)) {
    I.contents.push(f.f);
    sfx.drop();
    addFloat(gs, t.x + 0.5, t.y, 'Cesta!', '#ffd23f');
    return true;
  }
  return false;
}

function dropOnFloor(gs: GameState, item: Item, x: number, y: number) {
  const t = tileAt(gs, x, y);
  if (isHole(gs, t)) return;
  gs.floorItems.push({ item, x, y });
  sfx.drop();
}

// ─── Extintor e fogo ────────────────────────────────────────────────────────
function spray(gs: GameState, p: Player, dt: number) {
  if (Math.floor(gs.clock * 10) !== Math.floor((gs.clock - dt) * 10)) sfx.spray();
  for (let i = 0; i < 3; i++) {
    const ang = Math.atan2(p.dirY, p.dirX) + (Math.random() - 0.5) * 0.7;
    const sp = 5 + Math.random() * 3;
    gs.particles.push({
      x: p.x + p.dirX * 0.4, y: p.y + p.dirY * 0.4,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      life: 0.45, max: 0.45, color: '#ffffff', size: 5 + Math.random() * 5,
    });
  }
  for (const row of gs.tiles) {
    for (const t of row) {
      if (t.fire <= 0) continue;
      const dx = t.x + 0.5 - p.x;
      const dy = t.y + 0.5 - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 2.8) continue;
      const cos = (dx * p.dirX + dy * p.dirY) / (d || 1);
      if (cos < 0.75) continue;
      t.fire -= dt * 1.6;
      if (t.fire <= 0) {
        t.fire = 0;
        t.fireSpread = 0;
        if (t.item && (t.item.k === 'pot' || t.item.k === 'pan')) t.item.smoke = -4;
        addFloat(gs, t.x + 0.5, t.y, 'Apagou!', '#9be7ff');
      }
    }
  }
}

function ignite(gs: GameState, t: Tile) {
  if (t.fire > 0) return;
  t.fire = K.fireHp;
  t.fireSpread = 0;
  sfx.fire();
  gs.shake = 0.5;
  if (t.item?.k === 'food') t.item.s = 'burnt';
  for (const p of gs.players) if (p.working === t) p.working = null;
}

function updateStations(gs: GameState, dt: number) {
  let warn = false;
  for (const row of gs.tiles) {
    for (const t of row) {
      // cozinhar
      if (t.type === 'stove' && t.item && (t.item.k === 'pot' || t.item.k === 'pan')) {
        const v = t.item;
        if (v.contents.length > 0 && !v.burnt) {
          const wasReady = vesselReady(v);
          v.p += dt;
          if (!wasReady && vesselReady(v)) sfx.done();
          if (Math.random() < dt * 4) steam(gs, t.x + 0.5, t.y + 0.1, '#ffffff');
          const limit = vesselBurnLimit(v);
          if (v.p >= potDone(v) + 2.5 && v.p < limit) warn = true;
          if (v.p >= limit) {
            v.burnt = true;
            v.smoke = 0;
            addFloat(gs, t.x + 0.5, t.y, 'Queimou!', '#ff6b35');
          }
        }
        if (v.burnt) {
          if (Math.random() < dt * 6) steam(gs, t.x + 0.5, t.y + 0.1, '#3b3b3b');
          if (t.fire <= 0) {
            v.smoke += dt;
            if (v.smoke >= K.fireAfterBurn) ignite(gs, t);
          }
        }
      }
      // fogo se espalha
      if (t.fire > 0) {
        if (Math.random() < dt * 10) ember(gs, t.x + 0.5, t.y + 0.3);
        t.fireSpread += dt;
        if (t.fireSpread >= K.fireSpreadEvery) {
          t.fireSpread = 0;
          const nb = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
          ].map(([dx, dy]) => tileAt(gs, t.x + dx + 0.5, t.y + dy + 0.5))
            .filter((n): n is Tile => !!n && FLAMMABLE.includes(n.type) && n.fire <= 0);
          if (nb.length) ignite(gs, nb[Math.floor(Math.random() * nb.length)]);
        }
      }
    }
  }
  if (warn) {
    const beat = Math.floor(gs.clock * 3);
    if (beat !== lastWarnBeat) {
      lastWarnBeat = beat;
      sfx.warn();
    }
  }
}

function updateGap(gs: GameState, dt: number) {
  const g = gs.level.gap;
  if (!g) return;
  gs.gapT -= dt;
  if (gs.gapT > 0) return;
  if (gs.gapPhase === 'closed') {
    gs.gapPhase = 'warn';
    gs.gapT = g.warn;
    sfx.warn();
  } else if (gs.gapPhase === 'warn') {
    gs.gapPhase = 'open';
    gs.gapT = g.open;
    gs.shake = 1;
    sfx.fire();
    for (const p of gs.players) if (!p.dead && isHole(gs, tileAt(gs, p.x, p.y))) killPlayer(gs, p);
    gs.floorItems = gs.floorItems.filter((f) => {
      if (isHole(gs, tileAt(gs, f.x, f.y))) {
        loseItem(gs, f.item);
        return false;
      }
      return true;
    });
  } else {
    gs.gapPhase = 'closed';
    gs.gapT = g.closed;
    gs.shake = 0.6;
  }
}

// ─── Pratos ─────────────────────────────────────────────────────────────────
function returnPlate(gs: GameState) {
  const dirty = gs.level.dirtyPlates;
  for (const row of gs.tiles) {
    for (const t of row) {
      if (t.type !== 'return') continue;
      if (!t.item) t.item = { k: 'stack', n: 1, dirty };
      else if (t.item.k === 'stack' && t.item.dirty === dirty) t.item.n++;
      else continue;
      puff(gs, t.x + 0.5, t.y + 0.3, '#ffffff', 0.6);
      return;
    }
  }
}

function addToRack(gs: GameState) {
  for (const row of gs.tiles) {
    for (const t of row) {
      if (t.type !== 'rack') continue;
      if (!t.item) t.item = { k: 'stack', n: 1, dirty: false };
      else if (t.item.k === 'stack' && !t.item.dirty) t.item.n++;
      else continue;
      return;
    }
  }
}

// ─── Pedidos ────────────────────────────────────────────────────────────────
function spawnOrder(gs: GameState) {
  const active = gs.orders.filter((o) => o.failT <= 0 && o.okT <= 0).length;
  if (active >= K.maxOrders) return;
  const pool = gs.level.recipes;
  // evita repetir o mesmo prato 3x seguidas
  let r = pool[Math.floor(Math.random() * pool.length)];
  const last = gs.orders.slice(-2).map((o) => o.recipe);
  if (last.length === 2 && last[0] === r && last[1] === r) r = pool[(pool.indexOf(r) + 1) % pool.length];
  const rec = RECIPES[r];
  gs.orderId++;
  gs.orders.push({ id: gs.orderId, recipe: r, t: rec.time, max: rec.time, x: 2000, failT: 0, okT: 0 });
}

function updateOrders(gs: GameState, dt: number) {
  const elapsed = gs.level.duration - gs.time;
  const interval = Math.max(11, 20 - elapsed / 25);
  gs.orderTimer -= dt;
  const active = gs.orders.filter((o) => o.failT <= 0 && o.okT <= 0);
  if (active.length === 0 && gs.orderTimer > 1.5) gs.orderTimer = 1.5;
  if (gs.orderTimer <= 0) {
    spawnOrder(gs);
    gs.orderTimer = active.length < 2 ? 4 : interval;
  }

  for (let i = gs.orders.length - 1; i >= 0; i--) {
    const o = gs.orders[i];
    if (o.okT > 0) {
      o.okT -= dt;
      if (o.okT <= 0) gs.orders.splice(i, 1);
      continue;
    }
    if (o.failT > 0) {
      o.failT -= dt;
      if (o.failT <= 0) gs.orders.splice(i, 1);
      continue;
    }
    o.t -= dt;
    if (o.t <= 0) {
      o.t = 0;
      o.failT = 0.9;
      gs.failed++;
      gs.combo = 0;
      gs.score = Math.max(0, gs.score - K.orderFailPenalty);
      gs.shake = 0.6;
      sfx.fail();
    }
  }
}

function deliver(gs: GameState, p: Player, t: Tile, plate: PlateItem) {
  const rid = matchRecipe(plate.parts, gs.level.recipes);
  const active = gs.orders.filter((o) => o.failT <= 0 && o.okT <= 0);
  const o = rid ? active.find((x) => x.recipe === rid) : undefined;
  if (!o) {
    addFloat(gs, t.x + 0.5, t.y, rid ? 'Ninguém pediu isso' : 'Prato incompleto', '#ffffff');
    sfx.reject();
    return;
  }
  const inOrder = active[0] === o;
  gs.combo = inOrder ? Math.min(4, gs.combo + 1) : 1;
  const tipBase = Math.max(1, Math.ceil(8 * (o.t / o.max)));
  const tip = tipBase * gs.combo;
  const value = RECIPES[o.recipe].value;
  gs.score += value + tip;
  gs.tipsTotal += tip;
  gs.delivered++;
  o.okT = 0.6;
  p.held = null;
  gs.pendingPlates.push(K.plateReturn);
  sfx.deliver();
  if (tip >= 8) sfx.tip();
  addFloat(gs, t.x + 0.5, t.y - 0.2, `+${value}`, '#ffffff', true);
  addFloat(gs, t.x + 0.5, t.y + 0.4, `gorjeta +${tip}${gs.combo > 1 ? `  x${gs.combo}` : ''}`, '#ffd23f');
  burst(gs, t.x + 0.5, t.y + 0.3, '#ffd23f', 18);
}

// ─── Efeitos ────────────────────────────────────────────────────────────────
function addFloat(gs: GameState, x: number, y: number, text: string, color: string, big = false) {
  gs.floats.push({ x, y, text, color, life: 1.3, big });
}

function pushParticle(gs: GameState, p: GameState['particles'][number]) {
  if (gs.particles.length < 400) gs.particles.push(p);
}
function puff(gs: GameState, x: number, y: number, color: string, s: number) {
  pushParticle(gs, {
    x, y, vx: (Math.random() - 0.5) * 2 * s, vy: -Math.random() * 1.5 * s,
    life: 0.5, max: 0.5, color, size: 4 + Math.random() * 6 * s,
  });
}
function steam(gs: GameState, x: number, y: number, color: string) {
  pushParticle(gs, {
    x: x + (Math.random() - 0.5) * 0.4, y, vx: (Math.random() - 0.5) * 0.3, vy: -0.9,
    life: 1.2, max: 1.2, color, size: 6 + Math.random() * 6,
  });
}
function ember(gs: GameState, x: number, y: number) {
  pushParticle(gs, {
    x: x + (Math.random() - 0.5) * 0.7, y, vx: (Math.random() - 0.5) * 0.6, vy: -1.5 - Math.random(),
    life: 0.8, max: 0.8, color: Math.random() < 0.5 ? '#ffb703' : '#fb5607', size: 3 + Math.random() * 4,
  });
}
function bubble(gs: GameState, x: number, y: number) {
  pushParticle(gs, {
    x: x + (Math.random() - 0.5) * 0.5, y, vx: 0, vy: -0.6,
    life: 0.7, max: 0.7, color: '#d6f3ff', size: 3 + Math.random() * 4,
  });
}
function burst(gs: GameState, x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 2.5;
    pushParticle(gs, { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 0.7, max: 0.7, color, size: 3 + Math.random() * 4 });
  }
}

function updateFx(gs: GameState, dt: number) {
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    const q = gs.particles[i];
    q.life -= dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx *= 1 - dt * 2;
    q.vy *= 1 - dt * 2;
    if (q.life <= 0) gs.particles.splice(i, 1);
  }
  for (let i = gs.floats.length - 1; i >= 0; i--) {
    const f = gs.floats[i];
    f.life -= dt;
    f.y -= dt * 0.7;
    if (f.life <= 0) gs.floats.splice(i, 1);
  }
}

export function starsFor(gs: GameState): number {
  const [a, b, c] = gs.level.stars;
  return gs.score >= c ? 3 : gs.score >= b ? 2 : gs.score >= a ? 1 : 0;
}
