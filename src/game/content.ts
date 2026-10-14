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
