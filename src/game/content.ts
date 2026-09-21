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
};

/*
 Legenda do mapa
 .  chão          ~  chão que abre     (espaço) vazio
 #  bancada       K  tábua de corte    S  fogão com panela   F  fogão com frigideira
 W  entrega       R  volta dos pratos  X  lixo               Z  pia        D  escorredor
 P  bancada com prato limpo            E  bancada com extintor
 T O L M B  caixas de tomate, cebola, alface, carne, pão
 1 2  onde os chefs começam
*/
export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Sopa na Serra',
    subtitle: 'Picar, cozinhar, servir. Não deixe a panela pegar fogo.',
    map: [
      '##KK##WW##TTOO',
      '#............#',
      'S............#',
      'S...1....2...P',
      'S....####....P',
      '#....####....#',
      '#............P',
      'X............R',
      '###KK###E#####',
    ],
    recipes: ['soup_tomato', 'soup_onion'],
    duration: 180,
    dirtyPlates: false,
    stars: [60, 140, 220],
    floor: ['#e9dcc4', '#e0d0b4'],
    wall: '#8a5a3b',
  },
  {
    id: 2,
    name: 'Lanchonete do Porto',
    subtitle: 'Hambúrguer na chapa e pratos sujos voltando. Alguém lava!',
    map: [
      '#LL#BB#MM#WW##',
      'T............R',
      'K....#..#....#',
      'K..1.#..#.2..Z',
      '#....#..#....D',
      'F....#..#....#',
      'F............E',
      '#............X',
      '##KK##PP######',
    ],
    recipes: ['burger', 'burger_full', 'salad', 'salad_green'],
    duration: 200,
    dirtyPlates: true,
    stars: [60, 150, 240],
    floor: ['#d7e6ea', '#c9dbe0'],
    wall: '#3f6b7a',
  },
  {
    id: 3,
    name: 'Cozinha Rachada',
    subtitle: 'O chão se abre no meio. Joguem os ingredientes por cima do buraco!',
    map: [
      '#TT#MM##BB#WW#',
      'K.....~~.....R',
      'K..1..~~..2..#',
      '#.....~~.....Z',
      'S..#..~~..#..D',
      'S.....~~.....#',
      'F.....~~.....L',
      'F.....~~.....X',
      '##E#KK##PP#K##',
    ],
    recipes: ['soup_tomato', 'burger', 'salad'],
    duration: 210,
    dirtyPlates: true,
    stars: [50, 130, 210],
    gap: { closed: 16, warn: 3, open: 11 },
    floor: ['#f0d9d2', '#e6cbc2'],
    wall: '#7a3f4a',
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
