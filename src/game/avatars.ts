import type { Avatar, HatId } from './types';

/** Cores do uniforme. */
export const BODY_COLORS = [
  '#2f7de1', '#ef5a3c', '#22a06b', '#f0a132',
  '#8b5cf6', '#e0509a', '#14b8c4', '#4b5563',
];

/** Cor do chapéu / detalhe. */
export const ACCENT_COLORS = [
  '#ffd23f', '#7ee0c3', '#ff8fab', '#ffffff',
  '#111827', '#f97316', '#a3e635', '#60a5fa',
];

/** Tons de pele. */
export const SKIN_TONES = ['#ffd9b3', '#f0bb8b', '#d79a64', '#b3713f', '#8a5326', '#5c3418'];

export const HATS: { id: HatId; label: string }[] = [
  { id: 'toque', label: 'Chapéu de chef' },
  { id: 'bandana', label: 'Bandana' },
  { id: 'cap', label: 'Boné' },
  { id: 'beanie', label: 'Gorro' },
  { id: 'crown', label: 'Coroa' },
  { id: 'none', label: 'Sem chapéu' },
];

export const DEFAULT_AVATARS: [Avatar, Avatar] = [
  { name: 'Chef 1', body: '#2f7de1', accent: '#ffd23f', skin: '#ffd9b3', hat: 'toque' },
  { name: 'Chef 2', body: '#ef5a3c', accent: '#7ee0c3', skin: '#d79a64', hat: 'bandana' },
];

/** Iniciante usado na bolinha acima do chef. */
export function avatarLabel(av: Avatar, id: number): string {
  const c = av.name.trim()[0];
  return c ? c.toUpperCase() : String(id);
}

const HAT_IDS = new Set(HATS.map((h) => h.id));
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Saneia o que veio do localStorage — o save é editável pelo usuário. */
export function sanitizeAvatar(raw: unknown, fallback: Avatar): Avatar {
  const o = (raw ?? {}) as Partial<Avatar>;
  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 14) : fallback.name,
    body: isHex(o.body) ? o.body : fallback.body,
    accent: isHex(o.accent) ? o.accent : fallback.accent,
    skin: isHex(o.skin) ? o.skin : fallback.skin,
    hat: o.hat && HAT_IDS.has(o.hat) ? o.hat : fallback.hat,
  };
}
