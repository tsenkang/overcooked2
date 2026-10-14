import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: false, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, bloom: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'medium'
  return 'high'
}

/**
 * Owns the WebGL renderer, the optional post-processing chain and resize handling.
 * Scenes call `render(scene, camera)`; they never touch the composer directly.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: this.preset.antialias, powerPreference: 'high-performance' })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.type = THREE.PCFShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  get shadowMapSize(): number {
    return this.preset.shadowMap
  }

  applyQuality(quality: Quality): void {
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio))
    this.bloom?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.resize()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer | undefined {
    if (!this.preset.bloom) return undefined
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.scene = scene
    this.camera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloom = new UnrealBloomPass(size, 0.45, 0.3, 1.6)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
    if (this.camera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }


  /**
   * Local split screen, laid out like a console kart racer: two players stack top/bottom; three
   * or four share quadrants (P1 top-left, P2 top-right, P3 bottom-left, P4 bottom-right; with
   * three the last quadrant is left for the map). `before(i)` runs ahead of each view, e.g. to
   * move the shadow frustum onto that player. Bloom is skipped; one composer per view costs too much.
   */
  renderViews(scene: THREE.Scene, cameras: THREE.PerspectiveCamera[], before?: (i: number) => void): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    const rects = splitRects(cameras.length, w, h)
    this.gl.setScissorTest(true)
    rects.forEach((r, i) => {
      const cam = cameras[i]
      if (!cam) {
        // Spare quadrant (three players): plain backdrop under the big map.
        this.gl.setScissor(r.x, r.y, r.w, r.h)
        this.gl.setViewport(r.x, r.y, r.w, r.h)
        const prev = this.gl.getClearColor(new THREE.Color())
        const alpha = this.gl.getClearAlpha()
        this.gl.setClearColor('#16384f', 1)
        this.gl.clear()
        this.gl.setClearColor(prev, alpha)
        return
      }
      const aspect = r.w / Math.max(1, r.h)
      if (Math.abs(cam.aspect - aspect) > 1e-3) {
        cam.aspect = aspect
        cam.updateProjectionMatrix()
      }
      before?.(i)
      this.gl.setScissor(r.x, r.y, r.w, r.h)
      this.gl.setViewport(r.x, r.y, r.w, r.h)
      this.gl.render(scene, cam)
    })
    this.gl.setScissorTest(false)
    this.gl.setViewport(0, 0, w, h)
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}

/** Viewports in CSS pixels, WebGL-style (y counts up from the bottom edge). */
function splitRects(players: number, w: number, h: number): { x: number; y: number; w: number; h: number }[] {
  const top = Math.floor(h / 2)
  if (players <= 2) {
    return [
      { x: 0, y: h - top, w, h: top },
      { x: 0, y: 0, w, h: h - top },
    ].slice(0, Math.max(1, players))
  }
  const left = Math.floor(w / 2)
  return [
    { x: 0, y: h - top, w: left, h: top },
    { x: left, y: h - top, w: w - left, h: top },
    { x: 0, y: 0, w: left, h: h - top },
    { x: left, y: 0, w: w - left, h: h - top },
  ]
}
