/** 发音：真人/合成音优先，失败回退系统 TTS。
 *  - 单词 / 常用短语：有道词典音频（真人词典音质，免费源里最好）
 *  - 长句：百度通用 TTS（分块播放，任意英文句子都能读）
 *  - PWA 环境 Service Worker 会缓存听过的音频，之后离线也能播
 *  注意：页面带 no-referrer 策略（百度按 Referer 反盗链，带 Referer 会返回 HTML 错误页） */

let currentAudio: HTMLAudioElement | null = null
let session = 0
let cachedVoice: SpeechSynthesisVoice | null = null
let cachedForLang = ''

/* ---------- 系统 TTS（最终回退） ---------- */

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  try {
    if (cachedVoice && cachedForLang === lang) return cachedVoice
    const voices = speechSynthesis.getVoices()
    if (!voices.length) return null
    const prefix = lang.split('-')[0]
    cachedVoice =
      voices.find((v) => v.lang.startsWith(prefix) && v.localService && /US|UK|GB/i.test(v.lang)) ??
      voices.find((v) => v.lang.startsWith(prefix) && v.localService) ??
      voices.find((v) => v.lang.startsWith(prefix)) ??
      null
    cachedForLang = lang
    return cachedVoice
  } catch {
    return null
  }
}

try {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = null
    cachedForLang = ''
  })
} catch {
  // ignore
}

function ttsAsync(text: string, lang: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      u.rate = rate
      const v = pickVoice(lang)
      if (v) u.voice = v
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speechSynthesis.speak(u)
    } catch {
      resolve()
    }
  })
}

/* ---------- 在线音频（主方案） ---------- */

function stopAudio() {
  if (currentAudio) {
    currentAudio.onerror = null
    currentAudio.onended = null
    try {
      currentAudio.pause()
    } catch {
      // ignore
    }
    currentAudio = null
  }
}

/** 打断当前播放（含 TTS）并开始新会话 */
function cancelAll() {
  session += 1
  stopAudio()
  try {
    speechSynthesis.cancel()
  } catch {
    // ignore
  }
  return session
}

const youdaoUrl = (word: string) =>
  `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`

const baiduUrl = (text: string) =>
  `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(text)}&spd=3&source=web`

function online(): boolean {
  try {
    return navigator.onLine !== false
  } catch {
    return true
  }
}

/** 依次尝试一组音频 URL；成功返回 true，被新会话打断返回 'aborted'，全失败返回 false */
function tryChain(urls: string[], my: number): Promise<boolean | 'aborted'> {
  return new Promise((resolve) => {
    let i = 0
    const next = () => {
      if (my !== session) return resolve('aborted')
      if (i >= urls.length) return resolve(false)
      const url = urls[i]
      i += 1
      let settled = false
      const fail = () => {
        if (settled) return
        settled = true
        next()
      }
      try {
        const a = new Audio()
        a.preload = 'auto'
        a.src = url
        currentAudio = a
        a.onended = () => {
          if (settled) return
          settled = true
          if (currentAudio === a) currentAudio = null
          resolve(true)
        }
        a.onerror = () => {
          if (settled) return
          settled = true
          if (currentAudio === a) currentAudio = null
          next()
        }
        const p = a.play()
        if (p && typeof p.catch === 'function') {
          p.catch((e: unknown) => {
            if ((e as { name?: string })?.name === 'AbortError') return
            if (settled) return
            settled = true
            if (currentAudio === a) currentAudio = null
            next()
          })
        }
      } catch {
        fail()
      }
    }
    next()
  })
}

/** 按词边界把文本拆成 ≤ maxLen 字符的小块 */
function chunkText(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxLen) {
      chunks.push(cur)
      cur = w
    } else {
      cur = cur ? cur + ' ' + w : w
    }
  }
  if (cur) chunks.push(cur)
  return chunks.length > 0 ? chunks : [text]
}

/* ---------- 对外接口 ---------- */

/** 朗读单词（英文）：有道真人音 → 百度 → 系统 TTS */
export function speakWord(word: string) {
  const text = word.trim()
  if (!text) return
  // 多词短语走句子逻辑（更稳）
  if (/\s/.test(text)) {
    speakSentence(text)
    return
  }
  const my = cancelAll()
  if (!online()) {
    void ttsAsync(text, 'en-US', 0.9)
    return
  }
  void (async () => {
    const ok = await tryChain([youdaoUrl(text), baiduUrl(text)], my)
    if (ok === false) await ttsAsync(text, 'en-US', 0.9)
  })()
}

/** 朗读整句（英文）：短句/短语优先有道词典音，长句百度通用 TTS 分块；块失败逐级回退到系统 TTS */
export function speakSentence(sentence: string) {
  const text = sentence.trim()
  if (!text) return
  const my = cancelAll()
  if (!online()) {
    void ttsAsync(text, 'en-US', 0.85)
    return
  }
  void (async () => {
    if (text.length <= 24) {
      // 短句：词典音质优先
      const ok = await tryChain([youdaoUrl(text), baiduUrl(text)], my)
      if (ok === false) await ttsAsync(text, 'en-US', 0.85)
      return
    }
    const chunks = chunkText(text, 100)
    for (const c of chunks) {
      if (my !== session) return
      const ok = await tryChain([baiduUrl(c), youdaoUrl(c)], my)
      if (ok === 'aborted') return
      if (ok === false) await ttsAsync(c, 'en-US', 0.85)
    }
  })()
}

/** 朗读中文（TTS） */
export function speakZh(text: string) {
  const t = text.trim()
  if (!t) return
  const my = cancelAll()
  void (async () => {
    if (my !== session) return
    await ttsAsync(t, 'zh-CN', 1)
  })()
}

/** 预加载单词真人发音（提前请求，PWA 环境自动缓存 → 点击秒播 + 离线可播） */
export function prefetchWordAudio(word: string) {
  const text = word.trim()
  if (!text || !online()) return
  if (/\s/.test(text) && text.length > 24) return // 长句不预取（发音时再按需请求）
  try {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.src = youdaoUrl(text)
    audio.load()
  } catch {
    // ignore
  }
}
