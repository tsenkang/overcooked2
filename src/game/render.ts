import { RECIPES } from './content';
import { potDone, vesselBurnLimit, vesselReady } from './engine';
import type { FoodId, FoodItem, GameState, Item, Player, Tile, VesselItem } from './types';
import { TUNING as K } from './types';

// ─── Tokens visuais ─────────────────────────────────────────────────────────
export const T = 64; // px por tile
const LIFT = 20; // altura das bancadas
const HUD_TOP = 124;
const HUD_BOTTOM = 72;
const PAD = 28;
const TICKET_W = 124;
const TICKET_GAP = 10;

export const FONT = '"Baloo 2", "Trebuchet MS", system-ui, sans-serif';
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

const C = {
  ink: '#2b1d16',
  top: '#efdcbc',
  topLine: '#d8c19b',
  steel: '#c9d1d6',
  stove: '#40444c',
  burner: '#24262b',
  serve: '#f7b538',
  good: '#3ec46d',
  warn: '#ffb020',
  bad: '#ef4444',
  paper: '#fffaf0',
  soupTomato: '#e0463a',
  soupOnion: '#e9b949',
  bunTop: '#e2a04f',
  bunBot: '#d58f3f',
  patty: '#7a4a2a',
  lettuce: '#64c24a',
  skin: '#ffd9b3',
};

const FOOD_EMOJI: Record<FoodId, string> = {
  tomato: '🍅',
  onion: '🧅',
  lettuce: '🥬',
  meat: '🥩',
  bun: '🍞',
};

export function worldSize(gs: GameState) {
  return { W: gs.w * T + PAD * 2, H: HUD_TOP + LIFT + gs.h * T + HUD_BOTTOM };
}
const OX = PAD;
const OY = HUD_TOP + LIFT;

// ─── Utilitários ────────────────────────────────────────────────────────────
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function emoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.font = `${Math.round(size)}px ${EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, 0, 1);
  ctx.restore();
}
function text(
  ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string,
  opts: { align?: CanvasTextAlign; stroke?: string; weight?: number } = {},
) {
  ctx.font = `${opts.weight ?? 800} ${size}px ${FONT}`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (opts.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// ─── Comidas e utensílios ───────────────────────────────────────────────────
function drawBun(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ellipse(ctx, x, y + 4 * s, 15 * s, 7 * s, C.bunBot);
  ctx.beginPath();
  ctx.ellipse(x, y, 15 * s, 11 * s, 0, Math.PI, 0);
  ctx.fillStyle = C.bunTop;
  ctx.fill();
  for (const [dx, dy] of [[-6, -5], [0, -8], [6, -4], [-2, -3]]) ellipse(ctx, x + dx * s, y + dy * s, 1.4 * s, 0.9 * s, '#fff3d6');
}
function drawPatty(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = C.patty) {
  ellipse(ctx, x, y, 14 * s, 8 * s, color);
  ctx.strokeStyle = shade(color.startsWith('#') ? color : '#7a4a2a', -30);
  ctx.lineWidth = 1.5 * s;
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s - 3 * s, y - 3 * s);
    ctx.lineTo(x + dx * s + 3 * s, y + 3 * s);
    ctx.stroke();
  }
}

function drawFood(ctx: CanvasRenderingContext2D, f: FoodItem, x: number, y: number, s: number) {
  if (f.s === 'burnt') {
    ellipse(ctx, x, y, 14 * s, 9 * s, '#1f1b1a');
    ellipse(ctx, x - 4 * s, y - 2 * s, 4 * s, 2 * s, '#3a3230');
    return;
  }
  if (f.f === 'bun') return drawBun(ctx, x, y, s);
  if (f.f === 'meat' && f.s === 'cooked') return drawPatty(ctx, x, y, s);
  if (f.s === 'chopped') {
    const e = FOOD_EMOJI[f.f];
    emoji(ctx, e, x - 8 * s, y + 2 * s, 17 * s, -0.4);
    emoji(ctx, e, x + 8 * s, y + 3 * s, 17 * s, 0.5);
    emoji(ctx, e, x, y - 5 * s, 17 * s, 0.1);
    return;
  }
  emoji(ctx, FOOD_EMOJI[f.f], x, y, 30 * s);
}

function drawPlateBase(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dirty = false) {
  ellipse(ctx, x, y + 3 * s, 23 * s, 13 * s, 'rgba(0,0,0,0.18)');
  ellipse(ctx, x, y, 23 * s, 13 * s, '#ffffff');
  ellipse(ctx, x, y, 16 * s, 8.5 * s, dirty ? '#e8e0d0' : '#eef1f4');
  if (dirty) {
    ellipse(ctx, x - 6 * s, y - 1 * s, 4 * s, 2 * s, '#a47148');
    ellipse(ctx, x + 7 * s, y + 2 * s, 3 * s, 1.6 * s, '#8d5a34');
  }
}

export function drawPlateContents(ctx: CanvasRenderingContext2D, parts: string[], x: number, y: number, s: number) {
  for (const p of parts) {
    if (p.startsWith('soup:')) {
      const onion = p.endsWith('onion');
      ellipse(ctx, x, y, 15 * s, 8 * s, onion ? C.soupOnion : C.soupTomato);
      ellipse(ctx, x - 4 * s, y - 2 * s, 5 * s, 2 * s, 'rgba(255,255,255,0.35)');
      emoji(ctx, onion ? '🧅' : '🍅', x + 5 * s, y, 11 * s);
    }
  }
  const hasBun = parts.includes('bun:raw');
  const hasMeat = parts.includes('meat:cooked');
  const hasLettuce = parts.includes('lettuce:chopped');
  const hasTomato = parts.includes('tomato:chopped');
  if (hasBun) {
    ellipse(ctx, x, y + 1 * s, 15 * s, 6 * s, C.bunBot);
    let yy = y - 2 * s;
    if (hasMeat) {
      drawPatty(ctx, x, yy, s * 0.95);
      yy -= 5 * s;
    }
    if (hasLettuce) {
      ellipse(ctx, x, yy + 1 * s, 16 * s, 5 * s, C.lettuce);
      yy -= 4 * s;
    }
    ctx.beginPath();
    ctx.ellipse(x, yy, 15 * s, 11 * s, 0, Math.PI, 0);
    ctx.fillStyle = C.bunTop;
    ctx.fill();
    for (const [dx, dy] of [[-6, -5], [0, -8], [6, -4]]) ellipse(ctx, x + dx * s, yy + dy * s, 1.4 * s, 0.9 * s, '#fff3d6');
    return;
  }
  if (hasMeat) drawPatty(ctx, x, y, s);
  if (hasLettuce) {
    emoji(ctx, '🥬', x - 6 * s, y, 16 * s, -0.3);
    emoji(ctx, '🥬', x + (hasTomato ? 2 : 6) * s, y - 3 * s, 16 * s, 0.4);
  }
  if (hasTomato) {
    emoji(ctx, '🍅', x + 7 * s, y + 2 * s, 13 * s, 0.2);
    emoji(ctx, '🍅', x - 1 * s, y + 3 * s, 12 * s, -0.2);
  }
}

function drawVessel(ctx: CanvasRenderingContext2D, v: VesselItem, x: number, y: number, s: number) {
  if (v.k === 'pot') {
    ellipse(ctx, x, y + 10 * s, 22 * s, 8 * s, 'rgba(0,0,0,0.25)');
    // alças
    rr(ctx, x - 27 * s, y - 4 * s, 8 * s, 5 * s, 2 * s);
    ctx.fillStyle = '#6b7280';
    ctx.fill();
    rr(ctx, x + 19 * s, y - 4 * s, 8 * s, 5 * s, 2 * s);
    ctx.fill();
    // corpo
    rr(ctx, x - 20 * s, y - 6 * s, 40 * s, 16 * s, 6 * s);
    ctx.fillStyle = '#9aa3ad';
    ctx.fill();
    ellipse(ctx, x, y - 6 * s, 20 * s, 8 * s, '#c3cad1');
    ellipse(ctx, x, y - 6 * s, 16 * s, 6 * s, '#50565e');
    if (v.contents.length) {
      const color = v.burnt ? '#1c1a19' : v.contents[0] === 'onion' ? C.soupOnion : C.soupTomato;
      const fill = v.contents.length / 3;
      ellipse(ctx, x, y - 6 * s, 16 * s * (0.55 + fill * 0.45), 6 * s * (0.55 + fill * 0.45), color);
    }
  } else {
    // frigideira
    rr(ctx, x + 14 * s, y - 3 * s, 20 * s, 6 * s, 3 * s);
    ctx.fillStyle = '#2b2b2e';
    ctx.fill();
    ellipse(ctx, x, y + 2 * s, 20 * s, 12 * s, '#1b1b1d');
    ellipse(ctx, x, y, 17 * s, 10 * s, '#34363a');
    if (v.contents.length) {
      if (v.burnt) drawPatty(ctx, x, y, s * 0.9, '#1f1b1a');
      else {
        const k = Math.min(1, v.p / K.panCook);
        const r = Math.round(214 + (122 - 214) * k);
        const g = Math.round(110 + (74 - 110) * k);
        const b = Math.round(120 + (42 - 120) * k);
        drawPatty(ctx, x, y, s * 0.9, `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
      }
    }
  }
}

function drawExt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ellipse(ctx, x, y + 12 * s, 10 * s, 4 * s, 'rgba(0,0,0,0.25)');
  rr(ctx, x - 8 * s, y - 16 * s, 16 * s, 28 * s, 7 * s);
  ctx.fillStyle = '#e11d2e';
  ctx.fill();
  rr(ctx, x - 8 * s, y - 4 * s, 16 * s, 6 * s, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  rr(ctx, x - 3 * s, y - 22 * s, 6 * s, 7 * s, 2 * s);
  ctx.fillStyle = '#374151';
  ctx.fill();
  rr(ctx, x + 2 * s, y - 22 * s, 9 * s, 3 * s, 1);
  ctx.fill();
}

function drawItem(ctx: CanvasRenderingContext2D, it: Item, x: number, y: number, s: number) {
  switch (it.k) {
    case 'food':
      return drawFood(ctx, it, x, y, s);
    case 'plate':
      drawPlateBase(ctx, x, y, s);
      return drawPlateContents(ctx, it.parts, x, y - 2 * s, s);
    case 'stack': {
      const n = Math.min(it.n, 6);
      for (let i = 0; i < n; i++) drawPlateBase(ctx, x, y - i * 3.5 * s, s, it.dirty);
      if (it.n > 1) badge(ctx, x + 20 * s, y - 16 * s, String(it.n), it.dirty ? '#8d5a34' : '#3b82f6');
      return;
    }
    case 'pot':
    case 'pan':
      return drawVessel(ctx, it, x, y, s);
    case 'ext':
      return drawExt(ctx, x, y, s);
  }
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, s: string, color: string) {
  ellipse(ctx, x, y, 10, 10, '#ffffff');
  ellipse(ctx, x, y, 8, 8, color);
  text(ctx, s, x, y + 1, 12, '#ffffff');
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, color: string) {
  rr(ctx, x - w / 2 - 2, y - 2, w + 4, 12, 6);
  ctx.fillStyle = '#1f1512';
  ctx.fill();
  rr(ctx, x - w / 2, y, Math.max(4, w * Math.min(1, k)), 8, 4);
  ctx.fillStyle = color;
  ctx.fill();
}

function bubbleIcon(ctx: CanvasRenderingContext2D, x: number, y: number, bg: string, glyph: string) {
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 10);
  ctx.lineTo(x, y + 18);
  ctx.lineTo(x + 6, y + 10);
  ctx.fillStyle = bg;
  ctx.fill();
  ellipse(ctx, x, y, 15, 15, '#ffffff');
  ellipse(ctx, x, y, 12, 12, bg);
  text(ctx, glyph, x, y + 1, 17, '#ffffff', { weight: 900 });
}

// ─── Bancadas ───────────────────────────────────────────────────────────────
function drawTile(ctx: CanvasRenderingContext2D, gs: GameState, t: Tile) {
  const sx = OX + t.x * T;
  const sy = OY + t.y * T;
  const topY = sy - LIFT;
  const wall = gs.level.wall;

  // frente
  rr(ctx, sx, sy + T - LIFT - 4, T, LIFT + 4, 3);
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(sx, sy + T - 6, T, 6);
  // topo
  let top = C.top;
  if (t.type === 'stove') top = C.stove;
  if (t.type === 'serve') top = C.serve;
  rr(ctx, sx + 1, topY, T - 2, T - 2, 5);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.strokeStyle = t.type === 'stove' ? '#2b2e34' : C.topLine;
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = sx + T / 2;
  const cy = topY + T / 2;

  switch (t.type) {
    case 'crate': {
      rr(ctx, sx + 7, topY + 8, T - 14, T - 16, 6);
      ctx.fillStyle = '#b07a4a';
      ctx.fill();
      ctx.strokeStyle = '#8a5a33';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + 9, topY + 20);
      ctx.lineTo(sx + T - 9, topY + 20);
      ctx.moveTo(sx + 9, topY + T - 20);
      ctx.lineTo(sx + T - 9, topY + T - 20);
      ctx.stroke();
      if (!t.item) {
        if (t.crateFood === 'bun') drawBun(ctx, cx, cy + 2, 1.1);
        else emoji(ctx, FOOD_EMOJI[t.crateFood!], cx, cy, 30);
      }
      break;
    }
    case 'board': {
      rr(ctx, sx + 8, topY + 10, T - 16, T - 20, 6);
      ctx.fillStyle = '#f7ead0';
      ctx.fill();
      ctx.strokeStyle = '#caa574';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!t.item) {
        rr(ctx, sx + 16, topY + T - 20, 26, 5, 2);
        ctx.fillStyle = '#b8c2cc';
        ctx.fill();
        rr(ctx, sx + 40, topY + T - 21, 10, 7, 2);
        ctx.fillStyle = '#4b3a2e';
        ctx.fill();
      }
      break;
    }
    case 'stove': {
      const hot = t.item && (t.item.k === 'pot' || t.item.k === 'pan') && t.item.contents.length > 0 && !t.item.burnt;
      ellipse(ctx, cx, cy, 22, 14, C.burner);
      ctx.strokeStyle = hot ? `rgba(255,${120 + Math.sin(gs.clock * 10) * 40},40,0.95)` : '#555a63';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 16, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'serve': {
      ctx.save();
      rr(ctx, sx + 6, topY + 6, T - 12, T - 14, 4);
      ctx.clip();
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(sx + 6, topY + 6, T - 12, T - 14);
      const off = (gs.clock * 30) % 16;
      ctx.strokeStyle = '#f7b538';
      ctx.lineWidth = 3;
      for (let i = -1; i < 5; i++) {
        const yy = topY + T - 8 - i * 16 + off - 16;
        ctx.beginPath();
        ctx.moveTo(cx - 10, yy + 6);
        ctx.lineTo(cx, yy);
        ctx.lineTo(cx + 10, yy + 6);
        ctx.stroke();
      }
      ctx.restore();
      text(ctx, 'ENTREGA', cx, sy + T - LIFT / 2 - 1, 11, '#fff7e0', { weight: 900 });
      break;
    }
    case 'return': {
      rr(ctx, sx + 8, topY + 8, T - 16, T - 18, 8);
      ctx.fillStyle = '#dfe6ea';
      ctx.fill();
      if (!t.item) text(ctx, '↩', cx, cy, 24, '#9aa7b0');
      text(ctx, 'PRATOS', cx, sy + T - LIFT / 2 - 1, 11, '#fff7e0', { weight: 900 });
      break;
    }
    case 'rack': {
      ctx.strokeStyle = '#9aa7b0';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + 14 + i * 12, topY + 12);
        ctx.lineTo(sx + 14 + i * 12, topY + T - 14);
        ctx.stroke();
      }
      break;
    }
    case 'trash': {
      ellipse(ctx, cx, cy + 4, 20, 16, '#6b7280');
      ellipse(ctx, cx, cy, 20, 14, '#4b5563');
      ellipse(ctx, cx, cy, 15, 10, '#1f2937');
      break;
    }
    case 'sink': {
      rr(ctx, sx + 7, topY + 8, T - 14, T - 18, 10);
      ctx.fillStyle = '#b9c4cc';
      ctx.fill();
      rr(ctx, sx + 11, topY + 12, T - 22, T - 26, 8);
      ctx.fillStyle = '#7cc6e8';
      ctx.fill();
      ellipse(ctx, cx - 6 + Math.sin(gs.clock * 2) * 3, cy - 4, 8, 2, 'rgba(255,255,255,0.5)');
      rr(ctx, cx - 3, topY + 2, 6, 10, 2);
      ctx.fillStyle = '#9aa7b0';
      ctx.fill();
      for (let i = 0; i < Math.min(t.sinkDirty, 4); i++) drawPlateBase(ctx, cx, cy + 4 - i * 3, 0.7, true);
      if (t.sinkDirty > 0) badge(ctx, sx + T - 10, topY + 8, String(t.sinkDirty), '#8d5a34');
      break;
    }
  }

  if (t.item) drawItem(ctx, t.item, cx, cy + 2, 1);
  if (t.fire > 0) drawFire(ctx, gs, cx, cy, t.fire);
}

/** Indicadores ficam numa camada própria, por cima de tudo, para nunca serem cobertos. */
function drawTileOverlay(ctx: CanvasRenderingContext2D, gs: GameState, t: Tile) {
  const cx = OX + t.x * T + T / 2;
  const topY = OY + t.y * T - LIFT;
  const it = t.item;
  const barY = topY + T - 14;
  if (it?.k === 'food' && it.s === 'raw' && it.chop > 0) bar(ctx, cx, barY, 44, it.chop, C.good);
  if (t.type === 'sink' && t.washP > 0) bar(ctx, cx, barY, 44, t.washP, '#38bdf8');
  if (it && (it.k === 'pot' || it.k === 'pan')) drawVesselStatus(ctx, gs, it, cx, topY, t.type === 'stove');
}

function drawVesselStatus(ctx: CanvasRenderingContext2D, gs: GameState, v: VesselItem, cx: number, topY: number, onStove: boolean) {
  if (v.k === 'pot' && v.contents.length) {
    // três "slots" de ingrediente, como nos tickets
    rr(ctx, cx - 26, topY + 1, 52, 17, 9);
    ctx.fillStyle = 'rgba(31,21,18,0.75)';
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const x = cx - 16 + i * 16;
      ellipse(ctx, x, topY + 9.5, 6.5, 6.5, v.contents[i] ? '#ffffff' : 'rgba(255,255,255,0.25)');
      if (v.contents[i]) emoji(ctx, FOOD_EMOJI[v.contents[i]], x, topY + 9.5, 10);
    }
  }
  if (!v.contents.length) return;
  const bx = cx + 24;
  const by = topY + 6;
  const barY = topY + T - 14;
  if (v.burnt) {
    bubbleIcon(ctx, bx, by, '#1f2937', '✕');
    return;
  }
  const done = potDone(v);
  if (vesselReady(v)) {
    const warnAt = done + 2.5;
    if (v.p >= warnAt && onStove) {
      const blink = Math.floor(gs.clock * 6) % 2 === 0;
      const k = (v.p - warnAt) / (vesselBurnLimit(v) - warnAt);
      if (blink) bubbleIcon(ctx, bx, by, k > 0.6 ? C.bad : C.warn, '!');
    } else bubbleIcon(ctx, bx, by, C.good, '✓');
  } else if (v.p > 0) {
    const k = v.k === 'pot' ? v.p / (3 * K.potPer) : v.p / K.panCook;
    bar(ctx, cx, barY, 44, k, C.good);
  }
}

function drawFire(ctx: CanvasRenderingContext2D, gs: GameState, cx: number, cy: number, hp: number) {
  const k = Math.min(1, hp / K.fireHp);
  const t = gs.clock;
  ellipse(ctx, cx, cy + 4, 26, 14, 'rgba(255,120,20,0.35)');
  for (let i = 0; i < 5; i++) {
    const ox = (i - 2) * 9;
    const h = (26 + Math.sin(t * 12 + i * 1.7) * 8) * (0.5 + k * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + ox - 9, cy + 8);
    ctx.quadraticCurveTo(cx + ox - 8, cy - h * 0.5, cx + ox + Math.sin(t * 9 + i) * 3, cy - h);
    ctx.quadraticCurveTo(cx + ox + 8, cy - h * 0.5, cx + ox + 9, cy + 8);
    ctx.fillStyle = i % 2 ? '#ff7a1a' : '#ffb703';
    ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * 9;
    const h = (14 + Math.sin(t * 14 + i) * 4) * (0.5 + k * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx + ox - 5, cy + 8);
    ctx.quadraticCurveTo(cx + ox, cy - h, cx + ox + 5, cy + 8);
    ctx.fillStyle = '#fff1a8';
    ctx.fill();
  }
}

// ─── Chefs ──────────────────────────────────────────────────────────────────
function drawPlayer(ctx: CanvasRenderingContext2D, gs: GameState, p: Player) {
  const x = OX + p.x * T;
  const y = OY + p.y * T;
  const moving = Math.hypot(p.vx, p.vy) > 0.3;
  const bob = moving ? Math.abs(Math.sin(p.walk)) * 4 : Math.sin(gs.clock * 3 + p.id) * 1;
  const faded = gs.solo && !p.active;

  ctx.save();
  if (faded) ctx.globalAlpha = 0.85;

  // rastro do dash
  if (p.dashT > 0) {
    for (let i = 1; i <= 3; i++) ellipse(ctx, x - p.vx * i * 2.2, y - 22 - p.vy * i * 2.2, 16, 18, `rgba(255,255,255,${0.25 / i})`);
  }

  ellipse(ctx, x, y + 2, 20, 8, 'rgba(0,0,0,0.22)');

  const facingUp = p.dirY < -0.5;
  const hx = x + p.dirX * 20;
  const hy = y - 22 + p.dirY * 10 - bob;
  const drawHeld = () => {
    if (!p.held) {
      // mãozinhas
      ellipse(ctx, x + p.dirX * 14 - p.dirY * 12, y - 20 - bob + p.dirY * 4, 5, 5, C.skin);
      ellipse(ctx, x + p.dirX * 14 + p.dirY * 12, y - 20 - bob + p.dirY * 4, 5, 5, C.skin);
      return;
    }
    const s = p.held.k === 'stack' ? 0.8 : p.held.k === 'pot' ? 0.75 : 0.85;
    drawItem(ctx, p.held, hx, hy, s);
    ellipse(ctx, hx - 16 * s, hy + 2, 5, 5, C.skin);
    ellipse(ctx, hx + 16 * s, hy + 2, 5, 5, C.skin);
  };

  if (facingUp) drawHeld();

  // pés
  const step = moving ? Math.sin(p.walk) * 4 : 0;
  ellipse(ctx, x - 7, y - 2 + step, 6, 4, '#3b2a22');
  ellipse(ctx, x + 7, y - 2 - step, 6, 4, '#3b2a22');
  // corpo
  ellipse(ctx, x, y - 20 - bob, 17, 19, p.body);
  // avental
  ctx.beginPath();
  ctx.ellipse(x, y - 16 - bob, 12, 13, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // cabeça
  const headY = y - 42 - bob;
  ellipse(ctx, x, headY, 14, 13, C.skin);
  if (!facingUp) {
    const ex = p.dirX * 5;
    const ey = p.dirY * 2;
    ellipse(ctx, x - 5 + ex, headY + 1 + ey, 2.3, 3, C.ink);
    ellipse(ctx, x + 5 + ex, headY + 1 + ey, 2.3, 3, C.ink);
    ellipse(ctx, x - 9 + ex, headY + 5 + ey, 2.5, 1.5, 'rgba(255,120,120,0.5)');
    ellipse(ctx, x + 9 + ex, headY + 5 + ey, 2.5, 1.5, 'rgba(255,120,120,0.5)');
  }
  // chapéu de chef
  rr(ctx, x - 12, headY - 16, 24, 8, 3);
  ctx.fillStyle = p.accent;
  ctx.fill();
  for (const [dx, dy, r] of [[-8, -21, 8], [8, -21, 8], [0, -26, 10]]) ellipse(ctx, x + dx, headY + dy, r, r, '#ffffff');

  if (!facingUp) drawHeld();

  // trabalhando
  if (p.working) {
    const k = Math.sin(gs.clock * 22);
    emoji(ctx, p.working.type === 'sink' ? '🧽' : '🔪', hx, hy - 6 + k * 5, 20, k * 0.4);
  }

  // etiqueta do jogador
  const ly = headY - 46;
  ellipse(ctx, x, ly, 11, 11, '#ffffff');
  ellipse(ctx, x, ly, 9, 9, faded ? '#9ca3af' : p.body);
  text(ctx, p.label, x, ly + 1, 13, '#ffffff', { weight: 900 });
  if (gs.solo && p.active) {
    ctx.beginPath();
    ctx.moveTo(x - 6, ly - 16 + Math.sin(gs.clock * 6) * 2);
    ctx.lineTo(x + 6, ly - 16 + Math.sin(gs.clock * 6) * 2);
    ctx.lineTo(x, ly - 9 + Math.sin(gs.clock * 6) * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }
  ctx.restore();
}

function drawHighlight(ctx: CanvasRenderingContext2D, gs: GameState, p: Player) {
  const t = p.target;
  if (!t || p.dead) return;
  if (gs.solo && !p.active) return;
  const sx = OX + t.x * T;
  const sy = OY + t.y * T - LIFT;
  const a = 0.55 + Math.sin(gs.clock * 6) * 0.25;
  rr(ctx, sx + 2, sy + 1, T - 4, T - 4, 7);
  ctx.strokeStyle = p.body;
  ctx.globalAlpha = a;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ─── HUD ────────────────────────────────────────────────────────────────────
function drawTickets(ctx: CanvasRenderingContext2D, gs: GameState, dt: number) {
  let i = 0;
  for (const o of gs.orders) {
    const target = 16 + i * (TICKET_W + TICKET_GAP);
    o.x = o.x > 1500 ? target + 300 : o.x + (target - o.x) * Math.min(1, dt * 10);
    if (o.failT <= 0 && o.okT <= 0) i++;
    const rec = RECIPES[o.recipe];
    const ratio = o.t / o.max;
    let x = o.x;
    let y = 12;
    let alpha = 1;
    if (o.failT > 0) {
      y += (0.9 - o.failT) * 40;
      alpha = Math.min(1, o.failT * 2);
    }
    if (o.okT > 0) {
      y -= (0.6 - o.okT) * 50;
      alpha = Math.min(1, o.okT * 2.5);
    }
    if (ratio < 0.25 && o.failT <= 0 && o.okT <= 0) x += Math.sin(gs.clock * 45) * 2.5;

    ctx.save();
    ctx.globalAlpha = alpha;
    const h = 100;
    rr(ctx, x + 2, y + 4, TICKET_W, h, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    rr(ctx, x, y, TICKET_W, h, 12);
    ctx.fillStyle = o.failT > 0 ? '#fecaca' : o.okT > 0 ? '#bbf7d0' : C.paper;
    ctx.fill();

    // barra de tempo
    const col = ratio > 0.5 ? C.good : ratio > 0.25 ? C.warn : C.bad;
    rr(ctx, x + 6, y + 6, TICKET_W - 12, 9, 5);
    ctx.fillStyle = '#e7dccb';
    ctx.fill();
    rr(ctx, x + 6, y + 6, Math.max(6, (TICKET_W - 12) * ratio), 9, 5);
    ctx.fillStyle = col;
    ctx.fill();

    // prato
    drawPlateBase(ctx, x + TICKET_W / 2, y + 40, 1.05);
    drawPlateContents(ctx, rec.parts, x + TICKET_W / 2, y + 38, 1.05);
    text(ctx, rec.name, x + TICKET_W / 2, y + 62, 12, C.ink, { weight: 800 });

    // ingredientes
    const n = rec.steps.length;
    const cw = 32;
    const startX = x + TICKET_W / 2 - (n * cw) / 2;
    rec.steps.forEach((st, k) => {
      const bx = startX + k * cw;
      rr(ctx, bx + 2, y + 71, cw - 4, 25, 6);
      ctx.fillStyle = '#efe4d2';
      ctx.fill();
      if (st.f === 'bun') drawBun(ctx, bx + cw / 2 - 4, y + 84, 0.5);
      else emoji(ctx, FOOD_EMOJI[st.f], bx + cw / 2 - 4, y + 83, 14);
      const tool = st.tool === 'knife' ? '🔪' : st.tool === 'pot' ? '🥘' : st.tool === 'pan' ? '🍳' : '';
      if (tool) emoji(ctx, tool, bx + cw / 2 + 7, y + 89, 10);
    });
    ctx.restore();
  }
}

function drawBottomHud(ctx: CanvasRenderingContext2D, gs: GameState, W: number, H: number) {
  const y = H - HUD_BOTTOM / 2 - 4;
  // moeda + pontos
  rr(ctx, 16, y - 24, 190, 48, 24);
  ctx.fillStyle = 'rgba(30,18,12,0.82)';
  ctx.fill();
  ellipse(ctx, 42, y, 17, 17, '#f5b301');
  ellipse(ctx, 42, y, 12, 12, '#ffd23f');
  text(ctx, '$', 42, y + 1, 16, '#b07a00', { weight: 900 });
  text(ctx, String(gs.score), 70, y + 2, 30, '#ffffff', { align: 'left', weight: 900 });

  // combo de gorjeta
  if (gs.combo > 1) {
    rr(ctx, 214, y - 16, 118, 32, 16);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    text(ctx, `Gorjeta x${gs.combo}`, 273, y + 1, 16, C.ink, { weight: 900 });
  }

  // nome da fase
  text(ctx, gs.level.name, W / 2, y + 2, 18, 'rgba(255,255,255,0.85)', { weight: 800 });

  // relógio
  const low = gs.time < 30;
  const pulse = low ? 1 + Math.max(0, Math.sin(gs.clock * 8)) * 0.08 : 1;
  ctx.save();
  ctx.translate(W - 100, y);
  ctx.scale(pulse, pulse);
  rr(ctx, -84, -24, 168, 48, 24);
  ctx.fillStyle = low ? '#b91c1c' : 'rgba(30,18,12,0.82)';
  ctx.fill();
  ellipse(ctx, -58, 0, 15, 15, '#ffffff');
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-58, 0);
  ctx.lineTo(-58, -9);
  ctx.moveTo(-58, 0);
  ctx.lineTo(-51, 3);
  ctx.stroke();
  const m = Math.floor(Math.ceil(gs.time) / 60);
  const s = Math.ceil(gs.time) % 60;
  text(ctx, `${m}:${String(s).padStart(2, '0')}`, 12, 2, 30, '#ffffff', { weight: 900 });
  ctx.restore();
}

// ─── Cena completa ──────────────────────────────────────────────────────────
export function render(ctx: CanvasRenderingContext2D, gs: GameState, dt: number) {
  const { W, H } = worldSize(gs);
  const lv = gs.level;

  // fundo
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(lv.wall, -30));
  g.addColorStop(1, shade(lv.wall, -60));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (gs.shake > 0) ctx.translate((Math.random() - 0.5) * gs.shake * 10, (Math.random() - 0.5) * gs.shake * 10);

  // chão
  for (const row of gs.tiles) {
    for (const t of row) {
      const sx = OX + t.x * T;
      const sy = OY + t.y * T;
      if (t.type === 'void' || (t.type === 'gap' && gs.gapPhase === 'open')) {
        ctx.fillStyle = '#140c0a';
        ctx.fillRect(sx, sy, T, T);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(sx, sy, T, 10);
        continue;
      }
      ctx.fillStyle = lv.floor[(t.x + t.y) % 2];
      ctx.fillRect(sx, sy, T, T);
      if (t.type === 'gap') {
        ctx.strokeStyle = 'rgba(80,40,30,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + (t.x % 2 ? 0 : T), sy + 8);
        ctx.lineTo(sx + T / 2, sy + T / 2);
        ctx.lineTo(sx + (t.x % 2 ? 0 : T), sy + T - 8);
        ctx.stroke();
        if (gs.gapPhase === 'warn' && Math.floor(gs.clock * 6) % 2 === 0) {
          ctx.fillStyle = 'rgba(239,68,68,0.45)';
          ctx.fillRect(sx, sy, T, T);
        }
      }
    }
  }

  // sombras no chão, embaixo das bancadas
  for (const row of gs.tiles) {
    for (const t of row) {
      if (t.type === 'floor' || t.type === 'void' || t.type === 'gap') continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(OX + t.x * T, OY + t.y * T + T - 2, T, 10);
    }
  }

  // bancadas + entidades em ordem de profundidade
  const alive = gs.players.filter((p) => !p.dead);
  for (let y = 0; y < gs.h; y++) {
    for (const t of gs.tiles[y]) {
      if (t.type === 'floor' || t.type === 'void' || t.type === 'gap') continue;
      drawTile(ctx, gs, t);
    }
    for (const f of gs.floorItems) {
      if (Math.floor(f.y) === y) drawItem(ctx, f.item, OX + f.x * T, OY + f.y * T - 4, 0.8);
    }
    for (const p of alive) if (Math.floor(p.y) === y) drawPlayer(ctx, gs, p);
  }

  for (const p of alive) drawHighlight(ctx, gs, p);

  // ingredientes voando
  for (const pr of gs.projectiles) {
    const k = pr.dist / K.throwRange;
    const lift = Math.sin(Math.min(1, k) * Math.PI) * 26 + 22;
    ellipse(ctx, OX + pr.x * T, OY + pr.y * T, 10, 4, 'rgba(0,0,0,0.25)');
    drawItem(ctx, pr.item, OX + pr.x * T, OY + pr.y * T - lift, 0.8);
  }

  // partículas
  for (const q of gs.particles) {
    ctx.globalAlpha = Math.max(0, q.life / q.max) * 0.85;
    ellipse(ctx, OX + q.x * T, OY + q.y * T - 20, q.size, q.size, q.color);
  }
  ctx.globalAlpha = 1;

  for (const row of gs.tiles) for (const t of row) if (t.item || t.washP > 0) drawTileOverlay(ctx, gs, t);

  // chefs caídos: contagem para renascer
  for (const p of gs.players) {
    if (!p.dead) continue;
    const x = OX + p.spawn.x * T;
    const y = OY + p.spawn.y * T - 20;
    ellipse(ctx, x, y, 20, 20, 'rgba(0,0,0,0.5)');
    ctx.strokeStyle = p.body;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.dead / K.respawn));
    ctx.stroke();
    text(ctx, String(Math.ceil(p.dead)), x, y + 1, 18, '#ffffff');
  }

  // textos flutuantes
  for (const f of gs.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    text(ctx, f.text, OX + f.x * T, OY + f.y * T - 30, f.big ? 30 : 16, f.color, { stroke: '#2b1d16' });
  }
  ctx.globalAlpha = 1;

  // aviso do chão
  if (lv.gap && gs.gapPhase === 'warn' && !gs.over) {
    text(ctx, 'O chão vai abrir!', W / 2, OY + T * 0.2, 26, '#ffffff', { stroke: '#b91c1c' });
  }
  ctx.restore();

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, W, HUD_TOP - 8);
  drawTickets(ctx, gs, dt);
  drawBottomHud(ctx, gs, W, H);

  // contagem inicial
  if (gs.countdown > 0) {
    ctx.fillStyle = 'rgba(20,12,8,0.45)';
    ctx.fillRect(0, 0, W, H);
    const n = Math.ceil(gs.countdown - 0.6);
    const frac = (gs.countdown - 0.6) % 1;
    const label = n > 3 ? 'Preparar...' : n > 0 ? String(n) : 'JÁ!';
    const sc = n > 3 ? 1 : 1 + (frac < 0 ? 0 : frac) * 0.4;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    text(ctx, label, 0, 0, n > 3 ? 64 : 120, '#ffffff', { stroke: '#2b1d16', weight: 900 });
    ctx.restore();
    if (n > 3 || n === 3) text(ctx, lv.subtitle, W / 2, H / 2 + 80, 22, '#fff4dc', { stroke: '#2b1d16' });
  }

  if (gs.over) {
    ctx.fillStyle = `rgba(20,12,8,${Math.min(0.55, gs.overT)})`;
    ctx.fillRect(0, 0, W, H);
    const sc = Math.min(1, gs.overT * 3);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    text(ctx, 'Acabou o tempo!', 0, 0, 80, '#ffffff', { stroke: '#2b1d16', weight: 900 });
    ctx.restore();
  }
}
