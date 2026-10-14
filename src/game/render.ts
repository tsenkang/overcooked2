import { RECIPES } from './content';
import { potDone, vesselBurnLimit, vesselReady } from './engine';
import type { ArenaDef, FoodId, FoodItem, GameState, HatId, Item, Player, ThiefState, Tile, VesselItem } from './types';
import { TUNING as K } from './types';

// ─── Tokens visuais ─────────────────────────────────────────────────────────
export const T = 64; // px por tile
const LIFT = 20; // altura das bancadas
const HUD_TOP = 124;
const HUD_BOTTOM = 72;
const PAD = 44;
const SCENE = 62; // faixa do cenário temático, entre o HUD e a cozinha
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
  soupMixed: '#d97b3f',
  bunTop: '#e2a04f',
  bunBot: '#d58f3f',
  patty: '#7a4a2a',
  lettuce: '#64c24a',
};

const FOOD_EMOJI: Record<FoodId, string> = {
  tomato: '🍅',
  onion: '🧅',
  lettuce: '🥬',
  meat: '🥩',
  bun: '🍞',
};

export function worldSize(gs: GameState) {
  return { W: gs.w * T + PAD * 2, H: HUD_TOP + SCENE + LIFT + gs.h * T + HUD_BOTTOM };
}
const OX = PAD;
const OY = HUD_TOP + SCENE + LIFT;

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
      const kind = p.slice(5); // 'tomato' | 'onion' | 'mixed'
      const color = kind === 'onion' ? C.soupOnion : kind === 'mixed' ? C.soupMixed : C.soupTomato;
      ellipse(ctx, x, y, 15 * s, 8 * s, color);
      ellipse(ctx, x - 4 * s, y - 2 * s, 5 * s, 2 * s, 'rgba(255,255,255,0.35)');
      if (kind === 'mixed') {
        emoji(ctx, '🍅', x - 2 * s, y, 10 * s);
        emoji(ctx, '🧅', x + 7 * s, y + 1 * s, 10 * s);
      } else {
        emoji(ctx, kind === 'onion' ? '🧅' : '🍅', x + 5 * s, y, 11 * s);
      }
    }
  }
  const hasBun = parts.includes('bun:raw');
  const hasMeat = parts.includes('meat:cooked');
  const hasLettuce = parts.includes('lettuce:chopped');
  const hasTomato = parts.includes('tomato:chopped');
  const hasOnion = parts.includes('onion:chopped');
  if (hasBun) {
    ellipse(ctx, x, y + 1 * s, 15 * s, 6 * s, C.bunBot);
    let yy = y - 2 * s;
    if (hasMeat) {
      drawPatty(ctx, x, yy, s * 0.95);
      yy -= 5 * s;
    }
    if (hasTomato) {
      emoji(ctx, '🍅', x, yy, 15 * s);
      yy -= 3.5 * s;
    }
    if (hasOnion) {
      emoji(ctx, '🧅', x, yy, 13 * s);
      yy -= 3 * s;
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
  if (hasOnion) emoji(ctx, '🧅', x + (hasTomato || hasLettuce ? -7 : 0) * s, y - 1 * s, 13 * s, -0.15);
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
      const distinct = new Set(v.contents).size;
      const color = v.burnt
        ? '#1c1a19'
        : distinct > 1
          ? C.soupMixed
          : v.contents[0] === 'onion' ? C.soupOnion : C.soupTomato;
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

function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y + 4 * s);
  ctx.rotate(-0.6);
  ellipse(ctx, 0, 14 * s, 9 * s, 3 * s, 'rgba(0,0,0,0.2)');
  // cabo + corpo do taco, numa peça só
  ctx.beginPath();
  ctx.moveTo(-3.2 * s, 14 * s);
  ctx.lineTo(-3.2 * s, -6 * s);
  ctx.quadraticCurveTo(-9 * s, -20 * s, -4.5 * s, -30 * s);
  ctx.quadraticCurveTo(0, -34 * s, 4.5 * s, -30 * s);
  ctx.quadraticCurveTo(9 * s, -20 * s, 3.2 * s, -6 * s);
  ctx.lineTo(3.2 * s, 14 * s);
  ctx.closePath();
  ctx.fillStyle = '#d9a05f';
  ctx.fill();
  ctx.strokeStyle = '#8a5a33';
  ctx.lineWidth = 1.2 * s;
  ctx.stroke();
  // fita no cabo
  ctx.strokeStyle = '#7a2b20';
  ctx.lineWidth = 2.2 * s;
  for (const dy of [8, 3, -2]) {
    ctx.beginPath();
    ctx.moveTo(-3.2 * s, dy * s);
    ctx.lineTo(3.2 * s, (dy + 2) * s);
    ctx.stroke();
  }
  ctx.restore();
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
    case 'bat':
      return drawBat(ctx, x, y, s);
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
  const wall = gs.arena.wall;

  // frente
  rr(ctx, sx, sy + T - LIFT - 4, T, LIFT + 4, 3);
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(sx, sy + T - 6, T, 6);
  // topo
  let top = gs.arena.top;
  if (t.type === 'stove') top = C.stove;
  if (t.type === 'serve') top = C.serve;
  rr(ctx, sx + 1, topY, T - 2, T - 2, 5);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.strokeStyle = t.type === 'stove' ? '#2b2e34' : gs.arena.topLine;
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
      ellipse(ctx, cx, cy, 22, 14, t.stolen ? '#2a2c31' : C.burner);
      ctx.strokeStyle = hot ? `rgba(255,${120 + Math.sin(gs.clock * 10) * 40},40,0.95)` : '#555a63';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 16, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (t.stolen) {
        ctx.strokeStyle = 'rgba(220,60,60,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 13, cy - 9);
        ctx.lineTo(cx + 13, cy + 9);
        ctx.moveTo(cx + 13, cy - 9);
        ctx.lineTo(cx - 13, cy + 9);
        ctx.stroke();
      }
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
// ─── Boneco do chef (compartilhado entre o jogo e a prévia do menu) ─────────
export interface ChefLook {
  body: string;
  accent: string;
  skin: string;
  hat: HatId;
}

function chefFeet(ctx: CanvasRenderingContext2D, x: number, y: number, step: number) {
  ellipse(ctx, x - 7, y - 2 + step, 6, 4, '#3b2a22');
  ellipse(ctx, x + 7, y - 2 - step, 6, 4, '#3b2a22');
}

function chefBody(ctx: CanvasRenderingContext2D, look: ChefLook, x: number, y: number, bob: number) {
  ellipse(ctx, x, y - 20 - bob, 17, 19, look.body);
  // avental
  ctx.beginPath();
  ctx.ellipse(x, y - 16 - bob, 12, 13, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function chefHead(
  ctx: CanvasRenderingContext2D, look: ChefLook, x: number, headY: number,
  dirX: number, dirY: number, showFace: boolean,
) {
  ellipse(ctx, x, headY, 14, 13, look.skin);
  if (!showFace) return;
  const ex = dirX * 5;
  const ey = dirY * 2;
  ellipse(ctx, x - 5 + ex, headY + 1 + ey, 2.3, 3, C.ink);
  ellipse(ctx, x + 5 + ex, headY + 1 + ey, 2.3, 3, C.ink);
  ellipse(ctx, x - 9 + ex, headY + 5 + ey, 2.5, 1.5, 'rgba(255,120,120,0.5)');
  ellipse(ctx, x + 9 + ex, headY + 5 + ey, 2.5, 1.5, 'rgba(255,120,120,0.5)');
}

/** Meia-elipse cobrindo o alto da cabeça (base de bandana, boné e gorro). */
function domeTop(ctx: CanvasRenderingContext2D, x: number, cy: number, rx: number, ry: number, fill: string) {
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function chefHat(ctx: CanvasRenderingContext2D, look: ChefLook, x: number, headY: number, dirX: number) {
  const a = look.accent;
  switch (look.hat) {
    case 'toque': {
      rr(ctx, x - 12, headY - 16, 24, 8, 3);
      ctx.fillStyle = a;
      ctx.fill();
      for (const [dx, dy, r] of [[-8, -21, 8], [8, -21, 8], [0, -26, 10]]) {
        ellipse(ctx, x + dx, headY + dy, r, r, '#ffffff');
      }
      break;
    }
    case 'bandana': {
      domeTop(ctx, x, headY - 1, 14.5, 13, a);
      rr(ctx, x - 14.5, headY - 7, 29, 5, 2);
      ctx.fillStyle = shade(a, -28);
      ctx.fill();
      // nó lateral
      ellipse(ctx, x + 14, headY - 4, 4, 4, a);
      ctx.beginPath();
      ctx.moveTo(x + 14, headY - 5);
      ctx.lineTo(x + 23, headY - 9);
      ctx.lineTo(x + 22, headY + 1);
      ctx.closePath();
      ctx.fillStyle = a;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const [dx, dy] of [[-7, -10], [1, -13], [8, -9]]) {
        ctx.beginPath();
        ctx.arc(x + dx, headY + dy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'cap': {
      domeTop(ctx, x, headY - 2, 14, 12, a);
      ellipse(ctx, x + dirX * 11, headY - 2, 12.5, 4.5, shade(a, -32));
      ellipse(ctx, x, headY - 13, 2.6, 2.6, shade(a, -45));
      break;
    }
    case 'beanie': {
      domeTop(ctx, x, headY - 3, 14, 14, a);
      rr(ctx, x - 14, headY - 7, 28, 6, 3);
      ctx.fillStyle = shade(a, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.13)';
      ctx.lineWidth = 1;
      for (let i = -9; i <= 9; i += 4.5) {
        ctx.beginPath();
        ctx.moveTo(x + i, headY - 16);
        ctx.lineTo(x + i, headY - 7);
        ctx.stroke();
      }
      ellipse(ctx, x, headY - 19, 5, 5, '#ffffff');
      break;
    }
    case 'crown': {
      const cy = headY - 11;
      ctx.beginPath();
      ctx.moveTo(x - 12, cy + 5);
      ctx.lineTo(x - 12, cy - 7);
      ctx.lineTo(x - 6, cy - 1);
      ctx.lineTo(x, cy - 9);
      ctx.lineTo(x + 6, cy - 1);
      ctx.lineTo(x + 12, cy - 7);
      ctx.lineTo(x + 12, cy + 5);
      ctx.closePath();
      ctx.fillStyle = a;
      ctx.fill();
      ctx.strokeStyle = shade(a, -50);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ellipse(ctx, x, cy + 1, 2, 2, '#ffffff');
      break;
    }
    case 'none':
      domeTop(ctx, x, headY, 14.5, 12, shade(look.skin, -115));
      break;
  }
}

/** Chef paradinho de frente — usado na tela de personalização. */
export function drawAvatarPreview(
  ctx: CanvasRenderingContext2D, look: ChefLook, cx: number, cy: number, scale = 1, wobble = 0,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const bob = Math.sin(wobble) * 1.6;
  ellipse(ctx, 0, 2, 20, 8, 'rgba(0,0,0,0.18)');
  chefFeet(ctx, 0, 0, 0);
  chefBody(ctx, look, 0, 0, bob);
  ellipse(ctx, -14, -18 - bob, 5, 5, look.skin);
  ellipse(ctx, 14, -18 - bob, 5, 5, look.skin);
  const headY = -42 - bob;
  chefHead(ctx, look, 0, headY, 0, 0, true);
  chefHat(ctx, look, 0, headY, 0);
  ctx.restore();
}

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
      ellipse(ctx, x + p.dirX * 14 - p.dirY * 12, y - 20 - bob + p.dirY * 4, 5, 5, p.skin);
      ellipse(ctx, x + p.dirX * 14 + p.dirY * 12, y - 20 - bob + p.dirY * 4, 5, 5, p.skin);
      return;
    }
    const s = p.held.k === 'stack' ? 0.8 : p.held.k === 'pot' ? 0.75 : 0.85;
    drawItem(ctx, p.held, hx, hy, s);
    ellipse(ctx, hx - 16 * s, hy + 2, 5, 5, p.skin);
    ellipse(ctx, hx + 16 * s, hy + 2, 5, 5, p.skin);
  };

  if (facingUp) drawHeld();

  const look: ChefLook = { body: p.body, accent: p.accent, skin: p.skin, hat: p.hat };
  // pés
  const step = moving ? Math.sin(p.walk) * 4 : 0;
  chefFeet(ctx, x, y, step);
  chefBody(ctx, look, x, y, bob);
  // cabeça
  const headY = y - 42 - bob;
  chefHead(ctx, look, x, headY, p.dirX, p.dirY, !facingUp);
  chefHat(ctx, look, x, headY, p.dirX);

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

// ─── Ladrão (fase "Assalto na Cozinha") ─────────────────────────────────────
function drawHeistDoor(ctx: CanvasRenderingContext2D, gs: GameState) {
  const th = gs.thief;
  const door = gs.doorTile;
  if (!th || !door) return;
  const x = OX + door.x * T;
  const y = OY + door.y * T;
  const openK = th.phase === 'entering' ? Math.min(1, 1 - th.t / K.heistEnter) : 1;
  ctx.save();
  ctx.translate(x, y - 28);
  rr(ctx, -17, -28, 34, 42, 4);
  ctx.fillStyle = '#241812';
  ctx.fill();
  ctx.save();
  ctx.translate(-15 * openK, 0);
  ctx.transform(1 - openK * 0.75, 0, 0, 1, 0, 0);
  rr(ctx, -15, -26, 30, 38, 3);
  ctx.fillStyle = '#7a4a2a';
  ctx.fill();
  ctx.strokeStyle = '#4e2f1a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-15, -26, 30, 38);
  ellipse(ctx, 9, -4, 2, 2, '#f5d78e');
  ctx.restore();
  ctx.restore();
}

function drawThief(ctx: CanvasRenderingContext2D, gs: GameState, th: ThiefState) {
  const x = OX + th.x * T;
  const y = OY + th.y * T;
  ctx.save();
  ellipse(ctx, x, y + 2, 20, 8, 'rgba(0,0,0,0.28)');

  if (th.phase === 'stunned') {
    ellipse(ctx, x + 2, y - 8, 23, 12, '#2b2b34');
    ellipse(ctx, x + 22, y - 10, 12, 11, '#d79a5c');
    ellipse(ctx, x + 22, y - 11, 9, 3.2, '#111318');
    for (let i = 0; i < 3; i++) {
      const a = gs.clock * 5 + i * ((Math.PI * 2) / 3);
      emoji(ctx, '⭐', x + 22 + Math.cos(a) * 15, y - 27 + Math.sin(a) * 6, 15);
    }
    ctx.restore();
    return;
  }

  const bob = Math.abs(Math.sin(gs.clock * 11)) * 3;
  ellipse(ctx, x - 6, y - 2, 5, 4, '#1c1c22');
  ellipse(ctx, x + 6, y - 2, 5, 4, '#1c1c22');
  ellipse(ctx, x, y - 18 - bob, 15, 17, '#2b2b34');
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  for (const dx of [-7, 0, 7]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y - 32 - bob);
    ctx.lineTo(x + dx, y - 4 - bob);
    ctx.stroke();
  }
  if (th.hasPot) {
    drawItem(ctx, { k: 'pot', contents: [], p: 0, burnt: false, smoke: 0, home: { x: 0, y: 0 } }, x + th.dirX * 15, y - 26 - bob, 0.55);
  } else {
    ellipse(ctx, x - th.dirX * 13, y - 22 - bob - th.dirY * 5, 8, 10, '#8a5a33');
  }
  const headY = y - 40 - bob;
  ellipse(ctx, x, headY, 12, 11, '#d79a5c');
  ellipse(ctx, x, headY - 1, 10, 3.6, '#111318');
  rr(ctx, x - 11, headY - 14, 22, 8, 4);
  ctx.fillStyle = '#3a3a44';
  ctx.fill();
  ellipse(ctx, x + 9, headY - 15, 5, 5, '#3a3a44');
  ctx.restore();
}

/** Deixa a cozinha escura, com uma luz acompanhando cada chef — usa um canvas
 * auxiliar como máscara (fura buracos claros num véu escuro) e cola por cima. */
let heistMask: HTMLCanvasElement | null = null;
function drawHeistLighting(ctx: CanvasRenderingContext2D, gs: GameState, W: number, H: number) {
  const th = gs.thief;
  if (!th) return;
  if (!heistMask) heistMask = document.createElement('canvas');
  if (heistMask.width !== Math.ceil(W) || heistMask.height !== Math.ceil(H)) {
    heistMask.width = Math.ceil(W);
    heistMask.height = Math.ceil(H);
  }
  const mctx = heistMask.getContext('2d');
  if (!mctx) return;
  mctx.clearRect(0, 0, W, H);
  mctx.globalCompositeOperation = 'source-over';
  mctx.fillStyle = 'rgba(6,4,3,0.84)';
  mctx.fillRect(0, 0, W, H);
  mctx.globalCompositeOperation = 'destination-out';
  const radius = 165;
  for (const p of gs.players) {
    if (p.dead) continue;
    const px = OX + p.x * T;
    const py = OY + p.y * T - 20;
    const g = mctx.createRadialGradient(px, py, radius * 0.12, px, py, radius);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.92)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(px, py, radius, 0, Math.PI * 2);
    mctx.fill();
  }
  // um brilho fraco em volta do ladrão — dá pra ver a silhueta, não os detalhes
  if (th.phase !== 'entering') {
    const tx = OX + th.x * T;
    const ty = OY + th.y * T - 18;
    const g2 = mctx.createRadialGradient(tx, ty, 8, tx, ty, 68);
    g2.addColorStop(0, 'rgba(0,0,0,0.5)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g2;
    mctx.beginPath();
    mctx.arc(tx, ty, 68, 0, Math.PI * 2);
    mctx.fill();
  }

  // cola a máscara usando os pixels reais da tela (ignora o zoom aplicado pelo canvas do jogo)
  const canvas = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(heistMask, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawHeistBanner(ctx: CanvasRenderingContext2D, gs: GameState, W: number) {
  const th = gs.thief;
  if (!th || th.phase === 'entering') return;
  const w = 360;
  const x = W / 2 - w / 2;
  const y = HUD_TOP - 46;
  const pulse = th.phase !== 'stunned' && th.alarmT < 4 ? 1 + Math.max(0, Math.sin(gs.clock * 10)) * 0.05 : 1;
  ctx.save();
  ctx.translate(W / 2, y + 20);
  ctx.scale(pulse, pulse);
  ctx.translate(-W / 2, -(y + 20));
  rr(ctx, x, y, w, 42, 20);
  ctx.fillStyle = th.phase === 'stunned' ? 'rgba(20,95,45,0.92)' : 'rgba(130,20,20,0.92)';
  ctx.fill();
  const label = th.phase === 'stunned'
    ? 'Ladrão nocauteado!'
    : th.hasPot ? 'Ele pegou a panela — pare-o!' : 'O LADRÃO ESTÁ NA COZINHA!';
  text(ctx, label, W / 2, y + 15, 15, '#ffffff', { weight: 900 });
  if (th.phase !== 'stunned') {
    const ratio = Math.max(0, th.alarmT / K.heistAlarm);
    rr(ctx, x + 16, y + 25, w - 32, 8, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    rr(ctx, x + 16, y + 25, (w - 32) * ratio, 8, 4);
    ctx.fillStyle = ratio < 0.3 ? '#ffb020' : '#ffffff';
    ctx.fill();
  }
  ctx.restore();
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
    const cw = n > 3 ? (TICKET_W - 8) / n : 32;
    const iconScale = n > 3 ? cw / 32 : 1;
    const startX = x + TICKET_W / 2 - (n * cw) / 2;
    rec.steps.forEach((st, k) => {
      const bx = startX + k * cw;
      rr(ctx, bx + 2, y + 71, cw - 4, 25, 6);
      ctx.fillStyle = '#efe4d2';
      ctx.fill();
      if (st.f === 'bun') drawBun(ctx, bx + cw / 2 - 4, y + 84, 0.5 * iconScale);
      else emoji(ctx, FOOD_EMOJI[st.f], bx + cw / 2 - 4, y + 83, 14 * iconScale);
      const tool = st.tool === 'knife' ? '🔪' : st.tool === 'pot' ? '🥘' : st.tool === 'pan' ? '🍳' : '';
      if (tool) emoji(ctx, tool, bx + cw / 2 + 7 * iconScale, y + 89, 10 * iconScale);
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
// ─── Temas das arenas ───────────────────────────────────────────────────────

/** Ruído estável por tile: a mesma tábua tem sempre o mesmo veio. */
function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Textura desenhada por cima da cor do chão. */
function drawFloorPattern(ctx: CanvasRenderingContext2D, ar: ArenaDef, x: number, y: number, sx: number, sy: number) {
  switch (ar.pattern) {
    case 'tatami': {
      // cada tile é um tatame: trama fina + debrum de pano
      ctx.strokeStyle = 'rgba(90,70,35,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const horiz = (x + y) % 2 === 0;
      for (let i = 7; i < T; i += 7) {
        if (horiz) { ctx.moveTo(sx + 3, sy + i); ctx.lineTo(sx + T - 3, sy + i); }
        else { ctx.moveTo(sx + i, sy + 3); ctx.lineTo(sx + i, sy + T - 3); }
      }
      ctx.stroke();
      ctx.fillStyle = '#2f4f3a';
      if (horiz) { ctx.fillRect(sx, sy, T, 3); ctx.fillRect(sx, sy + T - 3, T, 3); }
      else { ctx.fillRect(sx, sy, 3, T); ctx.fillRect(sx + T - 3, sy, 3, T); }
      break;
    }
    case 'checker': {
      // ladrilho de bistrô: rejunte + brilho no canto
      ctx.strokeStyle = 'rgba(0,0,0,0.13)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, T - 1, T - 1);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy + 4);
      ctx.lineTo(sx + 22, sy + 4);
      ctx.lineTo(sx + 4, sy + 22);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'calcada': {
      // calçadão em ondas: as curvas se emendam de tile em tile
      ctx.strokeStyle = 'rgba(45,35,28,0.26)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const oy = sy + 16 + i * 32;
        ctx.moveTo(sx, oy);
        ctx.bezierCurveTo(sx + T * 0.25, oy - 13, sx + T * 0.75, oy + 13, sx + T, oy);
      }
      ctx.stroke();
      break;
    }
    case 'mudcloth': {
      // grafismo geométrico sobre barro batido
      ctx.strokeStyle = 'rgba(70,35,15,0.30)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const step = T / 4;
      for (let i = 0; i < 4; i++) {
        const px = sx + i * step;
        ctx.moveTo(px, sy + (i % 2 ? 24 : 12));
        ctx.lineTo(px + step, sy + (i % 2 ? 12 : 24));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(70,35,15,0.22)';
      for (let i = 0; i < 3; i++) ctx.fillRect(sx + 11 + i * 17, sy + T - 17, 5, 5);
      break;
    }
    case 'diner': {
      // piso encerado de lanchonete
      const g = ctx.createLinearGradient(sx, sy, sx + T, sy + T);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      g.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = g;
      ctx.fillRect(sx, sy, T, T);
      break;
    }
    case 'deck': {
      // tábuas do convés com veio e pregos
      ctx.strokeStyle = 'rgba(85,50,22,0.40)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy + T - 1);
      ctx.lineTo(sx + T, sy + T - 1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(130,85,42,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const oy = sy + 18 + i * 22 + hash2(x, y + i * 7) * 7;
        ctx.moveTo(sx + 5, oy);
        ctx.lineTo(sx + T - 5, oy);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(60,38,18,0.5)';
      for (const dx of [7, T - 7]) {
        ctx.beginPath();
        ctx.arc(sx + dx, sy + T - 8, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

/** Água: usada nos tiles vazios do galeão. */
function drawWater(ctx: CanvasRenderingContext2D, clock: number, sx: number, sy: number) {
  ctx.fillStyle = '#12607a';
  ctx.fillRect(sx, sy, T, T);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const oy = sy + 20 + i * 26;
    const w0 = Math.sin(clock * 1.5 + sx * 0.05 + i) * 3;
    const w1 = Math.sin(clock * 1.5 + (sx + T) * 0.05 + i) * 3;
    ctx.moveTo(sx, oy + w0);
    ctx.bezierCurveTo(sx + T * 0.3, oy - 6 + w0, sx + T * 0.7, oy + 6 + w1, sx + T, oy + w1);
  }
  ctx.stroke();
}

/** Fundo da tela inteira (atrás de tudo). */
function drawBackground(ctx: CanvasRenderingContext2D, gs: GameState, W: number, H: number) {
  const ar = gs.arena;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (ar.sea) {
    g.addColorStop(0, '#0d4d62');
    g.addColorStop(1, '#072e3d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const base = HUD_TOP + i * 64;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 14) {
        const yy = base + Math.sin(x * 0.02 + gs.clock * 1.1 + i) * 5;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    return;
  }
  g.addColorStop(0, shade(ar.wall, -30));
  g.addColorStop(1, shade(ar.wall, -60));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function hill(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(x - w, base);
  ctx.quadraticCurveTo(x - w * 0.35, base - h * 1.25, x, base - h);
  ctx.quadraticCurveTo(x + w * 0.35, base - h * 1.25, x + w, base);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Cenário do país, na faixa entre o HUD e a cozinha.
 * Tudo em silhueta: precisa ler bem em 62 px de altura.
 */
function drawScene(ctx: CanvasRenderingContext2D, gs: GameState, W: number) {
  const ar = gs.arena;
  const top = HUD_TOP;
  const base = HUD_TOP + SCENE;
  const t = gs.clock;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, SCENE);
  ctx.clip();

  const sky = ctx.createLinearGradient(0, top, 0, base);
  switch (ar.scene) {
    case 'japan': {
      sky.addColorStop(0, '#3a2b52');
      sky.addColorStop(1, '#8c4a63');
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, SCENE);
      // monte ao fundo
      hill(ctx, W * 0.22, base, 120, 40, 'rgba(30,22,45,0.55)');
      hill(ctx, W * 0.78, base, 150, 30, 'rgba(30,22,45,0.45)');
      // torii
      const tx = W * 0.5;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(tx - 34, base - 40, 7, 40);
      ctx.fillRect(tx + 27, base - 40, 7, 40);
      ctx.fillRect(tx - 46, base - 46, 92, 7);
      ctx.fillRect(tx - 38, base - 32, 76, 5);
      // lanternas balançando
      for (let i = 0; i < 6; i++) {
        const lx = 40 + i * ((W - 80) / 5);
        const sw = Math.sin(t * 1.3 + i) * 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, top);
        ctx.lineTo(lx + sw, top + 12);
        ctx.stroke();
        ellipse(ctx, lx + sw, top + 21, 8, 10, '#e8483c');
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(lx + sw - 8, top + 20, 16, 2);
      }
      // pétalas
      ctx.fillStyle = 'rgba(255,205,220,0.85)';
      for (let i = 0; i < 14; i++) {
        const px = (i * 97 + t * 26) % W;
        const py = top + ((i * 31 + t * 13) % SCENE);
        ctx.beginPath();
        ctx.ellipse(px, py, 3, 2, i, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'france': {
      sky.addColorStop(0, '#1b2a4a');
      sky.addColorStop(1, '#5b6fa0');
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, SCENE);
      // torre
      const ex = W * 0.5;
      ctx.fillStyle = 'rgba(16,20,34,0.88)';
      ctx.beginPath();
      ctx.moveTo(ex - 20, base);
      ctx.quadraticCurveTo(ex - 9, base - 26, ex - 5, base - 44);
      ctx.lineTo(ex - 1.5, base - 60);
      ctx.lineTo(ex + 1.5, base - 60);
      ctx.lineTo(ex + 5, base - 44);
      ctx.quadraticCurveTo(ex + 9, base - 26, ex + 20, base);
      ctx.closePath();
      ctx.fill();
      // plataformas + arco da base
      ctx.fillRect(ex - 14, base - 28, 28, 3.5);
      ctx.fillRect(ex - 7, base - 44, 14, 3);
      ctx.clearRect(ex - 9, base - 1, 18, 1);
      // prédios
      ctx.fillStyle = 'rgba(18,22,38,0.6)';
      for (let i = 0; i < 9; i++) {
        const bx = i * (W / 9);
        const bh = 16 + ((i * 7) % 5) * 5;
        if (Math.abs(bx + W / 18 - ex) < 46) continue;
        ctx.fillRect(bx, base - bh, W / 9 - 8, bh);
      }
      // toldo listrado na frente
      const stripe = 22;
      for (let i = 0; i * stripe < W; i++) {
        ctx.fillStyle = i % 2 ? '#f4f1ea' : '#b8352f';
        ctx.fillRect(i * stripe, base - 13, stripe, 13);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, base - 3, W, 3);
      break;
    }
    case 'brazil': {
      sky.addColorStop(0, '#f0902f');
      sky.addColorStop(1, '#f6c96a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, SCENE);
      ellipse(ctx, W * 0.5, base - 6, 26, 26, 'rgba(255,240,180,0.9)');
      // morros
      hill(ctx, W * 0.24, base, 90, 46, 'rgba(22,70,45,0.8)');
      hill(ctx, W * 0.36, base, 60, 30, 'rgba(18,58,38,0.85)');
      hill(ctx, W * 0.72, base, 110, 40, 'rgba(22,70,45,0.75)');
      // mar entre os morros
      ctx.fillStyle = 'rgba(30,110,130,0.55)';
      ctx.fillRect(0, base - 10, W, 10);
      // coqueiros
      for (const cx of [W * 0.1, W * 0.9]) {
        ctx.strokeStyle = '#4a3320';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, base);
        ctx.quadraticCurveTo(cx + 5, base - 24, cx + 2, base - 40);
        ctx.stroke();
        ctx.fillStyle = '#1f6b3a';
        for (let i = 0; i < 5; i++) {
          const ang = -Math.PI / 2 + (i - 2) * 0.55 + Math.sin(t * 1.1 + i) * 0.05;
          ctx.save();
          ctx.translate(cx + 2, base - 40);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(13, 0, 13, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      break;
    }
    case 'africa': {
      sky.addColorStop(0, '#e0622e');
      sky.addColorStop(1, '#f2ae55');
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, SCENE);
      ellipse(ctx, W * 0.5, base - 12, 30, 30, 'rgba(255,225,150,0.95)');
      ctx.fillStyle = 'rgba(60,30,15,0.5)';
      ctx.fillRect(0, base - 8, W, 8);
      // baobá
      const bx = W * 0.26;
      ctx.fillStyle = 'rgba(48,26,14,0.9)';
      ctx.beginPath();
      ctx.moveTo(bx - 13, base);
      ctx.lineTo(bx - 7, base - 30);
      ctx.lineTo(bx + 7, base - 30);
      ctx.lineTo(bx + 13, base);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i - 2) * 0.5;
        ctx.save();
        ctx.translate(bx, base - 30);
        ctx.rotate(ang);
        ctx.fillRect(0, -2, 22, 4);
        ctx.restore();
      }
      ellipse(ctx, bx, base - 38, 30, 9, 'rgba(48,26,14,0.9)');
      // acácias
      for (const ax of [W * 0.66, W * 0.85]) {
        ctx.fillStyle = 'rgba(48,26,14,0.8)';
        ctx.fillRect(ax - 2, base - 22, 4, 22);
        ctx.beginPath();
        ctx.moveTo(ax - 20, base - 22);
        ctx.lineTo(ax + 20, base - 22);
        ctx.lineTo(ax, base - 32);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'usa': {
      sky.addColorStop(0, '#141c33');
      sky.addColorStop(1, '#2d3c63');
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, SCENE);
      // estrada
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(0, base - 16, W, 16);
      ctx.fillStyle = '#e8c33a';
      for (let i = 0; i * 44 < W; i++) ctx.fillRect(i * 44 + ((t * 40) % 44), base - 9, 22, 3);
      // letreiro de neon
      const nx = W * 0.5;
      const on = Math.sin(t * 3) > -0.6;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(nx, top + 4);
      ctx.lineTo(nx, top + 14);
      ctx.stroke();
      rr(ctx, nx - 52, top + 14, 104, 28, 6);
      ctx.fillStyle = '#14182b';
      ctx.fill();
      ctx.strokeStyle = on ? '#ff4d6d' : 'rgba(255,77,109,0.3)';
      ctx.lineWidth = 3;
      ctx.stroke();
      text(ctx, 'ROTA 66', nx, top + 29, 17, on ? '#ffe066' : 'rgba(255,224,102,0.35)');
      // postes
      for (const px of [W * 0.12, W * 0.88]) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - 2, base - 40, 4, 40);
        ellipse(ctx, px, base - 42, 7, 5, on ? 'rgba(255,230,150,0.9)' : 'rgba(255,230,150,0.4)');
      }
      break;
    }
    case 'ship': {
      sky.addColorStop(0, '#6fc3d6');
      sky.addColorStop(1, '#cdeaf0');
      ctx.fillStyle = sky;
      ctx.fillRect(0, top, W, SCENE * 0.45);
      // mar
      const seaTop = top + SCENE * 0.45;
      const sg = ctx.createLinearGradient(0, seaTop, 0, base);
      sg.addColorStop(0, '#1b8ba6');
      sg.addColorStop(1, '#0d5670');
      ctx.fillStyle = sg;
      ctx.fillRect(0, seaTop, W, base - seaTop);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const yy = seaTop + 8 + i * 11 + Math.sin(x * 0.03 + t * 1.4 + i) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // barbatanas de tubarão
      for (let i = 0; i < 3; i++) {
        const fx = ((t * (22 + i * 9) + i * 260) % (W + 80)) - 40;
        const fy = seaTop + 16 + i * 10;
        ctx.fillStyle = 'rgba(20,40,55,0.85)';
        ctx.beginPath();
        ctx.moveTo(fx - 8, fy);
        ctx.quadraticCurveTo(fx, fy - 13, fx + 7, fy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx - 13, fy + 1);
        ctx.lineTo(fx + 12, fy + 1);
        ctx.stroke();
      }
      // gaivotas
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const gx = ((t * 16 + i * 190) % (W + 60)) - 30;
        const gy = top + 10 + (i % 2) * 9;
        const flap = Math.sin(t * 5 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(gx - 7, gy);
        ctx.quadraticCurveTo(gx, gy - 5 - flap, gx + 7, gy);
        ctx.stroke();
      }
      // amurada do casco na frente
      ctx.fillStyle = '#6b3f22';
      ctx.fillRect(0, base - 14, W, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let i = 0; i * 58 < W; i++) ctx.fillRect(i * 58 + 18, base - 12, 20, 8);
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(0, base - 16, W, 3);
      break;
    }
  }
  ctx.restore();
  // sombra do cenário caindo sobre a cozinha
  const sh = ctx.createLinearGradient(0, base - 10, 0, base + 8);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, base - 10, W, 18);
}

/** Miniatura do mapa para a tela de escolha. */
const THUMB_MARK: Record<string, string> = {
  T: '#e0463a', O: '#e9b949', L: '#64c24a', M: '#a1583a', B: '#d9a05b',
  K: '#f3e4c8', S: '#3a3d44', F: '#3a3d44', W: '#f7b538', R: '#9b7fd4',
  X: '#4b3a30', Z: '#79b6d9', D: '#c9d1d6', P: '#ffffff', E: '#d63b2f',
};

export function drawArenaThumb(ctx: CanvasRenderingContext2D, ar: ArenaDef, W: number, H: number) {
  const h = ar.map.length;
  const w = ar.map[0].length;
  const s = Math.min(W / w, H / h);
  const ox = (W - w * s) / 2;
  const oy = (H - h * s) / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ar.sea ? '#0d4d62' : shade(ar.wall, -45);
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = ar.map[y][x] ?? ' ';
      const px = ox + x * s;
      const py = oy + y * s;
      if (c === ' ') continue;
      if (c === '.' || c === '1' || c === '2') ctx.fillStyle = ar.floor[(x + y) % 2];
      else if (c === '~') ctx.fillStyle = shade(ar.floor[0], -40);
      else ctx.fillStyle = ar.top;
      ctx.fillRect(px, py, s, s);
      const mark = THUMB_MARK[c];
      if (mark) {
        ctx.fillStyle = mark;
        ctx.fillRect(px + s * 0.22, py + s * 0.22, s * 0.56, s * 0.56);
      }
      if (c === '1' || c === '2') {
        ctx.fillStyle = c === '1' ? '#2f7de1' : '#ef5a3c';
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, s * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function render(ctx: CanvasRenderingContext2D, gs: GameState, dt: number) {
  const { W, H } = worldSize(gs);
  const lv = gs.level;
  const ar = gs.arena;
  // a fenda só é um perigo nas fases que a usam; nas outras é chão comum
  const hasGap = !!gs.level.gap;

  drawBackground(ctx, gs, W, H);
  drawScene(ctx, gs, W);

  ctx.save();
  if (gs.shake > 0) ctx.translate((Math.random() - 0.5) * gs.shake * 10, (Math.random() - 0.5) * gs.shake * 10);

  // chão
  for (const row of gs.tiles) {
    for (const t of row) {
      const sx = OX + t.x * T;
      const sy = OY + t.y * T;
      const open = t.type === 'gap' && hasGap && gs.gapPhase === 'open';
      if (t.type === 'void' || open) {
        if (ar.sea && t.type === 'void') {
          drawWater(ctx, gs.clock, sx, sy);
        } else {
          ctx.fillStyle = '#140c0a';
          ctx.fillRect(sx, sy, T, T);
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(sx, sy, T, 10);
        }
        continue;
      }
      ctx.fillStyle = ar.floor[(t.x + t.y) % 2];
      ctx.fillRect(sx, sy, T, T);
      drawFloorPattern(ctx, ar, t.x, t.y, sx, sy);
      if (t.type === 'gap' && hasGap) {
        ctx.strokeStyle = 'rgba(80,40,30,0.45)';
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
    if (gs.doorTile && Math.floor(gs.doorTile.y) === y) drawHeistDoor(ctx, gs);
    if (gs.thief && Math.floor(gs.thief.y) === y) drawThief(ctx, gs, gs.thief);
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

  // cozinha escura + luz em volta dos chefs, durante o assalto
  drawHeistLighting(ctx, gs, W, H);
  ctx.restore();

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, W, HUD_TOP - 8);
  drawTickets(ctx, gs, dt);
  drawBottomHud(ctx, gs, W, H);
  drawHeistBanner(ctx, gs, W);

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
