/**
 * 背景音乐。
 *
 * 完全用 Web Audio 现场合成，不加载任何音频文件：
 *  · 这个 App 是离线优先的，塞几 MB 的 mp3 既撑大包体，又要处理音乐授权
 *  · 现场合成零体积、零版权、断网照响
 *
 * 八种音色：两种旋律 + 四种噪声（雨／浪／风／火）+ 白噪 + 暖垫。详见 PRESETS。
 */

const KEY_ON = 'scoop.music'
const KEY_VOL = 'scoop.music.volume'
const KEY_PRESET = 'scoop.music.preset'

/** 大调五声音阶的半音偏移。五声音阶怎么随机挑都不会难听，这是关键 */
const SCALE = [0, 2, 4, 7, 9]
/** A3 —— 整首曲子的根音 */
const ROOT = 220
/** 音量 100 时主增益的满值。压得低，背景音盖过内容比没有更糟 */
const MAX_GAIN = 0.2
const DEFAULT_VOLUME = 50

/**
 * 噪声缓冲的长度（秒）。
 *
 * 这里原来是 2 秒 —— 每 2 秒循环一次，等于一个 0.5Hz 的周期脉冲，
 * 听起来就是发动机。加到 12 秒之后循环周期降到 0.08Hz，基本听不出了。
 * 另外首尾必须交叉淡化，否则接缝处会"咔"一下。
 */
const NOISE_SECONDS = 12
const NOISE_FADE = 0.75

type Listener = () => void

/** 噪声层：白噪经过怎样的染色，要不要起伏和颗粒 */
export interface NoiseSpec {
  /** 高通截止。必须给 —— 不切掉低频就是一团轰隆，那才是"发动机"的来源 */
  hp: number
  /** 低通截止 */
  lp: number
  q?: number
  level: number
  /** 缓慢起伏的频率（Hz）。海浪要慢而深，白噪完全不要 */
  swellHz?: number
  /** 起伏深度 0~0.9 */
  swellDepth?: number
  /** 随机颗粒：雨滴、火星 */
  grains?: { perSec: number; gain: number; dur: [number, number]; freq: [number, number] }
}

export interface MusicPreset {
  id: string
  name: string
  hint: string
  /** 音符间隔范围（ms）。不填就是没有旋律 */
  every?: [number, number]
  /** 音区：相对 ROOT 的八度倍数，随机取一个 */
  octaves?: number[]
  /** 每个音的衰减时长范围（秒） */
  decay?: [number, number]
  /** 单音音量 */
  noteGain?: number
  /** 泛音：[倍频, 相对音量, 衰减系数]。第二个泛音定音色是"铃"还是"木" */
  partials?: Array<[number, number, number]>
  /** 持续音层：低频振荡器 + 极慢呼吸 */
  pad?: { mults: number[]; level: number }
  /** 噪声层 */
  noise?: NoiseSpec
}

export const PRESETS: MusicPreset[] = [
  {
    id: 'musicbox',
    name: '八音盒',
    hint: '清亮的单音，像冬天窗边的音乐盒',
    every: [1100, 3700],
    octaves: [2, 4],
    decay: [4.5, 7.5],
    noteGain: 0.55,
    partials: [
      [1, 1, 1],
      [2, 0.26, 0.7],
      [3.01, 0.08, 0.45],
    ],
    pad: { mults: [0.5, 0.75, 1], level: 0.09 },
  },
  {
    id: 'chime',
    name: '风铃',
    hint: '更疏、更高、拖得更长',
    every: [2600, 6500],
    octaves: [4, 8],
    decay: [7, 12],
    noteGain: 0.4,
    partials: [
      [1, 1, 1],
      [2.76, 0.18, 0.5],
      [5.4, 0.07, 0.3],
    ],
    pad: { mults: [0.5, 1], level: 0.05 },
  },
  {
    id: 'rain',
    name: '雨声',
    hint: '屋檐下的雨，带零星水滴',
    // 高通 480 是关键：把轰隆的低频切掉，剩下的才是"雨"
    noise: {
      hp: 480,
      lp: 7200,
      q: 0.6,
      level: 0.42,
      swellHz: 0.07,
      swellDepth: 0.12,
      grains: { perSec: 16, gain: 0.26, dur: [0.03, 0.08], freq: [1800, 6000] },
    },
    pad: { mults: [0.25, 0.5], level: 0.04 },
  },
  {
    id: 'waves',
    name: '海浪',
    hint: '一浪一浪，慢而宽',
    noise: { hp: 90, lp: 800, q: 0.8, level: 0.6, swellHz: 0.075, swellDepth: 0.62 },
    pad: { mults: [0.25], level: 0.05 },
  },
  {
    id: 'wind',
    name: '风声',
    hint: '远处过林子的风',
    noise: { hp: 180, lp: 1100, q: 1.2, level: 0.5, swellHz: 0.043, swellDepth: 0.5 },
  },
  {
    id: 'fire',
    name: '篝火',
    hint: '低低的火声，偶尔噼啪一下',
    noise: {
      hp: 60,
      lp: 420,
      q: 0.7,
      level: 0.4,
      swellHz: 0.11,
      swellDepth: 0.2,
      grains: { perSec: 7, gain: 0.5, dur: [0.04, 0.13], freq: [900, 3200] },
    },
    pad: { mults: [0.25], level: 0.05 },
  },
  {
    id: 'white',
    name: '白噪',
    hint: '最中性的底噪，用来盖住环境音',
    noise: { hp: 120, lp: 5200, q: 0.5, level: 0.32 },
  },
  {
    id: 'pad',
    name: '暖垫',
    hint: '没有旋律，只有一层慢慢呼吸的底',
    pad: { mults: [0.5, 0.75, 1, 1.5], level: 0.13 },
  },
]

function semi(root: number, n: number): number {
  return root * Math.pow(2, n / 12)
}

function readNum(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 隐私模式下存不下，本次会话仍然生效
  }
}

class MusicEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noteBus: AudioNode | null = null
  private bedGain: GainNode | null = null
  private bedNodes: Array<{ stop?: () => void; disconnect: () => void }> = []
  private noiseBuffer: AudioBuffer | null = null
  private scheduler: number | null = null
  private grainTimer: number | null = null
  private noteListeners = new Set<Listener>()
  private stateListeners = new Set<Listener>()

  private on = (() => {
    try {
      return localStorage.getItem(KEY_ON) === '1'
    } catch {
      return false
    }
  })()
  private volume = readNum(KEY_VOL, DEFAULT_VOLUME)
  private presetId = (() => {
    try {
      const id = localStorage.getItem(KEY_PRESET)
      return PRESETS.some((p) => p.id === id) ? (id as string) : PRESETS[0].id
    } catch {
      return PRESETS[0].id
    }
  })()

  isEnabled(): boolean {
    return this.on
  }
  getVolume(): number {
    return this.volume
  }
  getPresetId(): string {
    return this.presetId
  }
  getPreset(): MusicPreset {
    return PRESETS.find((p) => p.id === this.presetId) ?? PRESETS[0]
  }

  /** 每次发声时回调一次，用来让树上的花跟着亮一下 */
  onNote(fn: Listener): () => void {
    this.noteListeners.add(fn)
    return () => this.noteListeners.delete(fn)
  }
  onStateChange(fn: Listener): () => void {
    this.stateListeners.add(fn)
    return () => this.stateListeners.delete(fn)
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(100, Math.round(v)))
    write(KEY_VOL, String(this.volume))
    if (this.ctx && this.master && this.on) {
      this.master.gain.setTargetAtTime(this.targetGain(), this.ctx.currentTime, 0.15)
    }
    this.emit()
  }

  setPreset(id: string): void {
    if (!PRESETS.some((p) => p.id === id) || id === this.presetId) return
    this.presetId = id
    write(KEY_PRESET, id)
    if (this.ctx && this.on) {
      this.stopSchedulers()
      this.rebuildBed()
      this.scheduleNext(700)
    }
    this.emit()
  }

  toggle(): void {
    if (this.on) this.disable()
    else void this.enable()
  }

  async enable(): Promise<void> {
    if (!this.ctx) this.build()
    const ctx = this.ctx!
    // 必须在用户手势里 resume，否则浏览器会挂起音频上下文
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.on) return
    this.on = true
    const t = ctx.currentTime
    // 慢淡入：突然出声很吓人
    this.master!.gain.cancelScheduledValues(t)
    this.master!.gain.setTargetAtTime(this.targetGain(), t, 1.2)
    this.bedGain!.gain.setTargetAtTime(1, t, 2.5)
    this.scheduleNext(600)
    write(KEY_ON, '1')
    this.emit()
  }

  disable(): void {
    if (!this.on) return
    this.on = false
    this.stopSchedulers()
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(t)
      this.master.gain.setTargetAtTime(0, t, 0.5)
      this.bedGain?.gain.setTargetAtTime(0, t, 0.6)
    }
    write(KEY_ON, '0')
    this.emit()
  }

  /** 切到后台就挂起，省电；回来再续上 */
  handleVisibility(): void {
    if (!this.ctx) return
    if (document.hidden) {
      if (this.ctx.state === 'running') void this.ctx.suspend()
    } else if (this.on && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  private targetGain(): number {
    return (this.volume / 100) * MAX_GAIN
  }

  private emit(): void {
    this.stateListeners.forEach((fn) => fn())
  }

  private stopSchedulers(): void {
    if (this.scheduler !== null) {
      window.clearTimeout(this.scheduler)
      this.scheduler = null
    }
    if (this.grainTimer !== null) {
      window.clearTimeout(this.grainTimer)
      this.grainTimer = null
    }
  }

  /** 第一次真正播放时才建图，避免用户从没开过音乐也占一个音频上下文 */
  private build(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.master = master

    // 音色总线：低通削掉高频毛刺 → 反馈延迟制造空间感
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2600
    tone.Q.value = 0.4
    tone.connect(master)
    this.noteBus = tone

    const delay = ctx.createDelay(2)
    delay.delayTime.value = 0.42
    const feedback = ctx.createGain()
    feedback.gain.value = 0.32
    const wet = ctx.createGain()
    wet.gain.value = 0.32
    tone.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(master)

    const bed = ctx.createGain()
    bed.gain.value = 0
    bed.connect(master)
    this.bedGain = bed

    this.rebuildBed()
  }

  /** 噪源缓冲：12 秒白噪，首尾交叉淡化。只生成一次，所有噪声音色共用 */
  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    // 尾巴淡进开头，循环接缝就听不出来了
    const fade = Math.floor(ctx.sampleRate * NOISE_FADE)
    for (let i = 0; i < fade; i++) {
      const t = i / fade
      d[i] = d[i] * t + d[len - fade + i] * (1 - t)
    }
    this.noiseBuffer = buf
    return buf
  }

  /** 按当前音色重建"底"这一层（持续音 + 噪声）。切音色时调用 */
  private rebuildBed(): void {
    const ctx = this.ctx
    const bed = this.bedGain
    if (!ctx || !bed) return
    for (const n of this.bedNodes) {
      try {
        n.stop?.()
      } catch {
        // 已经停了
      }
      n.disconnect()
    }
    this.bedNodes = []

    const preset = this.getPreset()

    if (preset.pad) {
      for (const mult of preset.pad.mults) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = ROOT * mult
        const g = ctx.createGain()
        g.gain.value = preset.pad.level / preset.pad.mults.length
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 0.04 + Math.random() * 0.05
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = g.gain.value * 0.5
        lfo.connect(lfoGain).connect(g.gain)
        osc.connect(g).connect(bed)
        osc.start()
        lfo.start()
        this.bedNodes.push(osc, lfo)
      }
    }

    if (preset.noise) this.buildNoise(ctx, bed, preset.noise)
  }

  private buildNoise(ctx: AudioContext, dest: AudioNode, cfg: NoiseSpec): void {
    const src = ctx.createBufferSource()
    src.buffer = this.getNoiseBuffer(ctx)
    src.loop = true

    let node: AudioNode = src
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = cfg.hp
    node = node.connect(hp)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cfg.lp
    lp.Q.value = cfg.q ?? 0.7
    node = node.connect(lp)

    const g = ctx.createGain()
    g.gain.value = cfg.level
    node.connect(g).connect(dest)

    if (cfg.swellHz && cfg.swellDepth) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = cfg.swellHz
      const lg = ctx.createGain()
      lg.gain.value = cfg.level * Math.min(0.9, cfg.swellDepth)
      lfo.connect(lg).connect(g.gain)
      lfo.start()
      this.bedNodes.push(lfo)
    }

    src.start()
    this.bedNodes.push(src)

    if (cfg.grains) this.scheduleGrain(cfg.grains)
  }

  /** 随机颗粒：雨滴打在檐上、火星爆一下。
      间隔必须随机 —— 规律了就又变成"机器声"了 */
  private scheduleGrain(spec: NonNullable<NoiseSpec['grains']>): void {
    const base = 1000 / spec.perSec
    const wait = base * (0.3 + Math.random() * 1.4)
    this.grainTimer = window.setTimeout(() => {
      this.grainTimer = null
      if (!this.on) return
      this.playGrain(spec)
      this.scheduleGrain(spec)
    }, wait)
  }

  private playGrain(spec: NonNullable<NoiseSpec['grains']>): void {
    const ctx = this.ctx
    const bed = this.bedGain
    const buf = this.noiseBuffer
    if (!ctx || !bed || !buf) return

    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = buf
    // 每次从缓冲里随便挑个位置，免得颗粒听起来一模一样
    const offset = Math.random() * Math.max(0.1, buf.duration - 0.3)
    const dur = spec.dur[0] + Math.random() * (spec.dur[1] - spec.dur[0])

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = spec.freq[0] + Math.random() * (spec.freq[1] - spec.freq[0])
    bp.Q.value = 1.3

    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(spec.gain * (0.3 + Math.random() * 0.7), t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    src.connect(bp).connect(g).connect(bed)
    src.start(t, offset, dur + 0.05)
    src.stop(t + dur + 0.06)
  }

  private scheduleNext(afterMs?: number): void {
    const preset = this.getPreset()
    if (!preset.every) return // 没有旋律的音色（各种噪声、暖垫）
    const [lo, hi] = preset.every
    const wait = afterMs ?? lo + Math.random() * (hi - lo)
    this.scheduler = window.setTimeout(() => {
      this.scheduler = null
      if (!this.on) return
      const octaves = preset.octaves ?? [2]
      const octave = octaves[Math.floor(Math.random() * octaves.length)]
      const deg = SCALE[Math.floor(Math.random() * SCALE.length)]
      this.playNote(semi(ROOT * octave, deg), preset)
      this.noteListeners.forEach((fn) => fn())
      this.scheduleNext()
    }, wait)
  }

  private playNote(freq: number, preset: MusicPreset): void {
    const ctx = this.ctx
    const bus = this.noteBus
    if (!ctx || !bus) return
    const t = ctx.currentTime
    const [dLo, dHi] = preset.decay ?? [4.5, 7.5]
    const dur = dLo + Math.random() * (dHi - dLo)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(preset.noteGain ?? 0.55, t + 0.012) // 极快起音 = 敲击感
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    env.connect(bus)

    for (const [mult, level, decay] of preset.partials ?? [[1, 1, 1]]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq * mult
      const g = ctx.createGain()
      g.gain.setValueAtTime(level, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay)
      osc.connect(g).connect(env)
      osc.start(t)
      osc.stop(t + dur + 0.1)
    }
  }
}

export const music = new MusicEngine()

/**
 * 浏览器不允许无交互自动播放。上次开着的话，等用户第一次点屏幕再启动 ——
 * 这个调用发生在手势回调里，能过自动播放限制。
 */
export function armMusicAutoStart(): void {
  if (!music.isEnabled()) return
  const start = () => {
    window.removeEventListener('pointerdown', start)
    void music.enable()
  }
  window.addEventListener('pointerdown', start, { once: true, passive: true })
}

export function watchMusicVisibility(): void {
  document.addEventListener('visibilitychange', () => music.handleVisibility())
}
