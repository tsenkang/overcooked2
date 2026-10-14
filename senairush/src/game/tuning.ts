import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'run'
type Control = {
  id: string
  type: 'number'
  category: string
  label: string
  description: string
  unit: string
  default: number
  min: number
  max: number
  step: number
  applyMode: Mode
  integrity: 'COSMETIC' | 'GAMEPLAY'
}
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string, label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary, cosmetic = false): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({
    control: Object.freeze({
      id: `${section}.${key}`,
      type: 'number',
      category: section === 'camera' ? 'Camera' : section === 'race' ? 'Race' : section === 'surface' ? 'Track feel' : 'Items',
      label,
      description: boundary === 'run' ? 'Applies when the next race starts.' : 'Updates this preview immediately.',
      unit,
      default: defaults[key],
      min,
      max,
      step,
      applyMode: boundary === 'run' ? 'NEXT_RUN' : 'LIVE',
      integrity: cosmetic ? 'COSMETIC' : 'GAMEPLAY',
    }),
    boundary,
    read: () => values[key],
    write: value => { values[key] = value },
  })
}

number('race', 'laps', 'Race laps', 2, 5, 1, 'laps', 'run')
number('race', 'resultsDelay', 'Results delay', 1, 6, 0.5, 's')
number('surface', 'offroadSpeed', 'Off-road speed', 0.55, 0.95, 0.01, 'x')
number('surface', 'fluffSpeed', 'Workshop detour speed', 0.35, 0.8, 0.01, 'x')
number('items', 'boxRespawn', 'Item box respawn', 1.5, 8, 0.1, 's')
number('camera', 'fov', 'Field of view', 50, 84, 1, '°', undefined, true)
number('camera', 'distance', 'Camera distance', 4.5, 9, 0.1, 'm', undefined, true)
number('camera', 'height', 'Camera height', 1.5, 4, 0.1, 'm', undefined, true)
number('camera', 'follow', 'Camera follow speed', 4, 16, 0.5, '', undefined, true)

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    requested = { ...requested, ...patch }
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    unranked = unranked || gameplayModified()
  },
}
