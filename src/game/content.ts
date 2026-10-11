import type { FoodId, LevelDef, Recipe, RecipeId } from './types';

export const FOOD_NAME: Record<FoodId, string> = {
  tomato: 'Tomate',
  onion: 'Cebola',
  lettuce: 'Alface',
  meat: 'Carne',
  bun: 'Pão',
};

export const CHOPPABLE: FoodId[] = ['tomato', 'onion', 'lettuce', 'meat'];

export const RECIPES: Record<RecipeId, Recipe> = {
  soup_tomato: {
    id: 'soup_tomato',
    name: 'Sopa de Tomate',
    parts: ['soup:tomato'],
    value: 20,
    time: 85,
    steps: [
      { f: 'tomato', tool: 'pot' },
      { f: 'tomato', tool: 'pot' },
      { f: 'tomato', tool: 'pot' },
    ],
  },
  soup_onion: {
    id: 'soup_onion',
    name: 'Sopa de Cebola',
    parts: ['soup:onion'],
    value: 20,
    time: 85,
    steps: [
      { f: 'onion', tool: 'pot' },
      { f: 'onion', tool: 'pot' },
      { f: 'onion', tool: 'pot' },
    ],
  },
  salad_green: {
    id: 'salad_green',
    name: 'Salada Verde',
    parts: ['lettuce:chopped'],
    value: 12,
    time: 55,
    steps: [{ f: 'lettuce', tool: 'knife' }],
  },
  salad: {
    id: 'salad',
    name: 'Salada Mista',
    parts: ['lettuce:chopped', 'tomato:chopped'],
    value: 18,
    time: 65,
    steps: [
      { f: 'lettuce', tool: 'knife' },
      { f: 'tomato', tool: 'knife' },
    ],
  },
  burger: {
    id: 'burger',
    name: 'Hambúrguer',
    parts: ['bun:raw', 'meat:cooked'],
    value: 22,
    time: 80,
    steps: [
      { f: 'bun', tool: 'none' },
      { f: 'meat', tool: 'pan' },
    ],
  },
  burger_full: {
    id: 'burger_full',
    name: 'X-Salada',
    parts: ['bun:raw', 'lettuce:chopped', 'meat:cooked'],
    value: 30,
    time: 95,
    steps: [
      { f: 'bun', tool: 'none' },
      { f: 'meat', tool: 'pan' },
      { f: 'lettuce', tool: 'knife' },
    ],
  },
  soup_mixed: {
    id: 'soup_mixed',
    name: 'Sopa Mista',
    parts: ['soup:mixed'],
    value: 26,
    time: 90,
    steps: [
      { f: 'tomato', tool: 'pot' },
      { f: 'tomato', tool: 'pot' },
      { f: 'onion', tool: 'pot' },
    ],
  },
  salad_full: {
    id: 'salad_full',
    name: 'Salada Completa',
    parts: ['lettuce:chopped', 'tomato:chopped', 'onion:chopped'],
    value: 24,
    time: 70,
    steps: [
      { f: 'lettuce', tool: 'knife' },
      { f: 'tomato', tool: 'knife' },
      { f: 'onion', tool: 'knife' },
    ],
  },
  sandwich_veggie: {
    id: 'sandwich_veggie',
    name: 'Sanduíche Verde',
    parts: ['bun:raw', 'lettuce:chopped', 'tomato:chopped'],
    value: 20,
    time: 65,
    steps: [
      { f: 'bun', tool: 'none' },
      { f: 'lettuce', tool: 'knife' },
      { f: 'tomato', tool: 'knife' },
    ],
  },
  burger_onion: {
    id: 'burger_onion',
    name: 'X-Cebola',
    parts: ['bun:raw', 'meat:cooked', 'onion:chopped'],
    value: 26,
    time: 85,
    steps: [
      { f: 'bun', tool: 'none' },
      { f: 'meat', tool: 'pan' },
      { f: 'onion', tool: 'knife' },
    ],
  },
  burger_deluxe: {
    id: 'burger_deluxe',
    name: 'X-Tudo',
    parts: ['bun:raw', 'meat:cooked', 'lettuce:chopped', 'tomato:chopped', 'onion:chopped'],
    value: 38,
    time: 110,
    steps: [
      { f: 'bun', tool: 'none' },
      { f: 'meat', tool: 'pan' },
      { f: 'lettuce', tool: 'knife' },
      { f: 'tomato', tool: 'knife' },
      { f: 'onion', tool: 'knife' },
    ],
  },
};

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Sopa na Serra',
    subtitle: 'Picar, cozinhar, servir. Não deixe a panela pegar fogo.',
    recipes: ['soup_tomato', 'soup_onion'],
    duration: 180,
    dirtyPlates: false,
    stars: [60, 140, 220],
  },
  {
    id: 2,
    name: 'Lanchonete do Porto',
    subtitle: 'Hambúrguer na chapa e pratos sujos voltando. Alguém lava!',
    recipes: ['burger', 'burger_full', 'salad', 'salad_green'],
    duration: 200,
    dirtyPlates: true,
    stars: [60, 150, 240],
  },
  {
    id: 3,
    name: 'Cozinha Rachada',
    subtitle: 'O chão se abre no meio. Joguem os ingredientes por cima do buraco!',
    recipes: ['soup_tomato', 'burger', 'salad'],
    duration: 210,
    dirtyPlates: true,
    stars: [50, 130, 210],
    gap: { closed: 16, warn: 3, open: 11 },
  },
  {
    id: 4,
    name: 'Fim de Semana Lotado',
    subtitle: 'Pedido atrás de pedido, pratos sempre sujos — e o chão ainda racha.',
    recipes: ['soup_mixed', 'salad_full', 'burger_deluxe', 'sandwich_veggie', 'burger_onion'],
    duration: 220,
    dirtyPlates: true,
    stars: [70, 170, 270],
    gap: { closed: 13, warn: 3, open: 9 },
  },
  {
    id: 5,
    name: 'Assalto na Cozinha',
    subtitle: 'Um ladrão vai tentar levar uma panela. Peguem o taco e nocauteiem ele!',
    recipes: ['soup_tomato', 'soup_onion', 'salad', 'burger'],
    duration: 220,
    dirtyPlates: true,
    stars: [70, 160, 250],
    heist: { minGap: 22, maxGap: 42, maxThefts: 3 },
  },

  // ── Mundo 2: Correria (ritmo de pedidos mais apertado) ──────────────────
  {
    id: 6,
    name: 'Hora do Rush',
    subtitle: 'Os pedidos chegam bem mais rápido. Não dá pra parar de picar.',
    recipes: ['soup_tomato', 'soup_onion', 'salad', 'burger'],
    duration: 170,
    dirtyPlates: false,
    stars: [65, 150, 235],
    rush: 1.3,
  },
  {
    id: 7,
    name: 'Fila na Porta',
    subtitle: 'Ritmo acelerado e os pratos ainda voltam sujos.',
    recipes: ['burger', 'burger_full', 'salad', 'salad_green', 'soup_mixed'],
    duration: 190,
    dirtyPlates: true,
    stars: [70, 165, 260],
    rush: 1.25,
  },
  {
    id: 8,
    name: 'Maratona do Prato Sujo',
    subtitle: 'Cardápio maior, pia sempre cheia, tempo sempre curto.',
    recipes: ['salad_full', 'sandwich_veggie', 'burger_onion', 'soup_mixed'],
    duration: 200,
    dirtyPlates: true,
    stars: [75, 175, 275],
    rush: 1.2,
  },
  {
    id: 9,
    name: 'Sexta à Noite',
    subtitle: 'O cardápio inteiro e ninguém espera.',
    recipes: ['soup_tomato', 'soup_onion', 'soup_mixed', 'salad', 'burger', 'burger_full'],
    duration: 200,
    dirtyPlates: true,
    stars: [80, 185, 290],
    rush: 1.5,
  },
  {
    id: 10,
    name: 'Cozinha Não Para',
    subtitle: 'O teste final da correria: cardápio grande e ritmo nos limites.',
    recipes: ['soup_mixed', 'salad_full', 'sandwich_veggie', 'burger_onion', 'burger_deluxe'],
    duration: 210,
    dirtyPlates: true,
    stars: [85, 195, 305],
    rush: 1.4,
  },

  // ── Mundo 3: Chão Instável (a fenda fica mais rápida e mais presente) ───
  {
    id: 11,
    name: 'Rachadura Fresca',
    subtitle: 'O chão volta a se abrir — dessa vez logo de cara.',
    recipes: ['soup_tomato', 'salad', 'burger'],
    duration: 190,
    dirtyPlates: false,
    stars: [60, 140, 220],
    gap: { closed: 18, warn: 3, open: 10 },
  },
  {
    id: 12,
    name: 'Tremor na Cozinha',
    subtitle: 'Fenda mais frequente e os pratos voltam sujos de novo.',
    recipes: ['soup_mixed', 'salad_full', 'burger_full'],
    duration: 200,
    dirtyPlates: true,
    stars: [70, 160, 250],
    gap: { closed: 15, warn: 3, open: 10 },
  },
  {
    id: 13,
    name: 'Abismo Raso',
    subtitle: 'O buraco abre quase toda hora. Joguem por cima sem parar de cozinhar.',
    recipes: ['sandwich_veggie', 'burger_onion', 'salad_full', 'soup_onion'],
    duration: 210,
    dirtyPlates: true,
    stars: [75, 175, 270],
    gap: { closed: 12, warn: 2.5, open: 9 },
    rush: 1.15,
  },
  {
    id: 14,
    name: 'Fenda Dupla',
    subtitle: 'Mal fecha e já racha de novo.',
    recipes: ['soup_tomato', 'soup_mixed', 'burger', 'burger_onion', 'salad'],
    duration: 210,
    dirtyPlates: true,
    stars: [80, 185, 290],
    gap: { closed: 10, warn: 2.5, open: 8 },
  },
  {
    id: 15,
    name: 'Chão de Vidro',
    subtitle: 'A fenda mais implacável da cozinha — e o ritmo não ajuda.',
    recipes: ['soup_mixed', 'salad_full', 'burger_full', 'sandwich_veggie'],
    duration: 220,
    dirtyPlates: true,
    stars: [85, 195, 305],
    gap: { closed: 9, warn: 2, open: 8 },
    rush: 1.2,
  },

  // ── Mundo 4: Gelo na Cozinha (piso escorregadio, cada vez maior) ────────
  {
    id: 16,
    name: 'Primeira Geada',
    subtitle: 'Uma poça de gelo aparece no meio da cozinha. Cuidado pra não escorregar no fogo.',
    recipes: ['soup_tomato', 'soup_onion', 'salad', 'burger'],
    duration: 190,
    dirtyPlates: false,
    stars: [60, 145, 225],
    ice: 4,
  },
  {
    id: 17,
    name: 'Pista Escorregadia',
    subtitle: 'Gelo maior, pratos sujos — ande com calma até acostumar.',
    recipes: ['burger', 'burger_full', 'salad_full', 'soup_mixed'],
    duration: 200,
    dirtyPlates: true,
    stars: [70, 160, 250],
    ice: 6,
  },
  {
    id: 18,
    name: 'Gelo Fino',
    subtitle: 'Mais gelo, mais pedidos — e o chão continua traiçoeiro.',
    recipes: ['sandwich_veggie', 'burger_onion', 'soup_mixed', 'salad_full'],
    duration: 210,
    dirtyPlates: true,
    stars: [75, 175, 270],
    ice: 8,
    rush: 1.15,
  },
  {
    id: 19,
    name: 'Patinação Livre',
    subtitle: 'Boa parte da cozinha virou pista de gelo.',
    recipes: ['soup_tomato', 'soup_mixed', 'burger', 'burger_full', 'salad'],
    duration: 210,
    dirtyPlates: true,
    stars: [80, 185, 290],
    ice: 10,
    rush: 1.2,
  },
  {
    id: 20,
    name: 'Congelante',
    subtitle: 'O teste final do gelo: poça enorme, cardápio cheio, ritmo apertado.',
    recipes: ['soup_mixed', 'salad_full', 'sandwich_veggie', 'burger_onion', 'burger_deluxe'],
    duration: 220,
    dirtyPlates: true,
    stars: [85, 195, 305],
    ice: 12,
    rush: 1.25,
  },

  // ── Mundo 5: Assaltos (o ladrão volta, cada vez mais folgado) ───────────
  {
    id: 21,
    name: 'Visita Inesperada',
    subtitle: 'O ladrão aparece de novo — um pouco mais cedo dessa vez.',
    recipes: ['soup_tomato', 'soup_onion', 'salad', 'burger'],
    duration: 200,
    dirtyPlates: false,
    stars: [65, 150, 235],
    heist: { minGap: 20, maxGap: 36, maxThefts: 2 },
  },
  {
    id: 22,
    name: 'Ladrão Folgado',
    subtitle: 'Ele volta mais vezes, e os pratos ainda voltam sujos.',
    recipes: ['burger', 'burger_full', 'salad_full', 'soup_mixed'],
    duration: 210,
    dirtyPlates: true,
    stars: [75, 165, 255],
    heist: { minGap: 18, maxGap: 32, maxThefts: 3 },
  },
  {
    id: 23,
    name: 'Gangue do Taco',
    subtitle: 'Visitas frequentes e o ritmo dos pedidos também aperta.',
    recipes: ['sandwich_veggie', 'burger_onion', 'soup_mixed', 'salad_full'],
    duration: 220,
    dirtyPlates: true,
    stars: [80, 175, 270],
    heist: { minGap: 16, maxGap: 28, maxThefts: 3 },
    rush: 1.1,
  },
  {
    id: 24,
    name: 'Reincidente',
    subtitle: 'Ele não aprende. Fiquem de olho no taco o tempo todo.',
    recipes: ['soup_tomato', 'soup_mixed', 'burger', 'burger_onion', 'salad'],
    duration: 230,
    dirtyPlates: true,
    stars: [85, 185, 285],
    heist: { minGap: 14, maxGap: 26, maxThefts: 4 },
  },
  {
    id: 25,
    name: 'Lenda do Taco de Ouro',
    subtitle: 'O ladrão mais ousado até aqui — quase não dá descanso.',
    recipes: ['soup_mixed', 'salad_full', 'burger_full', 'sandwich_veggie', 'burger_onion'],
    duration: 240,
    dirtyPlates: true,
    stars: [90, 200, 310],
    heist: { minGap: 12, maxGap: 24, maxThefts: 4 },
    rush: 1.15,
  },

  // ── Mundo 6: Mestre Cuca (duas mecânicas de uma vez — e a final com tudo) ──
  {
    id: 26,
    name: 'Gelo e Correria',
    subtitle: 'Piso escorregadio com os pedidos no talo.',
    recipes: ['soup_tomato', 'soup_mixed', 'burger', 'burger_full', 'salad_full'],
    duration: 220,
    dirtyPlates: true,
    stars: [90, 200, 310],
    ice: 8,
    rush: 1.2,
  },
  {
    id: 27,
    name: 'Fenda Congelada',
    subtitle: 'O chão racha E escorrega. Cada passo conta.',
    recipes: ['sandwich_veggie', 'burger_onion', 'salad_full', 'soup_mixed'],
    duration: 230,
    dirtyPlates: true,
    stars: [95, 210, 325],
    gap: { closed: 14, warn: 3, open: 9 },
    ice: 6,
  },
  {
    id: 28,
    name: 'Ladrão no Gelo',
    subtitle: 'Ele também escorrega — mas conta com isso pra despistar.',
    recipes: ['burger', 'burger_full', 'soup_mixed', 'salad_full'],
    duration: 230,
    dirtyPlates: true,
    stars: [95, 215, 330],
    heist: { minGap: 16, maxGap: 30, maxThefts: 3 },
    ice: 6,
  },
  {
    id: 29,
    name: 'Assalto na Rachadura',
    subtitle: 'O ladrão invade bem na hora em que o chão abre.',
    recipes: ['soup_mixed', 'salad_full', 'burger_onion', 'sandwich_veggie'],
    duration: 240,
    dirtyPlates: true,
    stars: [100, 220, 340],
    heist: { minGap: 16, maxGap: 28, maxThefts: 3 },
    gap: { closed: 14, warn: 3, open: 9 },
    rush: 1.1,
  },
  {
    id: 30,
    name: 'O Grande Banquete',
    subtitle: 'A fase final: fenda, gelo, ladrão e o cardápio inteiro, tudo junto.',
    recipes: [
      'soup_tomato', 'soup_onion', 'soup_mixed', 'salad_green', 'salad', 'salad_full',
      'sandwich_veggie', 'burger', 'burger_onion', 'burger_full', 'burger_deluxe',
    ],
    duration: 260,
    dirtyPlates: true,
    stars: [110, 240, 370],
    gap: { closed: 16, warn: 3, open: 8 },
    heist: { minGap: 20, maxGap: 36, maxThefts: 3 },
    ice: 6,
    rush: 1.15,
  },
];

export function partOf(f: FoodId, s: string): string {
  return `${f}:${s}`;
}

function isSubMultiset(small: string[], big: string[]): boolean {
  const pool = [...big];
  for (const s of small) {
    const i = pool.indexOf(s);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

export function canAddPart(parts: string[], part: string, recipes: RecipeId[]): boolean {
  const next = [...parts, part];
  return recipes.some((r) => isSubMultiset(next, RECIPES[r].parts));
}

export function matchRecipe(parts: string[], recipes: RecipeId[]): RecipeId | null {
  const key = [...parts].sort().join('|');
  for (const r of recipes) {
    if ([...RECIPES[r].parts].sort().join('|') === key) return r;
  }
  return null;
}

// ─── Modos fora da campanha ─────────────────────────────────────────────────
// id fora da faixa 1-30 de propósito: nunca colide com o progresso salvo da
// campanha (que é indexado por level.id).
export const ZEN_LEVEL: LevelDef = {
  id: 0,
  name: 'Modo Livre',
  subtitle: 'Sem relógio apertando, sem fase pra travar — só cozinhar.',
  recipes: Object.keys(RECIPES) as RecipeId[],
  duration: 3600,
  dirtyPlates: true,
  stars: [1_000_000, 2_000_000, 3_000_000], // nunca dá estrela de verdade — não é campanha
};

export const SURVIVAL_LEVEL: LevelDef = {
  id: -1,
  name: 'Sobrevivência',
  subtitle: 'Sem cronômetro — o ritmo só aumenta. Perca 3 pedidos e acabou.',
  recipes: Object.keys(RECIPES) as RecipeId[],
  duration: 0, // não usado: o tempo conta pra cima, não pra baixo
  dirtyPlates: true,
  stars: [1_000_000, 2_000_000, 3_000_000], // idem — a nota aqui é o tempo sobrevivido, não estrela
  endless: { maxStrikes: 3 },
};

// ─── Mundos (só agrupa a campanha no menu — não afeta a lógica da fase) ────
export interface World {
  name: string;
  tagline: string;
  from: number;
  to: number;
}

export const WORLDS: World[] = [
  { name: 'Primeiros Pratos', tagline: 'O começo de tudo — sopa, fogo, pratos sujos e a primeira fenda.', from: 1, to: 5 },
  { name: 'Correria', tagline: 'O ritmo dos pedidos aperta.', from: 6, to: 10 },
  { name: 'Chão Instável', tagline: 'A fenda some e volta cada vez mais rápido.', from: 11, to: 15 },
  { name: 'Gelo na Cozinha', tagline: 'Pisos escorregadios por toda parte.', from: 16, to: 20 },
  { name: 'Assaltos', tagline: 'O ladrão não dá sossego.', from: 21, to: 25 },
  { name: 'Mestre Cuca', tagline: 'Duas mecânicas de cada vez — e o banquete final.', from: 26, to: 30 },
];

export function worldOf(levelId: number): number {
  const i = WORLDS.findIndex((w) => levelId >= w.from && levelId <= w.to);
  return i < 0 ? 0 : i;
}
