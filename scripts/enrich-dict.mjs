// dict.json 增强脚本：给释义库补两组数据
//   syn —— 近义词（WordNet 同词集，只收释义库里存在的词，每词最多 6 个）
//   bk  —— 词书收录频率（该词在每本内置词书里的序位，如 cet4:132 = 四级第 132 词）
// 运行：node scripts/enrich-dict.mjs（在 augment-sentences.mjs 之后跑，可重复运行）
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BOOK_IDS = ['zhongkao', 'gaokao', 'cet4', 'kaoyan', 'ielts', 'toefl', 'gre', 'level4', 'level8']

const dictPath = path.join(ROOT, 'public', 'dict.json')
const d = JSON.parse(readFileSync(dictPath, 'utf8'))
const heads = new Set(Object.keys(d))

/* ---------- 词书收录频率 ---------- */

// bk 存 `书id:序位`（如 cet4:132），UI 用 BOOKS 查名字再显示「四级 第 132 词」
const bookOfWord = new Map()
for (const id of BOOK_IDS) {
  const words = JSON.parse(readFileSync(path.join(ROOT, 'public', 'books', `${id}.json`), 'utf8'))
  words.forEach((w, order) => {
    const e = d[w.name.toLowerCase()]
    if (!e) return
    const list = bookOfWord.get(w.name.toLowerCase()) ?? []
    list.push(`${id}:${order}`)
    bookOfWord.set(w.name.toLowerCase(), list)
  })
}
for (const [w, list] of bookOfWord) {
  d[w].bk = list
}

/* ---------- WordNet 近义词 ---------- */

const wn = require('wordnet-db')
// files 是相对文件名，要拼上包自带的目录
const files = (Array.isArray(wn.files) ? wn.files : [wn.files]).map((f) =>
  path.isAbsolute(f) ? f : path.join(wn.path, f),
)
const byName = new Map(files.map((f) => [path.basename(f), f]))

// 1) 同词集：offset -> 该词集里的全部词；词 -> 它所属的同词集 offset 列表
const synsetWords = new Map() // `${pos}:${offset}` -> Set(lemma)
const lemmaSynsets = new Map() // lemma -> Set(key)
for (const pos of ['noun', 'verb', 'adj', 'adv']) {
  const idxPath = byName.get(`index.${pos}`)
  if (!idxPath) continue
  for (const line of readFileSync(idxPath, 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const parts = line.trim().split(/\s+/)
    const lemma = parts[0]
    if (!/^[a-z][a-z'-]*$/.test(lemma)) continue
    const cnt = Number(parts[2])
    if (!cnt) continue
    const offsets = parts.slice(parts.length - cnt)
    let set = lemmaSynsets.get(lemma)
    if (!set) {
      set = new Set()
      lemmaSynsets.set(lemma, set)
    }
    for (const off of offsets) set.add(`${pos}:${off}`)
  }
  const dataPath = byName.get(`data.${pos}`)
  if (!dataPath) continue
  for (const line of readFileSync(dataPath, 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const sp = line.split(' ')
    const key = `${pos}:${sp[0]}`
    const wCnt = parseInt(sp[3], 16)
    if (!wCnt) continue
    const words = []
    for (let i = 4; i < 4 + wCnt * 2 && i < sp.length; i += 2) {
      const w = sp[i].split('(')[0].replace(/_/g, ' ')
      if (/^[a-z][a-z' -]*$/.test(w)) words.push(w)
    }
    if (words.length) synsetWords.set(key, new Set(words))
  }
}

// 2) 汇 synonym：同词集里的其他词，且必须是释义库里的词；按词频（dict 的键序）把常用的排前面
const headRank = new Map([...heads].map((w, i) => [w, i]))
let synCount = 0
for (const [word, entry] of Object.entries(d)) {
  const sets = lemmaSynsets.get(word)
  if (!sets) continue
  const seen = new Set([word])
  const out = []
  for (const key of sets) {
    for (const w of synsetWords.get(key) ?? []) {
      if (seen.has(w) || !heads.has(w)) continue
      seen.add(w)
      out.push(w)
    }
  }
  out.sort((a, b) => (headRank.get(a) ?? 9e9) - (headRank.get(b) ?? 9e9))
  if (out.length > 0) {
    entry.syn = out.slice(0, 6)
    synCount++
  }
}

writeFileSync(dictPath, JSON.stringify(d))
console.log(`dict.json：近义词 ${synCount} 词，词书收录标记 ${bookOfWord.size} 词`)
console.log('样例 work:', JSON.stringify({ syn: d.work?.syn, bk: d.work?.bk }))
