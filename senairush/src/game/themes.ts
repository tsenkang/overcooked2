import type { ThemeId } from './tracks'

/**
 * Look of a circuit: road paint, sky, terrain, water and lighting. Props (cacti, pines, neon
 * towers…) are chosen by `id` in scenery.ts; everything here is plain colours and numbers.
 */
export type Theme = {
  id: ThemeId
  road: {
    asphalt: string
    patch: string
    lane: string
    kerbA: string
    kerbB: string
    shoulder: string
    sprinkles: string[]
    shortcut: string
    shortcutSlow: string
    slick: string
  }
  sky: { top: [number, number, number]; mid: [number, number, number]; horizon: [number, number, number]; fog: string; fogNear: number; fogFar: number; clouds: string | null }
  light: { sun: string; sunIntensity: number; hemiSky: string; hemiGround: string; hemiIntensity: number }
  terrain: { a: string; b: string; high: string; low: string; shore: string; peak: string; rim: number }
  water: { color: string; emissive: string; glow: number }
  /** Text on the start banner and the landmark gate. */
  banner: string
  gate: { label: string; pillar: string; beam: string; badge: string }
  railA: string
  railB: string
}

export const THEMES: Record<ThemeId, Theme> = {
  campus: {
    id: 'campus',
    road: { asphalt: '#3f5668', patch: '#2f4354', lane: '#f7f9fb', kerbA: '#e30613', kerbB: '#ffc400', shoulder: '#9db4c4', sprinkles: ['#e30613', '#ffc400', '#2b9de9', '#ffffff', '#00a99d'], shortcut: '#8aa3b5', shortcutSlow: '#c4dce9', slick: '#7fd3ff' },
    sky: { top: [0.16, 0.36, 0.58], mid: [0.48, 0.68, 0.8], horizon: [0.9, 0.95, 0.98], fog: '#a8c2d4', fogNear: 190, fogFar: 640, clouds: '#f3f8fb' },
    light: { sun: '#fff2cf', sunIntensity: 2.75, hemiSky: '#eef7ff', hemiGround: '#5f7589', hemiIntensity: 0.95 },
    terrain: { a: '#6f8f87', b: '#8fb59f', high: '#7fa6bb', low: '#667f9a', shore: '#b9c9d1', peak: '#e6eef4', rim: 26 },
    water: { color: '#2b9de9', emissive: '#176da9', glow: 0.25 },
    banner: 'SENAI RUSH · CAMPUS',
    gate: { label: 'SENAI POMPÉIA', pillar: '#1e4d6b', beam: '#e30613', badge: '#ffc400' },
    railA: '#e30613',
    railB: '#ffc400',
  },
  desert: {
    id: 'desert',
    road: { asphalt: '#5b4a42', patch: '#4b3b34', lane: '#fff4d6', kerbA: '#d94f2b', kerbB: '#f7e3b5', shoulder: '#e0b77f', sprinkles: ['#c2734a', '#f2d29b', '#8a5a3c', '#ffffff'], shortcut: '#c8955e', shortcutSlow: '#b07a45', slick: '#2e2230' },
    sky: { top: [0.18, 0.42, 0.72], mid: [0.62, 0.72, 0.82], horizon: [1.0, 0.86, 0.62], fog: '#e8c79a', fogNear: 200, fogFar: 700, clouds: '#fff6e8' },
    light: { sun: '#ffe2b0', sunIntensity: 3.2, hemiSky: '#fff1d6', hemiGround: '#a86b42', hemiIntensity: 0.9 },
    terrain: { a: '#d9a066', b: '#e8bb7d', high: '#c2734a', low: '#b88a5a', shore: '#f0d3a2', peak: '#a35a3a', rim: 34 },
    water: { color: '#3cc6c9', emissive: '#1b8a8c', glow: 0.25 },
    banner: 'RALI DO CACTO',
    gate: { label: 'CÂNION DO SOL', pillar: '#a35a3a', beam: '#d94f2b', badge: '#f7e3b5' },
    railA: '#d94f2b',
    railB: '#f7e3b5',
  },
  snow: {
    id: 'snow',
    road: { asphalt: '#4d5b6e', patch: '#3e4a5a', lane: '#ffffff', kerbA: '#2b7bd9', kerbB: '#ffffff', shoulder: '#e9f2fa', sprinkles: ['#ffffff', '#cfe6f5', '#9ec9ea'], shortcut: '#cfe6f5', shortcutSlow: '#e6f4fb', slick: '#bfefff' },
    sky: { top: [0.2, 0.42, 0.68], mid: [0.62, 0.78, 0.9], horizon: [0.94, 0.97, 1.0], fog: '#dbe8f2', fogNear: 170, fogFar: 600, clouds: '#ffffff' },
    light: { sun: '#ffffff', sunIntensity: 2.4, hemiSky: '#f4fbff', hemiGround: '#8aa0b5', hemiIntensity: 1.05 },
    terrain: { a: '#eef4f8', b: '#dfe9f1', high: '#8794a3', low: '#c8d8e6', shore: '#d7e7f2', peak: '#ffffff', rim: 48 },
    water: { color: '#8fd8f0', emissive: '#4fa8c8', glow: 0.2 },
    banner: 'COPA DA NEVE',
    gate: { label: 'PICO GELADO', pillar: '#2b4e7a', beam: '#2b7bd9', badge: '#ffffff' },
    railA: '#2b7bd9',
    railB: '#ffffff',
  },
  candy: {
    id: 'candy',
    road: { asphalt: '#6b3f5c', patch: '#5a3450', lane: '#fff0fa', kerbA: '#ff5fa2', kerbB: '#ffffff', shoulder: '#ffd1ec', sprinkles: ['#ff5fa2', '#7fe0ff', '#ffe066', '#b58cff', '#6ff0b0', '#ffffff'], shortcut: '#c8956a', shortcutSlow: '#ffe9f4', slick: '#ff8ad0' },
    sky: { top: [0.55, 0.45, 0.85], mid: [0.95, 0.72, 0.88], horizon: [1.0, 0.92, 0.95], fog: '#ffd9ef', fogNear: 180, fogFar: 620, clouds: '#ffffff' },
    light: { sun: '#fff3f9', sunIntensity: 2.6, hemiSky: '#fff0fa', hemiGround: '#c48bb8', hemiIntensity: 1.0 },
    terrain: { a: '#9ee6c8', b: '#ffc2e2', high: '#c9a7ff', low: '#ffe3f1', shore: '#fff2d9', peak: '#ffffff', rim: 22 },
    water: { color: '#ff8fcf', emissive: '#d0428f', glow: 0.35 },
    banner: 'GRANDE PRÊMIO DOCE',
    gate: { label: 'VALE DOCE', pillar: '#ff5fa2', beam: '#7fe0ff', badge: '#ffe066' },
    railA: '#ff5fa2',
    railB: '#ffffff',
  },
  neon: {
    id: 'neon',
    road: { asphalt: '#262838', patch: '#1d1f2c', lane: '#fef6a8', kerbA: '#ff2bd6', kerbB: '#2bf3ff', shoulder: '#3a3d55', sprinkles: ['#ff2bd6', '#2bf3ff', '#fef6a8', '#7b5cff'], shortcut: '#34364d', shortcutSlow: '#4d3a6b', slick: '#7b5cff' },
    sky: { top: [0.02, 0.02, 0.08], mid: [0.1, 0.05, 0.22], horizon: [0.42, 0.12, 0.38], fog: '#1b1030', fogNear: 120, fogFar: 520, clouds: null },
    light: { sun: '#b8a6ff', sunIntensity: 1.1, hemiSky: '#8f80ff', hemiGround: '#1a1626', hemiIntensity: 0.75 },
    terrain: { a: '#2a2c3d', b: '#33364a', high: '#3d2f55', low: '#202233', shore: '#2c2e40', peak: '#4b3f6b', rim: 14 },
    water: { color: '#2b4bff', emissive: '#2b4bff', glow: 0.9 },
    banner: 'AVENIDA NEON',
    gate: { label: 'NEON CITY', pillar: '#1d1f2c', beam: '#ff2bd6', badge: '#2bf3ff' },
    railA: '#ff2bd6',
    railB: '#2bf3ff',
  },
  volcano: {
    id: 'volcano',
    road: { asphalt: '#3d3438', patch: '#2f272b', lane: '#ffb347', kerbA: '#ff3b1f', kerbB: '#2b2326', shoulder: '#4a3c3a', sprinkles: ['#ff6a2b', '#ffb347', '#2b2326'], shortcut: '#5a463f', shortcutSlow: '#3a2f2c', slick: '#ff6a2b' },
    sky: { top: [0.16, 0.05, 0.06], mid: [0.5, 0.18, 0.12], horizon: [0.95, 0.5, 0.25], fog: '#5a2c26', fogNear: 150, fogFar: 560, clouds: '#3a2a2a' },
    light: { sun: '#ffb38a', sunIntensity: 2.0, hemiSky: '#ffcdb0', hemiGround: '#3a1a14', hemiIntensity: 0.8 },
    terrain: { a: '#3a3236', b: '#4a3f42', high: '#5c4a46', low: '#2a2224', shore: '#1f1a1c', peak: '#6e5a54', rim: 40 },
    water: { color: '#ff5a1f', emissive: '#ff3b00', glow: 1.4 },
    banner: 'FORNALHA GP',
    gate: { label: 'VULCÃO FERVENTE', pillar: '#2b2326', beam: '#ff3b1f', badge: '#ffb347' },
    railA: '#ff3b1f',
    railB: '#2b2326',
  },
}
