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
/** Taco de beisebol — usado para nocautear o ladrão (fase "Assalto na Cozinha"). */
export interface BatItem {
  k: 'bat';
  home: Pt;
}
export type Item = FoodItem | PlateItem | StackItem | VesselItem | ExtItem | BatItem;

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
  /** fogão que o ladrão roubou — fica sem panela pelo resto da partida */
  stolen?: boolean;
  /** piso escorregadio — o chef desliza em vez de frear na hora */
  ice?: boolean;
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
  skin: string;
  hat: HatId;
  name: string;
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
  | 'soup_mixed'
  | 'salad'
  | 'salad_green'
  | 'salad_full'
  | 'sandwich_veggie'
  | 'burger'
  | 'burger_onion'
  | 'burger_full'
  | 'burger_deluxe';

export interface Recipe {
  id: RecipeId;
  name: string;
  parts: string[];
  value: number;
  time: number;
  /** Passos para mostrar no ticket */
  steps: { f: FoodId; tool: 'knife' | 'pot' | 'pan' | 'none' }[];
}

/** Configura a fase do ladrão (opcional; ver ThiefState). */
export interface HeistDef {
  /** intervalo aleatório (segundos) até a próxima visita do ladrão */
  minGap: number;
  maxGap: number;
  /** quantas panelas ele pode roubar no máximo nessa partida */
  maxThefts: number;
}

/** Regras da fase. O layout e o visual vêm da arena escolhida no menu. */
export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  recipes: RecipeId[];
  duration: number;
  dirtyPlates: boolean;
  stars: [number, number, number];
  gap?: { closed: number; warn: number; open: number };
  heist?: HeistDef;
  /** quantos tiles de piso de gelo (em volta do centro da cozinha) — sem isso, não tem gelo */
  ice?: number;
  /** multiplicador de ritmo dos pedidos: >1 = mais rápido, <1 = mais calmo. Padrão 1. */
  rush?: number;
  /** modo sobrevivência: sem cronômetro regressivo — acaba depois de N pedidos perdidos */
  endless?: { maxStrikes: number };
}

// ─── Arenas (mapa + tema visual) ────────────────────────────────────────────
export type ArenaId = 'japan' | 'france' | 'brazil' | 'africa' | 'usa' | 'ship';
export type ArenaPattern = 'tatami' | 'checker' | 'calcada' | 'mudcloth' | 'diner' | 'deck';

/** Cozinha completa: serve para qualquer fase. */
export interface ArenaDef {
  id: ArenaId;
  name: string;
  region: string;
  flag: string;
  subtitle: string;
  props: string[];
  map: string[];
  floor: [string, string];
  wall: string;
  top: string;
  topLine: string;
  pattern: ArenaPattern;
  scene: ArenaId;
  /** desenha o vazio como mar em vez de buraco escuro */
  sea?: boolean;
}

// ─── Avatares ───────────────────────────────────────────────────────────────
export type HatId = 'toque' | 'bandana' | 'cap' | 'beanie' | 'crown' | 'none';

export interface Avatar {
  name: string;
  body: string;
  accent: string;
  skin: string;
  hat: HatId;
}

export type GapPhase = 'closed' | 'warn' | 'open';

// ─── Ladrão (fase "Assalto na Cozinha") ─────────────────────────────────────
export type ThiefPhase = 'entering' | 'sneaking' | 'fleeing' | 'stunned';

export interface ThiefState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  phase: ThiefPhase;
  t: number; // relógio da fase atual (entrando / nocauteado)
  alarmT: number; // contagem regressiva de 10s enquanto ele está solto na cozinha
  targetTile: Pt; // a panela que ele veio buscar
  hasPot: boolean;
  wanderX: number;
  wanderY: number;
  wanderT: number; // tempo até escolher um novo ponto de perambulação
  doorX: number;
  doorY: number;
}

export interface GameState {
  level: LevelDef;
  arena: ArenaDef;
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
  // ladrão
  thief: ThiefState | null;
  doorTile: Pt | null;
  heistTimer: number; // segundos até a próxima visita
  heistCount: number; // quantas panelas ele já levou
  // modo sobrevivência
  strikes: number; // pedidos perdidos nessa partida
}

// ─── Tempos e ajustes (tokens de gameplay) ──────────────────────────────────
export const TUNING = {
  speed: 4.6, // tiles/s
  accel: 40,
  iceAccel: 5.5, // bem mais lento que o normal — é o que faz o chef escorregar
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
  // ladrão
  heistAlarm: 10, // segundos pra pará-lo depois que ele entra
  heistEnter: 0.9, // tempo da animação de porta abrindo
  heistStun: 1.6, // quanto tempo ele fica desacordado
  heistSpeed: 2.6, // tiles/s — mais lento que o chef, mas erra o caminho
  heistBatRange: 1.15,
  heistReward: 15,
} as const;
