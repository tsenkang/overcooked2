// ─── Tipos centrais do jogo ────────────────────────────────────────────────
// Toda a lógica trabalha em "tiles" (1 tile = 1 quadrado do mapa).

export type FoodId = 'tomato' | 'onion' | 'lettuce' | 'meat' | 'bun';
export type FoodState = 'raw' | 'chopped' | 'cooked' | 'burnt';

export interface FoodItem {
  k: 'food';
  f: FoodId;
  s: FoodState;
  chop: number; // 0..1 progresso de corte (fica salvo se tirar da tábua)
}
/** Prato limpo, com os "pedaços" já montados. Ex.: ['bun:raw', 'meat:cooked'] */
export interface PlateItem {
  k: 'plate';
  parts: string[];
}
/** Pilha de pratos (limpos ou sujos). */
export interface StackItem {
  k: 'stack';
  n: number;
  dirty: boolean;
}
export interface VesselItem {
  k: 'pot' | 'pan';
  contents: FoodId[];
  p: number; // segundos de cozimento
  burnt: boolean;
  smoke: number; // tempo queimado no fogo (vira incêndio)
  home: Pt;
}
export interface ExtItem {
  k: 'ext';
  home: Pt;
}
export type Item = FoodItem | PlateItem | StackItem | VesselItem | ExtItem;

export interface Pt {
  x: number;
  y: number;
}

export type TileType =
  | 'floor'
  | 'void'
  | 'gap' // chão que se abre (fase 3)
  | 'counter'
  | 'crate'
  | 'board'
  | 'stove'
  | 'serve'
  | 'return'
  | 'trash'
  | 'sink'
  | 'rack';

export interface Tile {
  type: TileType;
  x: number;
  y: number;
  item: Item | null;
  crateFood?: FoodId;
  fire: number; // 0 = sem fogo; >0 = "vida" do fogo
  fireSpread: number;
  sinkDirty: number; // pratos sujos dentro da pia
  washP: number; // 0..1
}

export interface Player {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dirX: number; // direção para onde está olhando (normalizada)
  dirY: number;
  held: Item | null;
  target: Tile | null;
  working: Tile | null; // cortando / lavando
  dashT: number;
  dashCd: number;
  walk: number;
  spraying: boolean;
  dead: number; // >0 = caiu, esperando renascer
  spawn: Pt;
  body: string;
  accent: string;
  label: string;
  active: boolean; // modo solo: só um chef recebe comando
}

export interface Order {
  id: number;
  recipe: RecipeId;
  t: number;
  max: number;
  x: number; // posição animada no HUD
  failT: number; // >0 animando falha
  okT: number;
}

export interface Projectile {
  item: FoodItem;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  from: number;
}

export interface FloorItem {
  item: Item;
  x: number;
  y: number;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  big?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export type RecipeId =
  | 'soup_tomato'
  | 'soup_onion'
  | 'salad'
  | 'salad_green'
  | 'burger'
  | 'burger_full';

export interface Recipe {
  id: RecipeId;
  name: string;
  parts: string[];
  value: number;
  time: number;
  /** Passos para mostrar no ticket */
  steps: { f: FoodId; tool: 'knife' | 'pot' | 'pan' | 'none' }[];
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  map: string[];
  recipes: RecipeId[];
  duration: number;
  dirtyPlates: boolean;
  stars: [number, number, number];
  gap?: { closed: number; warn: number; open: number };
  floor: [string, string];
  wall: string;
}

export type GapPhase = 'closed' | 'warn' | 'open';

export interface GameState {
  level: LevelDef;
  w: number;
  h: number;
  tiles: Tile[][];
  players: Player[];
  orders: Order[];
  projectiles: Projectile[];
  floorItems: FloorItem[];
  floats: FloatText[];
  particles: Particle[];
  pendingPlates: number[]; // timers de pratos voltando
  respawns: { t: number; item: Item }[];
  score: number;
  delivered: number;
  failed: number;
  tipsTotal: number;
  combo: number;
  time: number;
  orderTimer: number;
  orderId: number;
  countdown: number;
  over: boolean;
  overT: number;
  gapPhase: GapPhase;
  gapT: number;
  clock: number;
  solo: boolean;
  shake: number;
}

// ─── Tempos e ajustes (tokens de gameplay) ──────────────────────────────────
export const TUNING = {
  speed: 4.6, // tiles/s
  accel: 40,
  dashSpeed: 13,
  dashTime: 0.16,
  dashCooldown: 0.45,
  radius: 0.32,
  chopTime: 2.2,
  washTime: 2.0,
  potPer: 3.2, // segundos por ingrediente na panela
  potBurnAfter: 7,
  panCook: 5,
  panBurnAfter: 6,
  fireAfterBurn: 2,
  fireHp: 1.4,
  fireSpreadEvery: 5,
  plateReturn: 7,
  throwSpeed: 10,
  throwRange: 5,
  respawn: 5,
  orderFailPenalty: 10,
  maxOrders: 5,
} as const;
