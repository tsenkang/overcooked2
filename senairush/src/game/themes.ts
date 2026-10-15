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
  /** No ground at all: the road floats (space, sky). */
  floating?: boolean
  /** Rainbow-striped road surface. */
  rainbow?: boolean
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
  rainbow: {
    id: 'rainbow',
    road: { asphalt: '#2a1650', patch: '#2a1650', lane: '#ffffff', kerbA: '#ffffff', kerbB: '#7b5cff', shoulder: '#1a0f3a', sprinkles: ['#ffffff', '#ffe066', '#7fe0ff'], shortcut: '#3a2a7a', shortcutSlow: '#5a3aa0', slick: '#7fe0ff' },
    sky: { top: [0.0, 0.0, 0.02], mid: [0.04, 0.02, 0.12], horizon: [0.2, 0.08, 0.36], fog: '#120a2a', fogNear: 320, fogFar: 1200, clouds: null },
    light: { sun: '#ffffff', sunIntensity: 1.7, hemiSky: '#b0a4ff', hemiGround: '#1a1033', hemiIntensity: 1.0 },
    terrain: { a: '#120a2a', b: '#120a2a', high: '#120a2a', low: '#120a2a', shore: '#120a2a', peak: '#120a2a', rim: 0 },
    water: { color: '#7fe0ff', emissive: '#7fe0ff', glow: 1 },
    banner: 'ESTRADA ARCO-ÍRIS',
    gate: { label: 'ESTRADA ARCO-ÍRIS', pillar: '#7b5cff', beam: '#ff5fa2', badge: '#ffe066' },
    railA: '#ff5fa2',
    railB: '#7fe0ff',
    floating: true,
    rainbow: true,
  },
  haunted: {
    id: 'haunted',
    road: { asphalt: '#3a3540', patch: '#2b2731', lane: '#c8ffb0', kerbA: '#7b3fa0', kerbB: '#2b2731', shoulder: '#3d4a3a', sprinkles: ['#7bff9a', '#b18cff', '#ff9f3a'], shortcut: '#4a3d2e', shortcutSlow: '#3a2f24', slick: '#7bff9a' },
    sky: { top: [0.03, 0.02, 0.07], mid: [0.15, 0.08, 0.22], horizon: [0.36, 0.26, 0.42], fog: '#2a2238', fogNear: 90, fogFar: 430, clouds: '#4a4058' },
    light: { sun: '#c9b8ff', sunIntensity: 1.1, hemiSky: '#8f7fb8', hemiGround: '#1a1420', hemiIntensity: 0.8 },
    terrain: { a: '#2f3b2c', b: '#3b4636', high: '#4a3d55', low: '#232a21', shore: '#2a2a2a', peak: '#5a5066', rim: 30 },
    water: { color: '#3aff8a', emissive: '#1a8a4a', glow: 0.8 },
    banner: 'MANSÃO ASSOMBRADA',
    gate: { label: 'MANSÃO ASSOMBRADA', pillar: '#2b2731', beam: '#7b3fa0', badge: '#ff9f3a' },
    railA: '#7b3fa0',
    railB: '#2b2731',
  },
  toys: {
    id: 'toys',
    road: { asphalt: '#5aa9e6', patch: '#4a93cc', lane: '#ffffff', kerbA: '#e30613', kerbB: '#ffffff', shoulder: '#f2d29b', sprinkles: ['#e30613', '#ffc400', '#2b9de9', '#00a99d'], shortcut: '#c8956a', shortcutSlow: '#e8bb7d', slick: '#ffe066' },
    sky: { top: [0.55, 0.75, 0.95], mid: [0.95, 0.88, 0.75], horizon: [1.0, 0.95, 0.85], fog: '#f6e7cf', fogNear: 220, fogFar: 820, clouds: null },
    light: { sun: '#fff6e0', sunIntensity: 2.4, hemiSky: '#ffffff', hemiGround: '#b08a5a', hemiIntensity: 1.0 },
    terrain: { a: '#4fa3d9', b: '#5bb3e6', high: '#7ccf6a', low: '#3f8fc4', shore: '#9fd8f5', peak: '#f2c94c', rim: 6 },
    water: { color: '#5ad1ff', emissive: '#2b8ab0', glow: 0.3 },
    banner: 'FÁBRICA DE BRINQUEDOS',
    gate: { label: 'FÁBRICA DE BRINQUEDOS', pillar: '#2b9de9', beam: '#e30613', badge: '#ffc400' },
    railA: '#ffc400',
    railB: '#2b9de9',
  },
  pirate: {
    id: 'pirate',
    road: { asphalt: '#b88f5e', patch: '#a37c4e', lane: '#fff4d6', kerbA: '#e30613', kerbB: '#f7e3b5', shoulder: '#f0d3a2', sprinkles: ['#ffffff', '#ff9f8a', '#f7e3b5'], shortcut: '#8a6a4a', shortcutSlow: '#c8a46a', slick: '#3cc6c9' },
    sky: { top: [0.1, 0.45, 0.85], mid: [0.5, 0.78, 0.95], horizon: [0.9, 0.97, 1.0], fog: '#bfe6f5', fogNear: 220, fogFar: 800, clouds: '#ffffff' },
    light: { sun: '#fff1d0', sunIntensity: 3.0, hemiSky: '#ffffff', hemiGround: '#7a9a6a', hemiIntensity: 1.0 },
    terrain: { a: '#e8cf95', b: '#f0dca8', high: '#6fbf5a', low: '#d9bd80', shore: '#f4e3b8', peak: '#5a9a48', rim: 10 },
    water: { color: '#1fb5d6', emissive: '#0b6f8a', glow: 0.3 },
    banner: 'BAÍA PIRATA',
    gate: { label: 'BAÍA PIRATA', pillar: '#5a3b24', beam: '#1d232b', badge: '#ffc400' },
    railA: '#e30613',
    railB: '#f7e3b5',
  },
  sky: {
    id: 'sky',
    road: { asphalt: '#e9e4d8', patch: '#d8d2c4', lane: '#f2c94c', kerbA: '#f2c94c', kerbB: '#ffffff', shoulder: '#a8e07a', sprinkles: ['#ff8fcf', '#ffe066', '#ffffff'], shortcut: '#c8f0a0', shortcutSlow: '#a8e07a', slick: '#ffffff' },
    sky: { top: [0.25, 0.55, 0.95], mid: [0.55, 0.8, 1.0], horizon: [1.0, 1.0, 1.0], fog: '#e6f3ff', fogNear: 260, fogFar: 1000, clouds: '#ffffff' },
    light: { sun: '#fffaf0', sunIntensity: 2.8, hemiSky: '#ffffff', hemiGround: '#9fc6e8', hemiIntensity: 1.1 },
    terrain: { a: '#e6f3ff', b: '#e6f3ff', high: '#e6f3ff', low: '#e6f3ff', shore: '#e6f3ff', peak: '#e6f3ff', rim: 0 },
    water: { color: '#7fd3ff', emissive: '#3a8ac8', glow: 0.3 },
    banner: 'JARDIM NAS NUVENS',
    gate: { label: 'JARDIM NAS NUVENS', pillar: '#f2f0ea', beam: '#f2c94c', badge: '#7fd36b' },
    railA: '#f2c94c',
    railB: '#ffffff',
    floating: true,
  },
  dino: {
    id: 'dino',
    road: { asphalt: '#6b5a48', patch: '#5a4a3a', lane: '#f7e3b5', kerbA: '#3c8f3a', kerbB: '#f7e3b5', shoulder: '#7a6a4a', sprinkles: ['#3c8f3a', '#9ccf5a', '#c8b88a'], shortcut: '#5a4630', shortcutSlow: '#4a3826', slick: '#6b4f2a' },
    sky: { top: [0.2, 0.45, 0.7], mid: [0.6, 0.78, 0.7], horizon: [0.95, 0.92, 0.75], fog: '#b8d6b0', fogNear: 160, fogFar: 620, clouds: '#f0f4ea' },
    light: { sun: '#fff1c8', sunIntensity: 2.6, hemiSky: '#e8ffd8', hemiGround: '#4a6a3a', hemiIntensity: 1.0 },
    terrain: { a: '#3f7a3a', b: '#5a9a48', high: '#6b5a48', low: '#2f5a2c', shore: '#c8b88a', peak: '#8a7a5a', rim: 36 },
    water: { color: '#3a8a7a', emissive: '#1a4a40', glow: 0.2 },
    banner: 'SELVA JURÁSSICA',
    gate: { label: 'SELVA JURÁSSICA', pillar: '#6b4f3a', beam: '#3c8f3a', badge: '#ff9f3a' },
    railA: '#3c8f3a',
    railB: '#f7e3b5',
  },
}
