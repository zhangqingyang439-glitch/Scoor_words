/** 词性标签（有道词典风格：英文缩写） */
const POS_MAP: Record<string, string> = {
  n: 'n.',
  v: 'v.',
  vt: 'v.',
  vi: 'v.',
  'a': 'adj.',
  adj: 'adj.',
  adv: 'adv.',
  prep: 'prep.',
  conj: 'conj.',
  pron: 'pron.',
  num: 'num.',
  int: 'int.',
  interj: 'int.',
  art: 'art.',
  aux: 'aux.',
  abbr: 'abbr.',
}

export function posLabel(prefix: string): string {
  return POS_MAP[prefix.toLowerCase()] ?? '其他'
}

/** 把一行 "n. 释义1；释义2" 拆成词性 + 释义文本；无前缀返回 null 词性 */
export function splitPosLine(line: string): { pos: string | null; text: string } {
  const m = line.trim().match(/^([a-zA-Z]{1,4})\.\s*(.+)$/)
  if (m && POS_MAP[m[1].toLowerCase()]) {
    return { pos: posLabel(m[1]), text: m[2] }
  }
  return { pos: null, text: line.trim() }
}

/** 规范化中文输入：去空格、标点、全角符号，用于答案比对 */
export function normalizeZh(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[，。、；：！？·”“’‘（）《》\s,.;:!?'\"()<>-]/g, '')
}

/** 规范化英文输入 */
export function normalizeEn(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 把一条中文释义拆成可接受的说法列表 */
export function meaningVariants(text: string): string[] {
  return text
    .split(/[；;，,、]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/** 用户输入的中文是否命中释义列表中的某一个说法 */
export function matchMeaning(input: string, meanings: string[]): boolean {
  const got = normalizeZh(input)
  if (!got) return false
  return meanings.some((m) => {
    const variants = meaningVariants(m)
    return variants.some((v) => {
      const nv = normalizeZh(v)
      if (!nv) return false
      if (nv === got) return true
      // 允许“释义很长，用户只写了核心词”（双向包含，至少 2 字）
      return got.length >= 2 && (nv.includes(got) || got.includes(nv))
    })
  })
}

/** 拆出句子里的英文单词（含撇号） */
export function tokenize(sentence: string): string[] {
  return sentence.match(/[a-zA-Z']+/g) ?? []
}

/** 例句中高亮目标词：返回 <em> 包裹的片段数组（交替：普通文本/高亮文本） */
export function highlightWord(sentence: string, targets: string[]): Array<{ text: string; hit: boolean }> {
  const set = new Set(targets.map((t) => t.toLowerCase()))
  const parts: Array<{ text: string; hit: boolean }> = []
  const re = /[a-zA-Z']+/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence))) {
    if (set.has(m[0].toLowerCase())) {
      if (m.index > last) parts.push({ text: sentence.slice(last, m.index), hit: false })
      parts.push({ text: m[0], hit: true })
      last = m.index + m[0].length
    }
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), hit: false })
  return parts
}
