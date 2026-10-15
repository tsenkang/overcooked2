import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import { KEY_SETS, MAX_PLAYERS, sameDevice, type Device, type Input, type PlayerSlot } from '../engine/input'
import { insertEntry, type Locale, type Quality, type SaveData, type SaveStore } from '../engine/save'
import { ROSTER, characterById } from '../game/characters'
import { ITEM_KINDS, type ItemKind } from '../game/config'
import type { Hint, HudState, RaceResult } from '../game/game'
import { formatTime, ordinalSuffix } from '../game/rules'
import { THEMES } from '../game/themes'
import { TRACKS, trackById, type TrackDef } from '../game/tracks'
import { TrackSpline } from '../engine/spline'
import { ICON, ITEM_ICONS, PAD_GLYPH, keyCap } from './icons'

export type Screen = 'boot' | 'title' | 'tracks' | 'select' | 'lobby' | 'hud' | 'pause' | 'settings' | 'leaderboard' | 'results'

export type UiActions = {
  race(): void
  /** A circuit was picked on the track screen (loads it, then goes to racer select). */
  trackChanged(id: string): void
  selectChanged(id: string): void
  /** One racer per local player; with several, each player's device too. */
  startRace(racers: string[], devices: Device[]): void
  backToTitle(): void
  resume(): void
  restart(): void
  quit(): void
  again(): void
  change(): void
  skipIntro(): void
  settings(patch: Partial<SaveData>): void
}

type Outline = { main: [number, number][]; short: [number, number][] }

const h = (html: string): HTMLElement => {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

/** Per-player HUD state (split screen keeps one of these for each half). */
type ViewState = { lastPlace: number; rouletteTimer: number; rouletteIndex: number; toastTimer: number }
const SLOTS: PlayerSlot[] = [1, 2, 3, 4]

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly screens = new Map<Screen, HTMLElement>()
  private portraits = new Map<string, string>()
  private selected: string
  /** How many local players the next race has (1 = solo, any device drives). */
  private playerCount = 1
  /** Lobby: players who have joined, in slot order, with their device and racer. */
  private lobby: { device: Device; character: string }[] = []
  /** Devices of the race in progress (split screen), for the controls card and pause menu. */
  private raceDevices: Device[] = []
  private settingsReturn: Screen = 'title'
  private outline?: Outline
  private mapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }
  private mapCanvas!: HTMLCanvasElement
  private mapBase?: HTMLCanvasElement
  private navCooldown = 0
  private readonly views = new Map<PlayerSlot, ViewState>(SLOTS.map(s => [s, { lastPlace: 0, rouletteTimer: 0, rouletteIndex: 0, toastTimer: 0 }]))
  private hintKey: Hint = 'none'
  private result?: RaceResult
  private resultSaved = false
  private tutorialShown = false
  private lastHud?: HudState

  constructor(
    root: HTMLElement,
    private readonly i18n: I18n,
    private readonly save: SaveStore,
    private readonly audio: Audio,
    private readonly input: Input,
    private readonly actions: UiActions,
  ) {
    this.root = root
    this.selected = characterById(save.data.character).id
    this.build()
    i18n.onChange(() => this.relabel())
    window.addEventListener('keydown', e => this.onKey(e))
    this.root.addEventListener('pointerover', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')
      if (el && el !== document.activeElement && this.current().contains(el) && !(el instanceof HTMLInputElement && el.type === 'text')) el.focus({ preventScroll: true })
    })
  }

  private t(key: string, vars?: Record<string, string | number>): string {
    return this.i18n.t(key, vars)
  }

  // ─── structure ───────────────────────────────────────────────────

  private build(): void {
    this.root.innerHTML = ''
    const add = (name: Screen, el: HTMLElement) => {
      el.classList.add('screen', `screen-${name}`)
      el.dataset.screen = name
      this.screens.set(name, el)
      this.root.appendChild(el)
    }
    add('boot', h(`<section><div class="logo boot-logo"><span class="logo-main" data-i18n="game.title"></span></div><div class="boot-bar"><i></i></div><p class="boot-label" data-i18n="boot.loading"></p></section>`))
    add(
      'title',
      h(`<section>
        <div class="title-wrap">
          <div class="logo"><span class="logo-kicker" data-i18n="game.subtitle"></span><span class="logo-main" data-i18n="game.title"></span><span class="logo-sub" data-i18n="game.badge"></span></div>
          <p class="tagline" data-i18n="game.tagline"></p>
          <nav class="menu">
            <button class="btn btn-primary btn-big" data-nav data-act="race">${ICON.flag}<span data-i18n="menu.race"></span></button>
            <button class="btn" data-nav data-act="leaderboard">${ICON.trophy}<span data-i18n="menu.leaderboard"></span></button>
            <button class="btn" data-nav data-act="settings">${ICON.gear}<span data-i18n="menu.settings"></span></button>
          </nav>
          <p class="best" data-best></p>
        </div>
        <footer class="prompts" data-prompts></footer>
        <p class="credits" data-i18n="credits.fonts"></p>
      </section>`),
    )
    add(
      'tracks',
      h(`<section>
        <div class="tracks-wrap">
          <h2 class="panel-title tracks-title" data-i18n="tracks.title"></h2>
          <div class="track-cards" data-track-cards></div>
          <div class="tracks-actions"><button class="btn" data-nav data-act="back"><span data-i18n="menu.back"></span></button></div>
        </div>
      </section>`),
    )
    add(
      'select',
      h(`<section>
        <div class="select-left panel">
          <h2 class="panel-title" data-i18n="select.title"></h2>
          <div class="cards" data-cards></div>
          <p class="select-hint" data-select-hint></p>
        </div>
        <div class="select-info panel" data-info></div>
        <div class="select-actions">
          <button class="btn btn-local" data-nav data-act="players" data-players-btn></button>
          <button class="btn" data-nav data-act="back"><span data-i18n="menu.back"></span></button>
          <button class="btn btn-primary btn-big" data-nav data-act="start">${ICON.flag}<span data-i18n="menu.start"></span></button>
        </div>
      </section>`),
    )
    // Everything about one racer lives in a .hud-view; split screen shows two, stacked.
    const view = (slot: PlayerSlot) => `<div class="hud-view" data-view="${slot}">
        <div class="speedlines" data-speedlines></div>
        <div class="vignette" data-vignette></div>
        <div class="hud-tl">
          <div class="place" data-place><b data-place-num>1</b><span data-place-suf></span></div>
          <div class="lapbox"><span class="lap-label" data-i18n="hud.lap"></span><b data-lap>1/3</b></div>
          <div class="timebox" data-time>0:00.00</div>
        </div>
        <div class="ptag ptag-${slot}"><span data-i18n="hud.p${slot}"></span><i class="dev" data-dev></i></div>
        <div class="hud-tr">
          <div class="itemslot" data-itemslot><div class="item-icon" data-item-icon></div></div>
          <div class="item-name" data-item-name></div>
          <div class="item-key" data-item-key></div>
        </div>
        <div class="hud-br"><b data-speed>0</b><span>km/h</span></div>
        <div class="drift" data-drift><i></i><i></i><i></i></div>
        <div class="warn" data-warn></div>
        <div class="center"><div class="banner" data-banner></div></div>
        <div class="toast" data-toast></div>
      </div>`
    add(
      'lobby',
      h(`<section><div class="panel modal wide lobby">
        <h2 class="panel-title" data-i18n="lobby.title"></h2>
        <p class="lobby-help" data-lobby-help></p>
        <div class="lobby-slots" data-lobby-slots></div>
        <p class="lobby-status" data-lobby-status></p>
        <div class="modal-actions">
          <button class="btn" data-nav data-act="back"><span data-i18n="menu.back"></span></button>
          <button class="btn btn-primary" data-nav data-act="lobby-go" data-lobby-go>${ICON.flag}<span data-i18n="menu.start"></span></button>
        </div>
      </div></section>`),
    )
    add(
      'hud',
      h(`<section>
        ${SLOTS.map(view).join('')}
        <button class="pausebtn" data-act="pause" aria-label="pause">${ICON.pause}</button>
        <div class="hud-bl"><canvas class="minimap" data-minimap width="220" height="220"></canvas></div>
        <div class="center center-count"><div class="count" data-count></div></div>
        <div class="hint" data-hint></div>
        <div class="tutorial panel" data-tutorial></div>
        <div class="skip" data-skip></div>
      </section>`),
    )
    add(
      'pause',
      h(`<section><div class="panel modal">
        <h2 class="panel-title big" data-i18n="menu.paused"></h2>
        <nav class="menu">
          <button class="btn btn-primary" data-nav data-act="resume"><span data-i18n="menu.resume"></span></button>
          <button class="btn" data-nav data-act="restart"><span data-i18n="menu.restart"></span></button>
          <button class="btn" data-nav data-act="settings"><span data-i18n="menu.settings"></span></button>
          <button class="btn" data-nav data-act="quit"><span data-i18n="menu.quit"></span></button>
        </nav><p class="pad-status" data-pad-status hidden></p></div></section>`),
    )
    add('settings', h(`<section><div class="panel modal wide" data-settings></div></section>`))
    add('leaderboard', h(`<section><div class="panel modal wide"><h2 class="panel-title" data-i18n="board.title"></h2><div data-board></div><div class="modal-actions"><button class="btn" data-nav data-act="back"><span data-i18n="menu.back"></span></button></div></div></section>`))
    add('results', h(`<section><div class="results" data-results></div></section>`))
    this.root.appendChild(h(`<div class="rotate"><div class="panel"><h2 class="panel-title" data-i18n="rotate.title"></h2><p data-i18n="rotate.body"></p></div></div>`))

    this.root.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
      if (!el) return
      this.audio.unlock()
      this.act(el.dataset.act!, el)
    })
    this.mapCanvas = this.q('hud', '[data-minimap]') as HTMLCanvasElement
    this.buildCards()
    this.buildTrackCards()
    this.buildSettings()
    this.updatePlayersBtn()
    this.relabel()
  }

  private q(screen: Screen, sel: string): HTMLElement {
    return this.screens.get(screen)!.querySelector(sel) as HTMLElement
  }

  /** An element inside one player's HUD view. */
  private qv(slot: PlayerSlot, sel: string): HTMLElement {
    return this.screens.get('hud')!.querySelector(`[data-view="${slot}"]${sel ? ` ${sel}` : ''}`) as HTMLElement
  }

  private current(): HTMLElement {
    return this.screens.get(this.screen)!
  }

  private act(name: string, el: HTMLElement): void {
    const sfx = name === 'back' ? 'uiBack' : 'uiSelect'
    switch (name) {
      case 'race':
        this.audio.play(sfx)
        this.actions.race()
        break
      case 'leaderboard':
        this.audio.play(sfx)
        this.renderBoard()
        this.show('leaderboard')
        break
      case 'settings':
        this.audio.play(sfx)
        this.settingsReturn = this.screen
        this.show('settings')
        break
      case 'back':
        this.audio.play(sfx)
        this.back()
        break
      case 'start':
        this.audio.play('go')
        if (this.playerCount === 1) this.actions.startRace([this.selected], [])
        else {
          this.lobby = []
          this.show('lobby')
        }
        break
      case 'pick':
        this.pick(el.dataset.id!)
        break
      case 'pick-track':
        this.audio.play('uiSelect')
        this.actions.trackChanged(el.dataset.id!)
        break
      case 'players':
        this.playerCount = (this.playerCount % MAX_PLAYERS) + 1
        this.updatePlayersBtn()
        this.audio.play('uiSelect')
        break
      case 'lobby-prev':
      case 'lobby-next':
        this.cycleLobby(Number(el.dataset.slot) - 1, name === 'lobby-next' ? 1 : -1)
        break
      case 'lobby-go':
        this.startLobby()
        break
      case 'resume':
        this.audio.play(sfx)
        this.actions.resume()
        break
      case 'restart':
        this.audio.play(sfx)
        this.actions.restart()
        break
      case 'quit':
        this.audio.play('uiBack')
        this.actions.quit()
        break
      case 'again':
        this.audio.play(sfx)
        this.actions.again()
        break
      case 'change':
        this.audio.play(sfx)
        this.actions.change()
        break
      case 'title':
        this.audio.play('uiBack')
        this.actions.quit()
        break
      case 'pause':
        window.dispatchEvent(new Event('game:pause'))
        break
      case 'save-name':
        this.saveResult()
        break
      case 'skip':
        this.actions.skipIntro()
        break
    }
  }

  private back(): void {
    switch (this.screen) {
      case 'settings':
        this.show(this.settingsReturn)
        break
      case 'leaderboard':
        this.show('title')
        break
      case 'tracks':
        this.actions.backToTitle()
        break
      case 'select':
        this.show('tracks')
        break
      case 'lobby':
        this.show('select')
        break
      case 'pause':
        this.actions.resume()
        break
    }
  }

  show(screen: Screen): void {
    this.screen = screen
    for (const [name, el] of this.screens) el.classList.toggle('active', name === screen)
    document.body.dataset.screen = screen
    if (screen === 'title') this.refreshTitle()
    if (screen === 'pause') this.refreshPadStatus()
    if (screen === 'lobby') this.renderLobby()
    if (screen === 'tracks') requestAnimationFrame(() => this.current().querySelector<HTMLElement>(`[data-id="${this.save.data.track}"]`)?.focus({ preventScroll: true }))
    if (screen === 'settings') this.refreshSettings()
    if (screen === 'select') this.pick(this.selected, true)
    if (screen === 'hud') {
      // A menu button left focused would react to Space/Enter, which are driving keys now.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      for (const slot of SLOTS) {
        this.views.get(slot)!.lastPlace = 0
        this.qv(slot, '[data-banner]').className = 'banner'
      }
    }
    requestAnimationFrame(() => {
      const first = this.current().querySelector<HTMLElement>('.btn-primary[data-nav], [data-nav]')
      if (screen !== 'hud' && first && !(first instanceof HTMLInputElement)) first.focus({ preventScroll: true })
      if (screen === 'select') this.current().querySelector<HTMLElement>(`[data-id="${this.selected}"]`)?.focus({ preventScroll: true })
    })
  }

  setBootProgress(p: number): void {
    ;(this.q('boot', '.boot-bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`
  }

  setPortraits(map: Map<string, string>): void {
    this.portraits = map
    this.buildCards()
  }

  setTrackOutline(outline: Outline): void {
    this.outline = outline
    const all = [...outline.main, ...outline.short]
    const xs = all.map(p => p[0])
    const zs = all.map(p => p[1])
    this.mapBounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
    this.mapBase = undefined
  }

  // ─── labels ──────────────────────────────────────────────────────

  private relabel(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.t(el.dataset.i18n!)
    document.title = `${this.t('game.title')} · SENAI Pompéia`
    this.buildCards()
    this.buildTrackCards()
    this.buildSettings()
    this.updatePlayersBtn()
    this.refreshTitle()
    if (this.screen === 'select') this.pick(this.selected, true)
    if (this.screen === 'leaderboard') this.renderBoard()
    if (this.screen === 'results' && this.result) this.renderResults(this.result)
    this.prompts()
    this.hintKey !== 'none' && this.hint(this.hintKey)
  }

  // ─── track select ────────────────────────────────────────────────

  private buildTrackCards(): void {
    const wrap = this.screens.get('tracks')?.querySelector<HTMLElement>('[data-track-cards]')
    if (!wrap) return
    wrap.innerHTML = TRACKS.map(def => {
      const theme = THEMES[def.theme]
      const chips = trackHazards(def)
        .map(k => `<span class="hz">${esc(this.t(`hz.${k}`))}</span>`)
        .join('')
      return `<button class="track-card" data-nav data-act="pick-track" data-id="${def.id}" style="--c:${theme.road.kerbA};--bg:${theme.sky.fog}">
        <span class="track-thumb">${trackThumb(def)}</span>
        <span class="track-name">${esc(this.t(`track.${def.id}.name`))}</span>
        <span class="track-meta">${esc(this.t(`theme.${def.theme}`))} · ${(trackLength(def) / 1000).toFixed(1)} km</span>
        <span class="track-blurb">${esc(this.t(`track.${def.id}.blurb`))}</span>
        <span class="track-hz">${chips}</span>
      </button>`
    }).join('')
  }

  private updatePlayersBtn(): void {
    const el = this.screens.get('select')?.querySelector<HTMLElement>('[data-players-btn]')
    if (!el) return
    el.textContent = this.playerCount === 1 ? this.t('select.players1') : this.t('select.playersN', { n: this.playerCount })
    el.classList.toggle('on', this.playerCount > 1)
  }

  /** Pause menu, split screen only: who drives with what. */
  private refreshPadStatus(): void {
    const status = this.q('pause', '[data-pad-status]')
    const split = this.raceDevices.length > 1 && document.body.classList.contains('local-split')
    status.hidden = !split
    if (!split) return
    status.innerHTML = this.raceDevices
      .map((d, i) => `<span class="ptag ptag-${i + 1}">${esc(this.t(`hud.p${i + 1}`))}</span> ${esc(this.deviceName(d))}`)
      .concat(esc(this.t('pads.count', { n: this.input.padCount })))
      .join('<br>')
  }

  private deviceName(d: Device): string {
    return d.kind === 'pad' ? this.t('dev.pad', { n: d.index + 1 }) : this.t(`dev.keys${d.set}`)
  }

  // ─── lobby (split screen join) ───────────────────────────────────

  /** First racer nobody in the lobby has, starting from `from`. */
  private freeRacer(from: string, skip = -1): string {
    const taken = new Set(this.lobby.filter((_, i) => i !== skip).map(p => p.character))
    const start = Math.max(0, ROSTER.findIndex(c => c.id === from))
    for (let k = 0; k < ROSTER.length; k += 1) {
      const c = ROSTER[(start + k) % ROSTER.length]
      if (!taken.has(c.id)) return c.id
    }
    return from
  }

  private cycleLobby(i: number, dir: 1 | -1): void {
    const p = this.lobby[i]
    if (!p) return
    const taken = new Set(this.lobby.filter((_, k) => k !== i).map(o => o.character))
    let idx = ROSTER.findIndex(c => c.id === p.character)
    for (let k = 0; k < ROSTER.length; k += 1) {
      idx = (idx + dir + ROSTER.length) % ROSTER.length
      if (!taken.has(ROSTER[idx].id)) break
    }
    p.character = ROSTER[idx].id
    if (i === 0) this.actions.selectChanged(p.character)
    this.audio.play('uiMove')
    this.renderLobby()
  }

  private startLobby(): void {
    if (this.lobby.length < this.playerCount) return
    this.audio.play('go')
    this.raceDevices = this.lobby.map(p => p.device)
    this.selected = this.lobby[0].character
    this.actions.startRace(
      this.lobby.map(p => p.character),
      this.lobby.map(p => p.device),
    )
  }

  /** Each player joins with their own device: GAS on a keyboard zone or A on a gamepad. */
  private lobbyFrame(): void {
    let changed = false
    for (const e of this.input.takeEdges()) {
      const i = this.lobby.findIndex(p => sameDevice(p.device, e.device))
      if (i < 0) {
        if (e.action === 'join' && this.lobby.length < this.playerCount) {
          const first = this.lobby.length === 0
          this.lobby.push({ device: e.device, character: this.freeRacer(first ? this.selected : ROSTER[this.lobby.length % ROSTER.length].id) })
          this.audio.play('uiSelect')
          changed = true
        } else if (e.action === 'back' && e.device.kind === 'pad' && this.lobby.length === 0) {
          this.show('select')
          return
        }
        continue
      }
      if (e.action === 'left' || e.action === 'right') this.cycleLobby(i, e.action === 'right' ? 1 : -1)
      else if (e.action === 'back') {
        this.lobby.splice(i, 1)
        this.audio.play('uiBack')
        changed = true
      } else if (e.action === 'go' && this.lobby.length === this.playerCount) return this.startLobby()
    }
    // A gamepad that was unplugged leaves its seat.
    const kept = this.lobby.filter(p => p.device.kind === 'keys' || this.input.padConnected(p.device.index))
    if (kept.length !== this.lobby.length) {
      this.lobby = kept
      changed = true
    }
    if (changed) this.renderLobby()
  }

  private renderLobby(): void {
    const scr = this.screens.get('lobby')!
    const join = [0, 1, 2, 3].map(k => keyCap(KEY_SETS[k as 0].caps.accelerate, KEY_SETS[k as 0].caps.accelerate.length > 1)).join(' ')
    this.q('lobby', '[data-lobby-help]').innerHTML = this.t('lobby.help', { keys: join, a: PAD_GLYPH.A })
    const slots: string[] = []
    for (let i = 0; i < this.playerCount; i += 1) {
      const p = this.lobby[i]
      const tag = `<span class="ptag ptag-${i + 1}">${esc(this.t(`hud.p${i + 1}`))}</span>`
      if (!p) {
        slots.push(`<div class="lobby-slot">${tag}<div class="lobby-wait">${esc(this.t('lobby.join'))}</div></div>`)
        continue
      }
      const c = characterById(p.character)
      const img = this.portraits.get(c.id)
      slots.push(`<div class="lobby-slot on" style="--c:${c.ui}">${tag}
        <span class="lobby-art">${img ? `<img src="${img}" alt="">` : ''}</span>
        <div class="lobby-pick">
          <button class="lobby-arrow" data-act="lobby-prev" data-slot="${i + 1}" aria-label="previous">◀</button>
          <b>${esc(this.t(`char.${c.id}.name`))}</b>
          <button class="lobby-arrow" data-act="lobby-next" data-slot="${i + 1}" aria-label="next">▶</button>
        </div>
        <span class="lobby-dev">${esc(this.deviceName(p.device))}</span>
      </div>`)
    }
    this.q('lobby', '[data-lobby-slots]').innerHTML = slots.join('')
    scr.querySelector<HTMLElement>('.lobby-slots')!.style.setProperty('--n', String(this.playerCount))
    const missing = this.playerCount - this.lobby.length
    this.q('lobby', '[data-lobby-status]').innerHTML = missing > 0 ? esc(this.t('lobby.waiting', { n: missing })) : this.t('lobby.ready', { x: PAD_GLYPH.X })
    ;(this.q('lobby', '[data-lobby-go]') as HTMLButtonElement).disabled = missing > 0
  }

  private refreshTitle(): void {
    const best = this.save.data.leaderboard.find(e => e.track === this.save.data.track)
    const el = this.q('title', '[data-best]')
    el.textContent = best ? this.t('menu.best', { time: formatTime(best.time) }) : ''
    this.prompts()
  }

  private prompts(): void {
    const m = this.input.method
    const ok = m === 'gamepad' ? PAD_GLYPH.A : keyCap('Enter', true)
    const back = m === 'gamepad' ? PAD_GLYPH.B : keyCap('Esc', true)
    const html = m === 'touch' ? '' : `<span>${ok} ${esc(this.t('prompt.select'))}</span><span>${back} ${esc(this.t('prompt.back'))}</span>`
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-prompts]')) el.innerHTML = html
    const hint = this.screens.get('select')?.querySelector<HTMLElement>('[data-select-hint]')
    if (hint) hint.innerHTML = m === 'touch' ? '' : this.t('select.hint', { prev: m === 'gamepad' ? '◀' : keyCap('←'), next: m === 'gamepad' ? '▶' : keyCap('→'), ok })
  }

  // ─── character select ────────────────────────────────────────────

  private buildCards(): void {
    const wrap = this.screens.get('select')?.querySelector<HTMLElement>('[data-cards]')
    if (!wrap) return
    wrap.innerHTML = ROSTER.map(c => {
      const img = this.portraits.get(c.id)
      return `<button class="card${c.id === this.selected ? ' on' : ''}" data-nav data-act="pick" data-id="${c.id}" style="--c:${c.ui}">
        <span class="card-art">${img ? `<img src="${img}" alt="">` : ''}</span>
        <span class="card-name">${esc(this.t(`char.${c.id}.name`))}</span>
      </button>`
    }).join('')
    wrap.querySelectorAll<HTMLElement>('.card').forEach(card => card.addEventListener('focus', () => this.pick(card.dataset.id!)))
  }

  private pick(id: string, force = false): void {
    if (id === this.selected && !force) return
    if (id !== this.selected) this.audio.play('uiMove')
    this.selected = id
    const c = characterById(id)
    this.screens.get('select')!.querySelectorAll<HTMLElement>('.card').forEach(el => el.classList.toggle('on', el.dataset.id === id))
    const bar = (key: string, v: number) => `<div class="stat"><span>${esc(this.t(key))}</span><div class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div></div>`
    this.q('select', '[data-info]').innerHTML = `
      <div class="info-head" style="--c:${c.ui}"><h3>${esc(this.t(`char.${id}.name`))}</h3><span class="tag">${esc(this.t(`char.${id}.species`))}</span></div>
      <p class="blurb">${esc(this.t(`char.${id}.blurb`))}</p>
      ${bar('stat.speed', c.stats.speed)}${bar('stat.accel', c.stats.accel)}${bar('stat.handling', c.stats.handling)}${bar('stat.weight', c.stats.weight)}`
    this.save.update({ character: id })
    this.actions.selectChanged(id)
  }

  // ─── settings ────────────────────────────────────────────────────

  private buildSettings(): void {
    const el = this.screens.get('settings')?.querySelector<HTMLElement>('[data-settings]')
    if (!el) return
    const d = this.save.data
    const range = (key: keyof SaveData, label: string, min: number, max: number, step: number) =>
      `<label class="row"><span>${esc(this.t(label))}</span><input type="range" data-nav data-key="${key}" min="${min}" max="${max}" step="${step}" value="${d[key] as number}"><output>${fmtRange(key, d[key] as number)}</output></label>`
    const toggle = (key: keyof SaveData, label: string) => `<label class="row"><span>${esc(this.t(label))}</span><button class="switch${d[key] ? ' on' : ''}" data-nav data-toggle="${key}" role="switch" aria-checked="${!!d[key]}"><i></i></button></label>`
    const seg = (key: string, label: string, opts: [string, string][], value: string) =>
      `<div class="row"><span>${esc(label)}</span><div class="seg">${opts.map(([v, l]) => `<button class="opt${v === value ? ' on' : ''}" data-nav data-seg="${key}" data-v="${v}">${esc(l)}</button>`).join('')}</div></div>`
    el.innerHTML = `
      <h2 class="panel-title" data-i18n="settings.title">${esc(this.t('settings.title'))}</h2>
      <div class="settings-grid">
        <div><h4>${esc(this.t('settings.audio'))}</h4>
          ${range('musicVolume', 'settings.music', 0, 1, 0.05)}
          ${range('sfxVolume', 'settings.sfx', 0, 1, 0.05)}
          ${toggle('muted', 'settings.mute')}
          <h4>${esc(this.t('settings.controls'))}</h4>
          ${range('sensitivity', 'settings.sensitivity', 0.5, 2, 0.1)}
          ${toggle('autoGas', 'settings.autoGas')}
        </div>
        <div><h4>${esc(this.t('settings.display'))}</h4>
          ${seg('quality', this.t('settings.quality'), (['low', 'medium', 'high'] as Quality[]).map(q => [q, this.t(`settings.quality.${q}`)]), d.quality)}
          ${toggle('reducedMotion', 'settings.shake')}
          <h4>${esc(this.t('settings.language'))}</h4>
          ${seg('locale', this.t('settings.language'), [['zh-CN', '中文'], ['en', 'English']], this.i18n.locale)}
          <div class="row"><span>${esc(this.t('settings.tutorial'))}</span><button class="btn btn-small${d.tutorialDone ? '' : ' done'}" data-nav data-tutorial-reset>↺</button></div>
        </div>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" data-nav data-act="back"><span>${esc(this.t('menu.back'))}</span></button></div>`
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(inp =>
      inp.addEventListener('input', () => {
        const key = inp.dataset.key as keyof SaveData
        const v = Number(inp.value)
        inp.nextElementSibling!.textContent = fmtRange(key, v)
        this.actions.settings({ [key]: v } as Partial<SaveData>)
        if (key === 'sfxVolume') this.audio.play('uiMove')
      }),
    )
    el.querySelectorAll<HTMLElement>('[data-toggle]').forEach(btn =>
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle as keyof SaveData
        const v = !this.save.data[key]
        this.actions.settings({ [key]: v } as Partial<SaveData>)
        btn.classList.toggle('on', v)
        btn.setAttribute('aria-checked', String(v))
        this.audio.play('uiMove')
      }),
    )
    el.querySelectorAll<HTMLElement>('[data-seg]').forEach(btn =>
      btn.addEventListener('click', () => {
        const key = btn.dataset.seg!
        const v = btn.dataset.v!
        this.audio.play('uiMove')
        if (key === 'locale') this.actions.settings({ locale: v as Locale })
        else this.actions.settings({ quality: v as Quality })
        btn.parentElement!.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', o === btn))
        if (key === 'locale') requestAnimationFrame(() => this.current().querySelector<HTMLElement>(`[data-seg="locale"][data-v="${v}"]`)?.focus())
      }),
    )
    el.querySelector<HTMLElement>('[data-tutorial-reset]')?.addEventListener('click', e => {
      this.actions.settings({ tutorialDone: false })
      ;(e.currentTarget as HTMLElement).classList.add('done')
      this.audio.play('uiSelect')
    })
  }

  refreshSettings(): void {
    const focused = document.activeElement as HTMLElement | null
    const sel = focused?.dataset.key ? `[data-key="${focused.dataset.key}"]` : focused?.dataset.toggle ? `[data-toggle="${focused.dataset.toggle}"]` : ''
    this.buildSettings()
    if (sel && this.screen === 'settings') this.current().querySelector<HTMLElement>(sel)?.focus()
  }

  // ─── leaderboard ─────────────────────────────────────────────────

  private renderBoard(): void {
    const track = this.save.data.track
    const board = this.save.data.leaderboard.filter(e => e.track === track)
    this.q('leaderboard', '.panel-title').textContent = `${this.t('board.title')} · ${this.t(`track.${trackById(track).id}.name`)}`
    const el = this.q('leaderboard', '[data-board]')
    if (!board.length) {
      el.innerHTML = `<p class="empty">${esc(this.t('board.empty'))}</p>`
      return
    }
    el.innerHTML = `<table class="table"><thead><tr><th>${esc(this.t('board.rank'))}</th><th>${esc(this.t('board.name'))}</th><th>${esc(this.t('board.place'))}</th><th>${esc(this.t('board.time'))}</th></tr></thead><tbody>${board
      .map((e, i) => `<tr class="${i < 3 ? `top top${i + 1}` : ''}"><td class="rank">${i + 1}</td><td class="who">${this.avatar(e.character)}<span>${esc(e.name)}</span></td><td>${esc(this.placeText(e.place))}</td><td class="mono">${formatTime(e.time)}</td></tr>`)
      .join('')}</tbody></table>`
  }

  private avatar(id: string): string {
    const img = this.portraits.get(id)
    const c = characterById(id)
    return `<span class="avatar" style="--c:${c.ui}">${img ? `<img src="${img}" alt="">` : ''}</span>`
  }

  private placeText(place: number): string {
    return this.t(`hud.place.${place}`)
  }

  // ─── results ─────────────────────────────────────────────────────

  showResults(result: RaceResult): void {
    this.result = result
    this.resultSaved = false
    this.renderResults(result)
    this.show('results')
    requestAnimationFrame(() => this.current().querySelector<HTMLElement>('[data-act="again"]')?.focus())
  }

  private renderResults(r: RaceResult): void {
    const two = r.players.length > 1
    const best = two ? [...r.players].sort((a, b) => a.place - b.place)[0] : undefined
    const head = best
      ? this.t('results.winner', { player: this.t(`hud.p${best.slot}`) })
      : r.place === 1
        ? this.t('results.win')
        : r.place <= 3
          ? this.t('results.podium')
          : this.t('results.place', { place: this.placeText(r.place) })
    // Split screen: the big badge belongs to whoever won the head-to-head.
    const badge = best ? best.place : r.place
    const el = this.q('results', '[data-results]')
    const rows = r.rows
      .map(
        (row, i) =>
          `<li class="${row.me ? 'me' : ''}" style="--i:${i};--c:${characterById(row.character).ui}"><b class="pos p${row.place}">${row.place}</b>${this.avatar(row.character)}<span class="nm">${esc(this.t(`char.${row.character}.name`))}${two && row.slot ? ` <span class="ptag ptag-${row.slot}">${esc(this.t(`hud.p${row.slot}`))}</span>` : row.me ? ` <em>${esc(this.save.data.playerName)}</em>` : ''}</span><span class="mono">${row.estimated ? `<small>${esc(this.t('results.estimated'))}</small> ` : ''}${formatTime(row.time)}</span></li>`,
      )
      .join('')
    el.innerHTML = `
      <div class="panel res-main place-${Math.min(4, badge)}">
        <div class="res-badge"><b>${badge}</b><span>${esc(this.i18n.locale === 'en' ? ordinalSuffix(badge) : '')}</span></div>
        <h2 class="res-head">${esc(head)}</h2>
        ${
          two
            ? `<div class="res-stats res-two">${r.players
                .map(p => `<div><span class="ptag ptag-${p.slot}">${esc(this.t(`hud.p${p.slot}`))}</span><b>${esc(this.placeText(p.place))}</b><b class="mono">${formatTime(p.time)}</b></div>`)
                .join('')}</div>`
            : `<div class="res-stats"><div><span>${esc(this.t('results.time'))}</span><b class="mono">${formatTime(r.time)}</b></div><div><span>${esc(this.t('results.bestLap'))}</span><b class="mono">${r.bestLap ? formatTime(r.bestLap) : '—'}</b></div></div>`
        }
        ${r.unranked ? `<p class="res-unranked">${esc(this.t(two ? 'results.local' : 'results.unranked'))}</p>` : `<div class="res-save" data-save>
          <label><span>${esc(this.t('results.name'))}</span><input type="text" maxlength="16" data-nav data-name value="${esc(this.save.data.playerName)}"></label>
          <button class="btn btn-small" data-nav data-act="save-name">${esc(this.t('results.save'))}</button>
        </div>`}
        <p class="res-rank" data-rank></p>
        <div class="res-actions">
          <button class="btn btn-primary" data-nav data-act="again"><span>${esc(this.t('menu.again'))}</span></button>
          <button class="btn" data-nav data-act="change"><span>${esc(this.t('menu.change'))}</span></button>
          <button class="btn" data-nav data-act="title"><span>${esc(this.t('menu.title'))}</span></button>
        </div>
      </div>
      <div class="panel res-table"><h3 class="panel-title">${esc(this.t('results.title'))}</h3><ol>${rows}</ol></div>`
    const name = el.querySelector<HTMLInputElement>('[data-name]')
    name?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.saveResult()
      }
      e.stopPropagation()
    })
    if (this.resultSaved) this.markSaved()
  }

  private saveResult(): void {
    if (!this.result || this.resultSaved) return
    if (this.result.unranked) return
    const input = this.current().querySelector<HTMLInputElement>('[data-name]')
    const name = (input?.value.trim() || 'PLAYER').slice(0, 16)
    const r = this.result
    const { board, rank } = insertEntry(this.save.data.leaderboard, { name, character: r.character, time: r.time, place: r.place, bestLap: r.bestLap, at: Date.now(), track: this.save.data.track })
    this.save.update({ leaderboard: board, playerName: name })
    this.resultSaved = true
    this.savedRank = rank
    this.audio.play(rank >= 0 ? 'lap' : 'uiSelect')
    this.markSaved()
    this.current().querySelector<HTMLElement>('[data-act="again"]')?.focus()
  }

  private savedRank = -1

  private markSaved(): void {
    const box = this.current().querySelector<HTMLElement>('[data-save]')
    if (box) box.innerHTML = `<span class="saved">✓ ${esc(this.t('results.saved'))}</span>`
    const rank = this.current().querySelector<HTMLElement>('[data-rank]')
    if (rank) rank.textContent = this.savedRank >= 0 ? this.t('results.rank', { rank: this.savedRank + 1 }) : this.t('results.norank')
  }

  // ─── HUD ─────────────────────────────────────────────────────────

  updateHud(s: HudState, dt: number): void {
    const slot = s.slot
    const v = this.views.get(slot)!
    if (slot === 1) this.lastHud = s
    const q = (sel: string) => this.qv(slot, sel)
    // Place.
    if (s.place !== v.lastPlace) {
      const num = q('[data-place-num]')
      const suf = q('[data-place-suf]')
      num.textContent = String(s.place)
      suf.textContent = this.i18n.locale === 'en' ? ordinalSuffix(s.place) : '名'
      const place = q('[data-place]')
      place.dataset.p = String(Math.min(4, s.place))
      place.classList.toggle('zh', this.i18n.locale !== 'en')
      if (v.lastPlace) retrigger(place, 'pop')
      v.lastPlace = s.place
    }
    q('[data-lap]').textContent = `${s.lap}/${s.laps}`
    q('[data-time]').textContent = formatTime(s.time)
    q('[data-speed]').textContent = String(Math.round(s.speed * 3.6))
    // Item slot + roulette.
    const itemSlot = q('[data-itemslot]')
    const icon = q('[data-item-icon]')
    const name = q('[data-item-name]')
    const key = q('[data-item-key]')
    if (s.rolling) {
      v.rouletteTimer -= dt
      if (v.rouletteTimer <= 0) {
        v.rouletteTimer = 0.07
        v.rouletteIndex = (v.rouletteIndex + 1) % ITEM_KINDS.length
        icon.innerHTML = ITEM_ICONS[ITEM_KINDS[v.rouletteIndex]]
        this.audio.play('tick')
      }
      itemSlot.className = 'itemslot rolling'
      name.textContent = ''
      key.innerHTML = ''
    } else if (s.item) {
      if (itemSlot.dataset.item !== s.item || !itemSlot.classList.contains('ready')) {
        icon.innerHTML = ITEM_ICONS[s.item]
        itemSlot.className = 'itemslot ready'
        retrigger(itemSlot, 'pop')
      }
      // Triple Pepper counts down its uses.
      const label = this.t(`item.${s.item}`) + (s.charges > 1 ? ` ×${s.charges}` : '')
      if (name.textContent !== label) name.textContent = label
      const d = s.device
      const cap = d ? (d.kind === 'pad' ? PAD_GLYPH.X : keyCap(KEY_SETS[d.set].caps.item, KEY_SETS[d.set].caps.item.length > 1)) : this.input.method === 'gamepad' ? PAD_GLYPH.X : keyCap('Space', true)
      key.innerHTML = this.input.method === 'touch' && !s.split ? '' : this.t('hud.useItem', { key: cap })
    } else if (itemSlot.dataset.item || itemSlot.classList.contains('ready') || itemSlot.classList.contains('rolling')) {
      icon.innerHTML = ''
      itemSlot.className = 'itemslot'
      name.textContent = ''
      key.innerHTML = ''
    }
    itemSlot.dataset.item = s.rolling ? '' : (s.item ?? '')
    itemSlot.classList.toggle('shielded', s.shield > 0)
    // Drift meter.
    const drift = q('[data-drift]')
    drift.classList.toggle('on', s.drifting)
    drift.dataset.tier = String(s.driftTier)
    const bars = drift.querySelectorAll<HTMLElement>('i')
    bars.forEach((b, i) => b.style.setProperty('--f', String(Math.max(0, Math.min(1, s.driftCharge - i)))))
    // Speed lines + warnings.
    const lines = q('[data-speedlines]')
    lines.style.opacity = s.boost ? '0.85' : s.speed > 26 ? String(Math.min(0.35, (s.speed - 26) / 20)) : '0'
    const warn = q('[data-warn]')
    const w = s.wrongWay ? this.t('hud.wrongWay') : s.beeWarning ? this.t('hud.beeWarning') : ''
    if (warn.textContent !== w) warn.textContent = w
    warn.classList.toggle('on', !!w)
    warn.classList.toggle('bee', !s.wrongWay && s.beeWarning)
    // Toast timer.
    if (v.toastTimer > 0) {
      v.toastTimer -= dt
      if (v.toastTimer <= 0) q('[data-toast]').classList.remove('on')
    }
    q('').classList.toggle('done', s.finished)
    // Split screen: each tag names that player's controls.
    const dev = q('[data-dev]')
    const label = s.device ? ` · ${s.device.kind === 'pad' ? `🎮${s.device.index + 1}` : SHORT_KEYS[s.device.set]}` : ''
    if (dev.textContent !== label) dev.textContent = label
    if (slot !== 1) return
    // Shared overlays (one per screen): controls card, skip button, minimap.
    const tut = this.q('hud', '[data-tutorial]')
    const showTut = this.tutorialShown && (s.phase === 'intro' || s.phase === 'countdown')
    tut.classList.toggle('on', showTut)
    const skip = this.q('hud', '[data-skip]')
    const skipOn = s.phase === 'intro'
    skip.classList.toggle('on', skipOn)
    if (skipOn && !skip.innerHTML) skip.innerHTML = `<button class="btn btn-small" data-act="skip">${this.t('hint.skip', { ok: this.input.method === 'gamepad' ? PAD_GLYPH.A : this.input.method === 'touch' ? '▶' : keyCap('Enter', true) })}</button>`
    if (!skipOn && skip.innerHTML) skip.innerHTML = ''
    this.drawMap(s)
  }

  private drawMap(s: HudState): void {
    if (!this.outline) return
    const c = this.mapCanvas
    const W = c.width
    const pad = 16
    const b = this.mapBounds
    const scale = (W - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
    const ox = pad + ((W - pad * 2) - (b.maxX - b.minX) * scale) / 2
    const oz = pad + ((W - pad * 2) - (b.maxZ - b.minZ) * scale) / 2
    // World +X points right on screen when looking from above with +Z down; flip X so the map matches the 3D view from the start.
    const px = (x: number) => W - (ox + (x - b.minX) * scale)
    const pz = (z: number) => oz + (z - b.minZ) * scale
    if (!this.mapBase) {
      const base = document.createElement('canvas')
      base.width = base.height = W
      const g = base.getContext('2d')!
      const path = (pts: [number, number][], close: boolean) => {
        g.beginPath()
        pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))))
        if (close) g.closePath()
      }
      g.lineJoin = g.lineCap = 'round'
      for (const [pts, close, w1, w2, col] of [
        [this.outline.short, false, 11, 6, '#ffd1ec'],
        [this.outline.main, true, 15, 9, '#fff6ec'],
      ] as [[number, number][], boolean, number, number, string][]) {
        path(pts, close)
        g.strokeStyle = '#2b1633'
        g.lineWidth = w1
        g.stroke()
        g.strokeStyle = col
        g.lineWidth = w2
        g.stroke()
      }
      const [sx, sz] = this.outline.main[0]
      g.fillStyle = '#2b1633'
      g.fillRect(px(sx) - 7, pz(sz) - 2.5, 14, 5)
      g.fillStyle = '#fff'
      g.fillRect(px(sx) - 6, pz(sz) - 1.5, 5, 3)
      g.fillRect(px(sx) + 1, pz(sz) - 1.5, 5, 3)
      this.mapBase = base
    }
    const g = c.getContext('2d')!
    g.clearRect(0, 0, W, W)
    g.drawImage(this.mapBase, 0, 0)
    const dots = [...s.map].sort((a, b2) => Number(a.me) - Number(b2.me) || b2.place - a.place)
    for (const d of dots) {
      const r = d.me ? 8 : 6
      g.beginPath()
      g.arc(px(d.x), pz(d.z), r, 0, Math.PI * 2)
      g.fillStyle = d.color
      g.fill()
      g.lineWidth = d.me ? 3.5 : 2.5
      g.strokeStyle = d.me ? (s.split ? PLAYER_COLORS[d.slot as PlayerSlot] : '#ffffff') : '#2b1633'
      g.stroke()
    }
  }

  countdown(n: number): void {
    const el = this.q('hud', '[data-count]')
    el.textContent = n > 0 ? String(n) : ''
    el.dataset.n = String(n)
    if (n > 0) retrigger(el, 'go')
  }

  /** No slot = every view (GO!, solo finish). */
  banner(kind: 'lap' | 'final' | 'go' | 'finish' | 'wrong', vars: Record<string, string | number> = {}, slot?: PlayerSlot): void {
    const text = kind === 'go' ? this.t('hud.go') : kind === 'lap' ? this.t('hud.lapBanner', vars) : kind === 'final' ? this.t('hud.finalLap') : kind === 'finish' ? this.t('hud.finish') : this.t('hud.wrongWay')
    for (const s of slot ? [slot] : SLOTS) {
      const el = this.qv(s, '[data-banner]')
      el.textContent = text
      el.className = `banner k-${kind}`
      retrigger(el, 'show')
    }
  }

  toast(key: string, vars: Record<string, string | number> = {}, slot: PlayerSlot = 1): void {
    const v: Record<string, string | number> = {}
    for (const [k, val] of Object.entries(vars)) v[k] = typeof val === 'string' && val.startsWith('char.') ? this.t(val) : val
    const el = this.qv(slot, '[data-toast]')
    el.textContent = this.t(key, v)
    retrigger(el, 'on')
    this.views.get(slot)!.toastTimer = 1.6
  }

  /** Lightning flash over the whole screen. */
  flash(): void {
    let el = this.root.querySelector<HTMLElement>('.flash')
    if (!el) {
      el = h('<div class="flash" aria-hidden="true"></div>')
      this.root.appendChild(el)
    }
    retrigger(el, 'on')
  }

  hurt(kind: 'bee' | 'taffy' | 'blocked', slot: PlayerSlot = 1): void {
    const v = this.qv(slot, '[data-vignette]')
    v.dataset.kind = kind
    retrigger(v, 'on')
    if (kind === 'blocked') this.toast('toast.blocked', {}, slot)
  }

  placeChange(up: boolean, slot: PlayerSlot = 1): void {
    if (up) this.toast('toast.overtake', {}, slot)
  }

  itemReady(_kind: ItemKind): void {
    // The slot pop animation already signals it.
  }

  hint(hint: Hint): void {
    this.hintKey = hint
    const el = this.q('hud', '[data-hint]')
    if (hint === 'none') {
      el.classList.remove('on')
      return
    }
    const m = this.input.method
    const caps = {
      up: m === 'keyboard' ? `${keyCap('W')}/${keyCap('↑')}` : '',
      left: keyCap('A'),
      right: keyCap('D'),
      shift: keyCap('Shift', true),
      space: keyCap('Space', true),
      rt: PAD_GLYPH.RT,
      lt: PAD_GLYPH.LT,
      rb: PAD_GLYPH.RB,
      x: PAD_GLYPH.X,
      stick: PAD_GLYPH.LS,
    }
    const perMethod = hint === 'drive' || hint === 'drift' || hint === 'item'
    const key = perMethod ? `hint.${hint}.${m}` : `hint.${hint}`
    el.innerHTML = this.t(key, caps)
    retrigger(el, 'on')
  }

  /** First-run control card shown during the flyover/countdown. */
  showTutorial(on: boolean, devices?: Device[]): void {
    this.tutorialShown = on
    this.raceDevices = devices ?? []
    if (!on) return
    if (devices && devices.length > 1) {
      // One column per local player, showing exactly their own controls.
      const col = (d: Device, row: 'steer' | 'gas' | 'brake' | 'drift' | 'item' | 'look') => {
        if (d.kind === 'pad') return { steer: PAD_GLYPH.LS, gas: `${PAD_GLYPH.A}`, brake: PAD_GLYPH.B, drift: PAD_GLYPH.RB, item: PAD_GLYPH.X, look: keyCap('R3') }[row]
        const c = KEY_SETS[d.set].caps
        const cap = (v: string) => keyCap(v, v.length > 1)
        return { steer: `${cap(c.left)}${cap(c.right)}`, gas: cap(c.accelerate), brake: cap(c.brake), drift: cap(c.drift), item: cap(c.item), look: cap(c.lookBack) }[row]
      }
      const rows: [string, 'steer' | 'gas' | 'brake' | 'drift' | 'item' | 'look'][] = [
        ['tutorial.steer', 'steer'],
        ['tutorial.gas', 'gas'],
        ['tutorial.brake', 'brake'],
        ['tutorial.drift', 'drift'],
        ['tutorial.item', 'item'],
        ['tutorial.lookBack', 'look'],
      ]
      const head = devices.map((_, i) => `<span class="ptag ptag-${i + 1}">${esc(this.t(`hud.p${i + 1}`))}</span>`).join('')
      this.q('hud', '[data-tutorial]').innerHTML = `<h3 class="panel-title">${esc(this.t('tutorial.title'))}</h3><ul class="multi" style="--cols:${devices.length}"><li class="head"><span></span>${head}</li>${rows
        .map(([k, row]) => `<li><span>${esc(this.t(k))}</span>${devices.map(d => `<span class="keys">${col(d, row)}</span>`).join('')}</li>`)
        .join('')}</ul><p class="tip">${esc(this.t('tutorial.multiTip'))}</p>`
      return
    }
    const m = this.input.method
    const rows: [string, string][] =
      m === 'gamepad'
        ? [
            ['tutorial.steer', PAD_GLYPH.LS],
            ['tutorial.gas', PAD_GLYPH.RT],
            ['tutorial.brake', PAD_GLYPH.LT],
            ['tutorial.drift', PAD_GLYPH.RB],
            ['tutorial.item', PAD_GLYPH.X],
            ['tutorial.pause', PAD_GLYPH.START],
          ]
        : m === 'touch'
          ? [
              ['tutorial.steer', '<kbd class="cap wide">◀ ▶</kbd>'],
              ['tutorial.drift', `<kbd class="cap wide">${this.t('touch.drift')}</kbd>`],
              ['tutorial.item', `<kbd class="cap wide">${this.t('touch.item')}</kbd>`],
              ['tutorial.brake', `<kbd class="cap wide">${this.t('touch.brake')}</kbd>`],
            ]
          : [
              ['tutorial.steer', `${keyCap('A')}${keyCap('D')} / ${keyCap('←')}${keyCap('→')}`],
              ['tutorial.gas', `${keyCap('W')} / ${keyCap('↑')}`],
              ['tutorial.brake', `${keyCap('S')} / ${keyCap('↓')}`],
              ['tutorial.drift', keyCap('Shift', true)],
              ['tutorial.item', keyCap('Space', true)],
              ['tutorial.pause', keyCap('Esc', true)],
            ]
    this.q('hud', '[data-tutorial]').innerHTML = `<h3 class="panel-title">${esc(this.t('tutorial.title'))}</h3><ul>${rows.map(([k, v]) => `<li><span>${esc(this.t(k))}</span><span class="keys">${v}</span></li>`).join('')}</ul><p class="tip">${esc(this.t('tutorial.tip1'))}</p><p class="tip">${esc(this.t('tutorial.tip2'))}</p><p class="tip">${esc(this.t('hint.startBoost'))}</p>`
  }

  resetHud(): void {
    const hud = this.screens.get('hud')!
    for (const sel of ['[data-count]', '[data-banner]', '[data-toast]', '[data-hint]']) {
      for (const el of hud.querySelectorAll<HTMLElement>(sel)) {
        el.classList.remove('on', 'show', 'go')
        if (sel === '[data-count]') el.textContent = ''
      }
    }
    this.hintKey = 'none'
    for (const slot of SLOTS) {
      const v = this.views.get(slot)!
      v.lastPlace = 0
      v.toastTimer = 0
      const itemSlot = this.qv(slot, '[data-itemslot]')
      itemSlot.className = 'itemslot'
      itemSlot.dataset.item = ''
      this.qv(slot, '[data-item-icon]').innerHTML = ''
      this.qv(slot, '[data-item-name]').textContent = ''
      this.qv(slot, '').classList.remove('done')
    }
  }

  // ─── navigation ──────────────────────────────────────────────────

  /** Per-frame: gamepad navigation for menus. */
  frame(dt: number): void {
    this.navCooldown -= dt
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.screen === 'lobby') return this.lobbyFrame()
    const m = this.input.move
    if (Math.abs(m.x) < 0.5 && Math.abs(m.y) < 0.5) this.navCooldown = Math.min(this.navCooldown, 0)
    if (this.navCooldown <= 0 && this.input.method === 'gamepad') {
      if (m.y > 0.6) this.nav('up')
      else if (m.y < -0.6) this.nav('down')
      else if (m.x > 0.6) this.nav('right')
      else if (m.x < -0.6) this.nav('left')
      else return this.padButtons()
      this.navCooldown = 0.2
    }
    this.padButtons()
  }

  private padButtons(): void {
    if (this.input.method !== 'gamepad') return
    if (this.input.consume('confirm')) {
      const el = document.activeElement as HTMLElement | null
      if (el && this.current().contains(el)) el.click()
    }
    if (this.input.consume('back')) this.back()
    if (this.screen === 'pause' && this.input.consume('pause')) this.actions.resume()
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    const target = e.target as HTMLElement
    const typing = target instanceof HTMLInputElement && target.type === 'text'
    if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) {
      if (this.screen === 'pause') return // main handles pause toggle
      e.preventDefault()
      this.back()
      return
    }
    // In the lobby every key belongs to someone's driving zone; menu shortcuts stay off.
    if (this.screen === 'lobby') {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') e.preventDefault()
      return
    }
    if (typing) return
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }[e.code] as 'up' | 'down' | 'left' | 'right' | undefined
    if (dir) {
      e.preventDefault()
      this.nav(dir)
    }
    if ((e.code === 'Space' || e.code === 'Enter') && target?.matches?.('[data-nav]')) {
      e.preventDefault()
      target.click()
    }
  }

  private nav(dir: 'up' | 'down' | 'left' | 'right'): void {
    const scr = this.current()
    const items = [...scr.querySelectorAll<HTMLElement>('[data-nav]')].filter(el => el.offsetParent !== null)
    if (!items.length) return
    const active = document.activeElement as HTMLElement
    const idx = items.indexOf(active)
    if (idx < 0) {
      items[0].focus()
      return
    }
    // Sliders and segmented options consume left/right.
    if ((dir === 'left' || dir === 'right') && active instanceof HTMLInputElement && active.type === 'range') {
      const step = Number(active.step) || 0.1
      active.value = String(Number(active.value) + (dir === 'right' ? step : -step))
      active.dispatchEvent(new Event('input'))
      return
    }
    // Spatial navigation: nearest element in the pressed direction.
    const r0 = active.getBoundingClientRect()
    const cx = r0.left + r0.width / 2
    const cy = r0.top + r0.height / 2
    let best: HTMLElement | null = null
    let bestScore = Infinity
    for (const el of items) {
      if (el === active) continue
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const dx = x - cx
      const dy = y - cy
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy)
      if (along <= 4) continue
      const score = along + across * 2.2
      if (score < bestScore) {
        bestScore = score
        best = el
      }
    }
    if (best) {
      best.focus({ preventScroll: true })
      this.audio.play('uiMove')
    }
  }

  get hud(): HudState | undefined {
    return this.lastHud
  }
}

/** Outline colours that mark P1 / P2 on the minimap (match the .ptag badges). */
const PLAYER_COLORS: Record<PlayerSlot, string> = { 1: '#ffd23f', 2: '#62d8ff', 3: '#ff7aa2', 4: '#7ee06e' }
const SHORT_KEYS = ['WASD', '↑←↓→', 'IJKL', 'NUM']

function fmtRange(key: keyof SaveData, v: number): string {
  return key === 'sensitivity' ? `${v.toFixed(1)}×` : `${Math.round(v * 100)}%`
}

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

const lengthCache = new Map<string, number>()
function trackLength(def: TrackDef): number {
  let L = lengthCache.get(def.id)
  if (L === undefined) {
    L = new TrackSpline(def.points.map(([x, z, y]) => ({ x, y, z })), { closed: true, step: 4 }).length
    lengthCache.set(def.id, L)
  }
  return L
}

/** Which set pieces a circuit has, for the chips on its card. */
function trackHazards(def: TrackDef): string[] {
  const out: string[] = []
  if (def.ramps?.some(r => r.gap)) out.push('gap')
  else if (def.ramps?.length) out.push('ramp')
  if (def.bridges?.length) out.push('bridge')
  if (def.halls?.length) out.push('press')
  if (def.spinners?.length) out.push('spinner')
  for (const k of new Set((def.movers ?? []).map(m => (m.kind === 'car' || m.kind === 'bus' ? 'traffic' : m.kind === 'cart' ? 'carts' : m.kind)))) out.push(k)
  for (const k of new Set((def.crossers ?? []).map(c => c.kind))) out.push(`x${k}`)
  if (def.geysers?.length) out.push('geyser')
  if (def.slick?.length) out.push(`slick_${def.theme}`)
  return out
}

/** Small top-down outline of a circuit, as inline SVG. */
function trackThumb(def: TrackDef): string {
  const sp = new TrackSpline(def.points.map(([x, z, y]) => ({ x, y, z })), { closed: true, step: 6 })
  const xs = sp.samples.map(p => p.pos.x)
  const zs = sp.samples.map(p => p.pos.z)
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const W = 200
  const H = 120
  const k = Math.min((W - 24) / (maxX - minX), (H - 24) / (maxZ - minZ))
  const ox = (W - (maxX - minX) * k) / 2
  const oz = (H - (maxZ - minZ) * k) / 2
  const pts = sp.samples.map(p => `${(W - (ox + (p.pos.x - minX) * k)).toFixed(1)},${(oz + (p.pos.z - minZ) * k).toFixed(1)}`).join(' ')
  const s0 = sp.samples[0].pos
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><polygon points="${pts}" fill="none" stroke="#2b1633" stroke-width="9" stroke-linejoin="round"/><polygon points="${pts}" fill="none" stroke="#fff6ec" stroke-width="4.5" stroke-linejoin="round"/><circle cx="${(W - (ox + (s0.x - minX) * k)).toFixed(1)}" cy="${(oz + (s0.z - minZ) * k).toFixed(1)}" r="5" fill="var(--c)" stroke="#2b1633" stroke-width="2"/></svg>`
}
