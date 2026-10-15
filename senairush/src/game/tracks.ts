/**
 * Every circuit is data: control points plus set pieces anchored by world position (`at` is the
 * nearest point on the racing line, `ahead` shifts it along the track in metres). `Track` turns a
 * definition into road, walls, colliders and hazards; `buildScenery` dresses it with the theme.
 */
export type XZ = readonly [number, number]
export type Lake = { x: number; z: number; r: number }
export type ThemeId = 'campus' | 'desert' | 'snow' | 'candy' | 'neon' | 'volcano'

/** Traffic and rolling things that travel along the road inside a stretch. */
export type MoverKind = 'car' | 'bus' | 'snowball' | 'boulder' | 'cart'
/** Things that cross the road from side to side on a timer. */
export type CrosserKind = 'train' | 'boulder' | 'penguin' | 'gumball' | 'forklift'

export type TrackDef = {
  id: string
  theme: ThemeId
  /** Racing line, closed loop: [x, z, height]. The first point is the start line. */
  points: [number, number, number][]
  /** Every circuit has one shortcut: it leaves near `from`, runs through `via`, rejoins near `to`. */
  shortcut: { from: XZ; via: [number, number, number][]; to: XZ; slow?: [number, number] }
  lakes?: Lake[]
  pads?: { at: XZ; ahead?: number; lateral?: number; length?: number; width?: number }[]
  /** Boost pads on the shortcut, as fractions of its length. */
  shortcutPads?: number[]
  /** Jump ramps; `gap` (metres) removes the road right after the lip so the jump clears a ravine. */
  ramps?: { at: XZ; ahead?: number; length?: number; lip?: number; width?: number; pad?: boolean; gap?: number }[]
  /** Item box rows across the road. */
  rows: { at: XZ; ahead?: number }[]
  bridges?: { lake: Lake; span?: number }[]
  /** Covered halls with stamping presses hanging from the roof. */
  halls?: { from: XZ; to: XZ; label: string }[]
  /** Bars spinning flat across the road around a post. */
  spinners?: { at: XZ; ahead?: number; radius?: number; speed: number; phase?: number }[]
  movers?: { from: XZ; to: XZ; kind: MoverKind; count: number; speed: number; lanes: number[] }[]
  crossers?: { at: XZ; ahead?: number; kind: CrosserKind; period: number; phase?: number }[]
  /** Vents that erupt on a cycle and launch whoever is on top. */
  geysers?: { at: XZ; ahead?: number; lateral: number; period?: number; phase?: number }[]
  /** Low-grip stretches (ice, oil, syrup). */
  slick?: { from: XZ; to: XZ }[]
  /** Big themed gate over the road. */
  landmark?: { at: XZ; ahead?: number }
}

/** SENAI Pompéia: campus streets, the workshop hall, the north bridge and the quarry canyon. */
const CAMPUS: TrackDef = {
  id: 'campus',
  theme: 'campus',
  points: [
    [-40, 0, 0], [30, 0, 0], [75, -10, 0], [98, -45, 0.5], [95, -90, 1], [70, -118, 1], [35, -120, 1], [12, -100, 1.5], [10, -70, 2],
    [-10, -48, 2.5], [-40, -45, 3], [-62, -65, 5], [-72, -100, 7.5], [-80, -140, 4], [-100, -165, 1.5],
    [-98, -205, 2], [-118, -250, 4], [-165, -280, 2.5], [-220, -272, 3], [-255, -232, 2], [-258, -182, 1.5], [-228, -150, 1], [-188, -150, 1],
    [-155, -135, 1], [-150, -90, 0.5], [-128, -45, 0],
    [-145, -5, 1], [-150, 35, 3], [-130, 70, 6], [-95, 95, 9], [-50, 105, 10], [-5, 100, 8], [33, 90, 6], [54, 68, 4.5], [46, 46, 3.8],
    [18, 38, 3], [-15, 42, 2], [-60, 48, 1], [-92, 47, 0.6], [-110, 38, 0.4], [-115, 22, 0.2], [-106, 7, 0], [-88, 1, 0],
  ],
  shortcut: { from: [84, -22], via: [[74, -50, 0.4], [69, -82, 0.8]], to: [55, -110], slow: [0.36, 0.7] },
  lakes: [{ x: -112, z: -108, r: 21 }, { x: 47, z: -64, r: 10 }, { x: 92, z: 36, r: 22 }],
  pads: [{ at: [10, -78], lateral: -3 }, { at: [-149, 15], lateral: -3 }, { at: [-226, -150], lateral: -4 }, { at: [-226, -150], ahead: 22, lateral: -4 }],
  shortcutPads: [0.25],
  ramps: [
    { at: [-72, -100], ahead: 9, length: 8, lip: 1.35, width: 7.2, pad: true },
    { at: [-62, 104], ahead: 6, length: 9, lip: 1.6, width: 8, pad: true },
    { at: [-138, -263], length: 10, lip: 1.9, width: 16, pad: true, gap: 10 },
  ],
  rows: [
    { at: [12, 0] }, { at: [-30, -44] }, { at: [-152, -118] }, { at: [-122, 79] }, { at: [30, 39] }, { at: [-112, 30] }, { at: [-100, -222] }, { at: [-250, -168] },
  ],
  bridges: [{ lake: { x: 14, z: 96, r: 19 } }],
  halls: [{ from: [-17, 42], to: [-58, 48], label: 'OFICINA DE PRENSAS' }],
  spinners: [
    { at: [-257, -205], ahead: -14, radius: 5, speed: 1.1 },
    { at: [-257, -205], ahead: 16, radius: 5, speed: -1.25, phase: 1.2 },
  ],
  // Campus shuttles on the east sweep and forklifts crossing behind the start.
  movers: [{ from: [75, -10], to: [95, -90], kind: 'bus', count: 2, speed: 11, lanes: [4.2] }],
  crossers: [
    { at: [-75, -42], kind: 'forklift', period: 6 },
    { at: [-128, -45], ahead: -30, kind: 'forklift', period: 7, phase: 0.5 },
  ],
  geysers: [
    { at: [35, -120], lateral: -3.5, period: 4 },
    { at: [35, -120], ahead: 12, lateral: 3.5, period: 4, phase: 0.5 },
  ],
  landmark: { at: [-72, -100], ahead: -10 },
}

/** Rali do Cacto: desert highway with a train crossing, rockfall, a canyon jump and oil geysers. */
const DESERT: TrackDef = {
  id: 'desert',
  theme: 'desert',
  points: [[0, 0, 0.0], [116, 0, 0.0], [203, -14, 0.0], [268, -65, 1.6], [290, -145, 4.8], [261, -218, 8.0], [188, -246, 9.6], [116, -218, 8.0], [58, -246, 6.4], [14, -312, 4.8], [-58, -341, 3.2], [-145, -319, 3.2], [-203, -261, 4.8], [-218, -174, 8.0], [-174, -116, 9.6], [-116, -130, 8.0], [-80, -167, 6.4], [-29, -145, 4.8], [-44, -87, 3.2], [-116, -58, 1.6], [-174, -29, 0.8], [-160, 22, 0.0], [-87, 14, 0.0]],
  shortcut: { from: [261, -218], via: [[215, -195, 9], [160, -195, 9]], to: [116, -218], slow: [0.4, 0.6] },
  lakes: [{ x: 150, z: -110, r: 22 }],
  pads: [{ at: [290, -145], lateral: 3 }],
  shortcutPads: [0.2],
  ramps: [
    { at: [36, -279], length: 10, lip: 1.9, width: 16, pad: true, gap: 10 },
    { at: [-174, -116], ahead: -6, length: 9, lip: 1.5, width: 9 },
  ],
  rows: [{ at: [60, 0] }, { at: [275, -100] }, { at: [-58, -341] }, { at: [-210, -215] }, { at: [-100, -150] }, { at: [-140, -40] }],
  spinners: [{ at: [-116, -58], radius: 5, speed: 1.0 }],
  movers: [{ from: [-174, -116], to: [-80, -167], kind: 'boulder', count: 3, speed: 12, lanes: [-3.5, 3.5] }],
  crossers: [
    { at: [160, -7], kind: 'train', period: 11 },
    { at: [-145, -319], kind: 'boulder', period: 6 },
    { at: [-203, -261], kind: 'boulder', period: 7, phase: 0.4 },
  ],
  geysers: [
    { at: [268, -65], lateral: -3.5, period: 4 },
    { at: [268, -65], ahead: 14, lateral: 3.5, period: 4, phase: 0.5 },
  ],
  slick: [{ from: [-29, -145], to: [-44, -87] }],
  landmark: { at: [-218, -174] },
}

/** Pico Gelado: a mountain climb with snowballs rolling down at you, ice, penguins and a crevasse. */
const SNOW: TrackDef = {
  id: 'snow',
  theme: 'snow',
  points: [[0, 0, 0.0], [143, -6, 2.2], [260, -39, 6.6], [338, -117, 11.0], [351, -221, 16.5], [299, -312, 22.0], [208, -351, 26.4], [117, -325, 28.6], [65, -260, 28.6], [0, -234, 26.4], [-78, -273, 24.2], [-156, -325, 22.0], [-247, -312, 17.6], [-299, -234, 13.2], [-286, -143, 8.8], [-221, -91, 5.5], [-195, -26, 3.3], [-130, 13, 1.1], [-65, 13, 0.0]],
  shortcut: { from: [117, -325], via: [[20, -290, 27], [-30, -300, 25]], to: [-78, -273], slow: [0.3, 0.7] },
  lakes: [{ x: 130, z: -170, r: 24 }],
  pads: [{ at: [299, -312] }],
  shortcutPads: [0.15],
  ramps: [
    { at: [-200, -320], length: 10, lip: 1.9, width: 16, pad: true, gap: 9 },
    { at: [208, -351], ahead: -10, length: 9, lip: 1.6, width: 9 },
  ],
  rows: [{ at: [70, -3] }, { at: [330, -160] }, { at: [150, -340] }, { at: [-40, -250] }, { at: [-280, -270] }, { at: [-250, -110] }, { at: [-160, 0] }],
  bridges: [{ lake: { x: -286, z: -143, r: 18 } }],
  movers: [{ from: [260, -39], to: [351, -221], kind: 'snowball', count: 3, speed: -13, lanes: [-3.5, 3.5] }],
  crossers: [
    { at: [-156, -325], kind: 'penguin', period: 9 },
    { at: [143, -6], kind: 'penguin', period: 8, phase: 0.3 },
  ],
  geysers: [
    { at: [-130, 13], lateral: -3.5, period: 4.5 },
    { at: [-130, 13], ahead: 13, lateral: 3.5, period: 4.5, phase: 0.5 },
  ],
  slick: [{ from: [65, -260], to: [0, -234] }, { from: [-221, -91], to: [-195, -26] }],
  landmark: { at: [338, -117] },
}

/** Vale Doce: candy valley with gumballs, a sweets factory, syrup and soda fountains. */
const CANDY: TrackDef = {
  id: 'candy',
  theme: 'candy',
  points: [[0, 0, 0.0], [94, -14, 1.4], [162, -68, 4.2], [162, -148, 5.6], [108, -202, 5.6], [27, -189, 4.2], [-14, -256, 5.6], [40, -324, 8.4], [135, -338, 9.8], [216, -297, 8.4], [270, -216, 5.6], [310, -122, 4.2], [297, -27, 2.8], [243, 54, 2.8], [148, 94, 4.2], [54, 122, 5.6], [-30, 115, 4.2], [-112, 95, 2], [-136, 53, 2], [-123, 6, 2], [-80, -17, 2], [-30, -5, 0.5]],
  shortcut: { from: [162, -148], via: [[110, -150, 5], [60, -150, 5]], to: [27, -189], slow: [0.35, 0.65] },
  lakes: [{ x: 60, z: -80, r: 20 }],
  pads: [{ at: [310, -122], ahead: -30 }],
  shortcutPads: [0.2],
  ramps: [
    { at: [195, 78], length: 10, lip: 1.9, width: 16, pad: true, gap: 9 },
    { at: [40, -324], ahead: -8, length: 9, lip: 1.5, width: 9 },
  ],
  rows: [{ at: [50, -8] }, { at: [162, -110] }, { at: [-5, -230] }, { at: [180, -320] }, { at: [300, -80] }, { at: [100, 108] }, { at: [-120, 20] }],
  bridges: [{ lake: { x: -136, z: 53, r: 16 }, span: 24 }],
  halls: [{ from: [-20, 116], to: [-85, 104], label: 'FÁBRICA DE DOCES' }],
  spinners: [
    { at: [310, -122], ahead: -14, radius: 5, speed: 1.2 },
    { at: [310, -122], ahead: 16, radius: 5, speed: -1.3, phase: 0.8 },
  ],
  movers: [{ from: [135, -338], to: [270, -216], kind: 'cart', count: 3, speed: 10, lanes: [-4, 4] }],
  crossers: [
    { at: [-14, -256], kind: 'gumball', period: 6 },
    { at: [243, 54], kind: 'gumball', period: 7, phase: 0.5 },
  ],
  geysers: [
    { at: [54, 122], lateral: -3.5, period: 3.6 },
    { at: [54, 122], ahead: 12, lateral: 3.5, period: 3.6, phase: 0.5 },
  ],
  slick: [{ from: [297, -27], to: [243, 54] }],
  landmark: { at: [270, -216] },
}

/** Avenida Neon: night city with two-way traffic, train crossings, a press tunnel and steam vents. */
const NEON: TrackDef = {
  id: 'neon',
  theme: 'neon',
  points: [[0, 0, 0], [132, 0, 0], [187, -22, 0], [209, -77, 0], [209, -165, 1], [176, -209, 2], [110, -220, 3], [66, -253, 3], [66, -319, 2], [110, -363, 1], [198, -363, 0], [253, -330, 0], [286, -264, 0], [308, -176, 2], [330, -66, 4], [308, 22, 6], [242, 66, 6], [154, 77, 4], [66, 66, 2], [-20, 72, 1], [-96, 70, 0], [-117, 38, 0], [-108, 1, 0], [-74, -18, 0], [-25, -4, 0]],
  shortcut: { from: [-20, 72], via: [[-60, 40, 0], [-70, 10, 0]], to: [-74, -18], slow: [0.3, 0.7] },
  pads: [{ at: [330, -66], ahead: -24 }],
  shortcutPads: [0.2],
  ramps: [
    { at: [230, -350], length: 10, lip: 1.9, width: 16, pad: true, gap: 9 },
    { at: [330, -66], ahead: -8, length: 9, lip: 1.5, width: 9 },
  ],
  rows: [{ at: [60, 0] }, { at: [200, -50] }, { at: [100, -225] }, { at: [300, -120] }, { at: [200, 72] }, { at: [-100, 50] }],
  halls: [{ from: [66, -253], to: [66, -319], label: 'TÚNEL DA AVENIDA' }],
  movers: [
    { from: [0, 0], to: [209, -165], kind: 'car', count: 4, speed: 13, lanes: [-4.5, 0, 4.5] },
    { from: [286, -264], to: [308, 22], kind: 'bus', count: 2, speed: -11, lanes: [4.5] },
    { from: [286, -264], to: [308, 22], kind: 'car', count: 3, speed: -15, lanes: [-4.5, 0] },
  ],
  crossers: [
    { at: [154, 77], kind: 'train', period: 10 },
    { at: [154, -363], kind: 'train', period: 13, phase: 0.5 },
  ],
  geysers: [
    { at: [209, -120], lateral: -3, period: 4 },
    { at: [209, -120], ahead: 14, lateral: 3, period: 4, phase: 0.5 },
  ],
  slick: [{ from: [308, 22], to: [242, 66] }],
  landmark: { at: [132, 0], ahead: 30 },
}

/** Vulcão Fervente: jumps over lava, fire bars, lava geysers, rolling magma rocks and a forge. */
const VOLCANO: TrackDef = {
  id: 'volcano',
  theme: 'volcano',
  points: [[0, 0, 2], [90, 10, 3], [160, -20, 5], [200, -80, 8], [190, -150, 11], [140, -200, 13], [70, -210, 14], [10, -180, 15], [-30, -120, 16], [-90, -100, 15], [-150, -130, 13], [-190, -190, 10], [-160, -250, 7], [-90, -270, 5], [-20, -260, 4], [40, -280, 3], [100, -300, 2], [170, -300, 2], [250, -260, 2], [280, -180, 2], [280, -90, 2], [260, -10, 2], [200, 50, 2], [120, 75, 2], [40, 85, 2], [-71, 84, 2], [-97, 45, 2], [-86, 0, 2], [-45, -23, 2], [-10, -2, 2]],
  shortcut: { from: [160, -20], via: [[150, -70, 6], [150, -120, 9]], to: [190, -150], slow: [0.4, 0.6] },
  lakes: [{ x: 100, z: -120, r: 26 }, { x: -40, z: -200, r: 20 }],
  pads: [{ at: [280, -180], ahead: -40 }],
  shortcutPads: [0.2],
  ramps: [
    { at: [-120, -115], length: 10, lip: 1.9, width: 16, pad: true, gap: 10 },
    { at: [210, -280], length: 10, lip: 1.9, width: 16, pad: true, gap: 10 },
  ],
  rows: [{ at: [50, 5] }, { at: [195, -110] }, { at: [40, -205] }, { at: [-170, -220] }, { at: [0, -265] }, { at: [270, -230] }, { at: [240, 30] }, { at: [-90, 30] }],
  bridges: [{ lake: { x: 280, z: -135, r: 16 }, span: 24 }],
  halls: [{ from: [280, -70], to: [266, -20], label: 'FORJA' }],
  spinners: [
    { at: [10, -180], ahead: -14, radius: 5.5, speed: 1.4 },
    { at: [10, -180], ahead: 16, radius: 5.5, speed: -1.5, phase: 1 },
  ],
  movers: [{ from: [-30, -120], to: [-190, -190], kind: 'boulder', count: 3, speed: 11, lanes: [-3.5, 3.5] }],
  crossers: [
    { at: [100, -300], kind: 'boulder', period: 6 },
    { at: [-71, 84], kind: 'boulder', period: 7, phase: 0.5 },
  ],
  geysers: [
    { at: [-160, -250], lateral: -3.5, period: 3.8 },
    { at: [-160, -250], ahead: 13, lateral: 3.5, period: 3.8, phase: 0.5 },
    { at: [40, 85], lateral: 0, period: 3.4, phase: 0.25 },
  ],
  landmark: { at: [-30, -120] },
}

export const TRACKS: TrackDef[] = [CAMPUS, DESERT, SNOW, CANDY, NEON, VOLCANO]

export function trackById(id: string): TrackDef {
  return TRACKS.find(t => t.id === id) ?? TRACKS[0]
}
