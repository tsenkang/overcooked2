import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input, type Device } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const input = new Input()
  const audio = new Audio()
  let game: Game | undefined
  /** Last race's local players (racer per slot) and their devices, for Restart / Race again. */
  let lastRacers: string[] = [save.data.character]
  let lastDevices: Device[] = []

  const applySettings = (d: SaveData) => {
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    input.autoThrottle = d.autoGas
    if (game) {
      game.reducedMotion = d.reducedMotion
      game.sensitivity = d.sensitivity
    }
  }

  const beginRace = (racers: string[], devices: Device[] = []) => {
    if (!game) return
    audio.unlock()
    lastRacers = racers
    lastDevices = devices
    save.update({ character: racers[0] })
    const split = racers.length > 1
    const tutorial = !save.data.tutorialDone
    ui.resetHud()
    // Split screen always opens with every player's controls.
    ui.showTutorial(tutorial || split, split ? devices.slice(0, racers.length) : undefined)
    game.startRace(racers, tutorial, devices)
    if (tutorial && !split) save.update({ tutorialDone: true })
    ui.show('hud')
    input.clearPresses()
    loop.resetAccumulator()
  }

  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    ui.show('pause')
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show((game.mode as string) === 'ended' ? 'results' : 'hud')
    input.clearPresses()
    loop.resetAccumulator()
  }
  const toTitle = () => {
    game?.toTitle()
    ui.show('title')
  }

  const ui = new Ui(document.getElementById('ui')!, i18n, save, audio, input, {
    race: () => {
      audio.unlock()
      game?.showSelect(save.data.character)
      ui.show('select')
    },
    selectChanged: id => game?.showSelect(id),
    startRace: (racers, devices) => beginRace(racers, devices),
    backToTitle: toTitle,
    resume,
    restart: () => beginRace(lastRacers, lastDevices),
    quit: toTitle,
    again: () => beginRace(lastRacers, lastDevices),
    change: () => {
      game?.toTitle()
      game?.showSelect(lastRacers[0])
      ui.show('select')
    },
    skipIntro: () => game?.skipIntro(),
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot')
  applySettings(save.data)

  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 4) * 0.8), v))
  ui.setBootProgress(0.1)
  const [{ registerGameTuning }, { tuning }] = await Promise.all([
    import('../scripts/manus-tuning/adapter.js'),
    import('./game/tuning'),
  ])
  await registerGameTuning(tuning)
  const [{ Game }, { Renderer, suggestQuality }, physics, { renderPortraits, preloadFaceAssets }] = await Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics')),
    track(import('./game/kartModel')),
    document.fonts.ready,
  ])
  await physics.initPhysics()
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  const { ROSTER } = await import('./game/characters')
  await preloadFaceAssets()
  ui.setPortraits(renderPortraits(renderer.gl, ROSTER))
  ui.setBootProgress(0.95)

  game = new Game(
    renderer,
    input,
    audio,
    {
      banner: (kind, vars, slot) => ui.banner(kind, vars, slot),
      countdown: n => ui.countdown(n),
      hurt: (kind, slot) => ui.hurt(kind, slot),
      hint: h => ui.hint(h),
      placeChange: (up, slot) => ui.placeChange(up, slot),
      itemReady: kind => ui.itemReady(kind),
      toast: (key, vars, slot) => ui.toast(key, vars, slot),
      finished: result => ui.showResults(result),
    },
    save.data.quality,
  )
  applySettings(save.data)
  ui.setTrackOutline(game.track.outline(4))
  const g = game

  let stepped = false
  const loop = new GameLoop({
    step: dt => {
      g.step(dt)
      stepped = true
    },
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause')) {
        if (g.mode === 'playing' && ui.screen === 'hud') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds)
      if (ui.screen === 'hud' && g.player) {
        const players = g.split ? g.humans().length : 1
        for (let slot = 1; slot <= players; slot += 1) ui.updateHud(g.hud(slot as 1 | 2 | 3 | 4), frameSeconds)
      }
      // Presses are consumed inside fixed steps; drop leftovers once a step had the chance.
      if (stepped) {
        input.clearPresses()
        stepped = false
      }
    },
  })
  loop.start()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  const unlockMusic = () => {
    if (audio.running) return
    audio.unlock()
    if (g.mode === 'title' || g.mode === 'select') g.playTitleMusic()
  }
  window.addEventListener('pointerdown', unlockMusic)
  window.addEventListener('keydown', unlockMusic)
  new TouchControls(document.getElementById('ui')!, input, i18n, () => ui.screen === 'hud' && g.mode === 'playing')
  ui.setBootProgress(1)
  window.setTimeout(() => ui.show('title'), 200)
  // Debug/test hook (read-only use): smoke tests inspect state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
