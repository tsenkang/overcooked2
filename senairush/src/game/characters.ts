import type { Stats } from './config'

export type Species = 'hamster' | 'hedgehog' | 'sloth' | 'redpanda' | 'bunny' | 'frog' | 'tavares' | 'isaac' | 'lebron'

export type Character = {
  id: Species
  /** i18n keys: `char.<id>.name`, `char.<id>.species`, `char.<id>.blurb`. */
  stats: Stats
  fur: string
  furDark: string
  belly: string
  kart: string
  kartAccent: string
  /** Minimap / UI accent. */
  ui: string
}

/** The racers. Stats always sum to 13 so nobody is strictly better. */
export const ROSTER: Character[] = [
  { id: 'hamster', stats: { speed: 3, accel: 4, handling: 3, weight: 3 }, fur: '#f5a54a', furDark: '#c9772e', belly: '#fff1d6', kart: '#ff5f8f', kartAccent: '#ffe066', ui: '#ff7aa2' },
  { id: 'hedgehog', stats: { speed: 3, accel: 3, handling: 5, weight: 2 }, fur: '#a5714d', furDark: '#5b3a2a', belly: '#f7dcb8', kart: '#3fc4a8', kartAccent: '#fff4c8', ui: '#43d1b1' },
  { id: 'sloth', stats: { speed: 5, accel: 1, handling: 3, weight: 4 }, fur: '#9d8b76', furDark: '#5d4f43', belly: '#e9dcc6', kart: '#8a6cf0', kartAccent: '#ffd35c', ui: '#9b82ff' },
  { id: 'redpanda', stats: { speed: 4, accel: 3, handling: 2, weight: 4 }, fur: '#d9612f', furDark: '#6e2a1a', belly: '#fff3e6', kart: '#ffb020', kartAccent: '#ff5d5d', ui: '#ffa53a' },
  { id: 'bunny', stats: { speed: 2, accel: 5, handling: 4, weight: 2 }, fur: '#f7f1f5', furDark: '#d9c6d3', belly: '#ffd6e6', kart: '#6ec8ff', kartAccent: '#ff8fc7', ui: '#6ec8ff' },
  { id: 'frog', stats: { speed: 3, accel: 2, handling: 3, weight: 5 }, fur: '#6fcf5a', furDark: '#3c8f3a', belly: '#f4f19a', kart: '#ff7a45', kartAccent: '#7ef0ff', ui: '#8be06e' },
  { id: 'tavares', stats: { speed: 4, accel: 4, handling: 1, weight: 4 }, fur: '#2f9e6b', furDark: '#1c5e40', belly: '#e8f7ee', kart: '#1fae74', kartAccent: '#ffe14d', ui: '#3cc98a' },
  { id: 'isaac', stats: { speed: 2, accel: 3, handling: 5, weight: 3 }, fur: '#3a6fd8', furDark: '#203f80', belly: '#e6eeff', kart: '#2f6bff', kartAccent: '#ffffff', ui: '#5b8cff' },
  { id: 'lebron', stats: { speed: 3, accel: 5, handling: 2, weight: 3 }, fur: '#6a3fb5', furDark: '#3b2266', belly: '#f3e9ff', kart: '#552583', kartAccent: '#fdb927', ui: '#9a6be0' },
]

export function characterById(id: string): Character {
  return ROSTER.find(c => c.id === id) ?? ROSTER[0]
}
