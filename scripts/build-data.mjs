// 数据管道：把原始词书 + ECDICT 词典库 + 例句库，加工成应用直接可用的产物。
// 产物：
//   public/books/{id}.json  —— 每个词追加 senses（词性分组释义）与 forms（词形变化）
//   public/sentences.json   —— 例句库（含中文翻译）+ 逐词释义表
// 运行：node scripts/build-data.mjs
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = path.join(ROOT, 'data-tmp')
const BOOKS_DIR = path.join(ROOT, 'public', 'books')

const BOOK_IDS = ['gaokao', 'cet4', 'kaoyan', 'zhongkao', 'ielts', 'toefl', 'gre', 'level4', 'level8']

/* ---------- 词性处理 ---------- */

// 词性用英文缩写标签（有道词典风格：adj. / n. / v.）
const POS_MAP = {
  n: 'n.', v: 'v.', vt: 'v.', vi: 'v.',
  a: 'adj.', adj: 'adj.',
  adv: 'adv.', prep: 'prep.', conj: 'conj.', pron: 'pron.',
  num: 'num.', int: 'int.', interj: 'int.',
  art: 'art.', aux: 'aux.', abbr: 'abbr.',
}

function parseTranslation(translation) {
  // ECDICT translation 形如 "n. 取消, 撤消\nvt. 取消, 删去\n[计] 作废"
  const groups = new Map()
  for (const line of (translation || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('[')) continue // [计]/[医] 等领域标签行，跳过
    const m = t.match(/^([a-zA-Z]{1,6})\.\s*(.+)$/)
    let pos, text
    if (m && POS_MAP[m[1].toLowerCase()]) {
      pos = POS_MAP[m[1].toLowerCase()]
      text = m[2]
    } else {
      pos = '其他'
      text = t
    }
    const meanings = text
      .split(/[,，;；、]/)
      .map((s) => s.trim())
      .filter((s) => s && s.length <= 32)
      .slice(0, 10)
    if (meanings.length === 0) continue
    const list = groups.get(pos) ?? []
    for (const mm of meanings) if (!list.includes(mm) && list.length < 10) list.push(mm)
    groups.set(pos, list)
  }
  return [...groups.entries()].map(([pos, zh]) => ({ pos, zh }))
}

function parseExchange(exchange) {
  // "d:cancelled/p:cancelled/i:cancelling/3:cancels/s:cancels/"
  if (!exchange) return []
  const forms = new Set()
  for (const part of exchange.split('/')) {
    const m = part.match(/^([a-z0-9]):(.+)$/)
    if (m && m[1] !== '0' && m[1] !== '1') forms.add(m[2].trim().toLowerCase())
  }
  return [...forms]
}

/* ---------- 例句来源 ---------- */

function extractFirstExample(content) {
  const lines = content.split('\n')
  let inSection = false
  for (const line of lines) {
    if (!inSection) {
      if (line.includes('列举例句') || line.includes('例句：')) inSection = true
      continue
    }
    // 下一个大段落开始就停
    if (/^\s*\*\*/.test(line) || /词根分析|词缀分析|发展历史|单词变形|记忆辅助|小故事/.test(line)) break
    // 两种列表项：*   English (中文)   /   1.  English（中文）
    const m = line.match(/^\s*(?:\*|\d+\\?\.)\s+(.+?)\s*[（(]([^（）()]+)[）)]\s*$/)
    if (m && m[1].length >= 8) return { en: m[1].trim(), zh: m[2].trim() }
  }
  return null
}

const SECTION_RE = /分析词义|列举例句|例句[:：]|词根分析|词缀分析|发展历史|单词变形|记忆辅助|小故事/

/** 提取速记法：词根分析 + 词缀分析 两段合成一句拆解记忆（兼容 ###、**粗体**、纯文本三种排版） */
function extractMnemonic(content) {
  const lines = content.split('\n')
  const parts = []
  let collecting = false
  for (const line of lines) {
    const t = line.trim()
    // 段落标题行：较短且含段落名
    if (t && t.length < 30 && SECTION_RE.test(t)) {
      collecting = /词根分析|词缀分析/.test(t)
      // "词缀分析：无词缀" 这种标题带内容的一并收下
      const after = t.split(/[:：]/).slice(1).join(':').replace(/\*\*/g, '').trim()
      if (collecting && after && after.length > 2 && !/^(无|没有)/.test(after)) parts.push(after)
      continue
    }
    // 其它 markdown 标题/粗体行视为分段结束
    if (/^\s*(#{1,6}\s|\*\*)/.test(line)) {
      collecting = false
      continue
    }
    if (!collecting || !t) continue
    const text = t.replace(/\*\*/g, '').replace(/\\/g, '')
    if (text && text.length > 2) parts.push(text)
    if (parts.join(' ').length > 180) break
  }
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim()
  return joined ? joined.slice(0, 180) : null
}

function loadGpt4Data() {
  const file = path.join(TMP, 'gpt4dict', 'gptwords.json')
  const sentences = new Map()
  const mnems = new Map()
  if (!existsSync(file)) return { sentences, mnems }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const { word, content } = JSON.parse(line)
      const key = word.toLowerCase()
      const sent = extractFirstExample(content || '')
      if (sent) sentences.set(key, sent)
      const mnem = extractMnemonic(content || '')
      if (mnem) mnems.set(key, mnem)
    } catch {
      // 单行解析失败跳过
    }
  }
  return { sentences, mnems }
}

function loadQwertyBook(file) {
  const p = path.join(TMP, file)
  if (!existsSync(p)) return new Map()
  const arr = JSON.parse(readFileSync(p, 'utf8'))
  const map = new Map()
  for (const e of arr) {
    if (e.trans && e.trans[0]) map.set(e.name.toLowerCase(), { en: e.trans[0], zh: undefined })
  }
  return map
}

/* ---------- 主流程 ---------- */

const dict = new Database(path.join(TMP, 'package', 'db', 'cdictfull.db'), { readonly: true })
const lookup = dict.prepare('SELECT word, translation, exchange FROM stardict WHERE word = ? COLLATE NOCASE')

function glossFor(token) {
  const r = lookup.get(token)
  if (!r || !r.translation) return null
  // 取第一条释义的第一个说法，尽量短
  for (const line of r.translation.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('[')) continue
    const noPos = t.replace(/^[a-zA-Z]{1,6}\.\s*/, '')
    const first = noPos.split(/[,，;；、(（]/)[0].trim()
    if (first && first.length <= 16) return first
    if (first) return first.slice(0, 16)
  }
  return null
}

function glossWithStem(token) {
  const direct = glossFor(token)
  if (direct) return direct
  // 简单词形还原
  const cands = []
  if (token.endsWith('ies')) cands.push(token.slice(0, -3) + 'y')
  if (token.endsWith('es')) cands.push(token.slice(0, -2))
  if (token.endsWith('s')) cands.push(token.slice(0, -1))
  if (token.endsWith('ing')) { cands.push(token.slice(0, -3)); cands.push(token.slice(0, -3) + 'e') }
  if (token.endsWith('ed')) { cands.push(token.slice(0, -2)); cands.push(token.slice(0, -1)) }
  for (const c of cands) {
    if (c.length < 2) continue
    const g = glossFor(c)
    if (g) return g
  }
  return null
}

const { sentences: gpt4, mnems: gpt4Mnems } = loadGpt4Data()
const ewSentence = loadQwertyBook('ew-sentence.json')
const ewMeaning = loadQwertyBook('ew-meaning.json')
console.log(`例句来源：gpt4=${gpt4.size} ew-sentence=${ewSentence.size} ew-meaning=${ewMeaning.size}；速记法=${gpt4Mnems.size}`)

const glossary = new Map() // word(lower) -> 例句
const tokenSet = new Set() // 已选例句里出现过的 token
const processedWords = new Set() // 跨书去重
const mnemOut = {} // 词 -> 速记法
let sentenceStats = { gpt4: 0, ew: 0, none: 0 }

const bookWordSet = new Set()

for (const id of BOOK_IDS) {
  const src = path.join(BOOKS_DIR, `${id}.json`)
  const words = JSON.parse(readFileSync(src, 'utf8'))
  let senseHit = 0
  for (const w of words) {
    bookWordSet.add(w.name.toLowerCase())
    const row = lookup.get(w.name)
    if (row) {
      const senses = parseTranslation(row.translation)
      if (senses.length > 0) {
        w.senses = senses
        senseHit++
      }
      const forms = parseExchange(row.exchange)
      if (forms.length > 0) w.forms = forms
    }
    // 例句（跨书共用一份 sentences.json，同一词只选一次）
    const key = w.name.toLowerCase()
    if (!processedWords.has(key)) {
      processedWords.add(key)
      if (gpt4Mnems.has(key)) mnemOut[key] = gpt4Mnems.get(key)
      let sent = gpt4.get(key)
      if (sent) sentenceStats.gpt4++
      else if (ewSentence.has(key)) { sent = ewSentence.get(key); sentenceStats.ew++ }
      else if (ewMeaning.has(key)) { sent = ewMeaning.get(key); sentenceStats.ew++ }
      if (sent) {
        glossary.set(key, sent)
        for (const tk of (sent.en.match(/[a-zA-Z']+/g) ?? [])) {
          const k = tk.toLowerCase().replace(/^'+|'+$/g, '')
          if (k) tokenSet.add(k)
        }
      } else {
        sentenceStats.none++
      }
    }
  }
  writeFileSync(src, JSON.stringify(words))
  console.log(`${id}: ${words.length} 词，senses 命中 ${senseHit} (${Math.round((senseHit / words.length) * 100)}%)`)
}

// 生成逐词释义表（只含已选例句里出现过的 token）
const g = {}
for (const token of tokenSet) {
  const zh = glossWithStem(token)
  if (zh) g[token] = zh
}

const s = Object.fromEntries(glossary)

writeFileSync(
  path.join(ROOT, 'public', 'sentences.json'),
  JSON.stringify({ s, g, m: mnemOut }),
)

/* ---------- 高频释义库（首页查词用，中英双向） ---------- */

// 收录范围：当代语料库前 3 万 OR BNC 前 3 万 OR 带考纲标签（中考/高考/四六级/考研/托福/雅思/GRE）
const freqRows = dict.prepare(`
  SELECT word, phonetic, translation, exchange, frq FROM stardict
  WHERE (frq > 0 AND frq <= 50000)
     OR (bnc > 0 AND bnc <= 50000)
     OR tag LIKE '%zk%' OR tag LIKE '%gk%' OR tag LIKE '%cet4%' OR tag LIKE '%cet6%'
     OR tag LIKE '%ky%' OR tag LIKE '%toefl%' OR tag LIKE '%ielts%' OR tag LIKE '%gre%'
  ORDER BY frq ASC, bnc ASC
`)
const d = {}
let dictCount = 0
for (const r of freqRows.iterate()) {
  const key = r.word.toLowerCase().trim()
  // 词书里的词也收录：用户在别的词书学习时也要能查到这个词
  if (!key || /^[^a-z]/.test(key) || key.length > 30 || d[key]) continue
  const senses = parseTranslation(r.translation)
  if (senses.length === 0) continue
  const entry = { senses }
  if (r.phonetic) entry.usphone = r.phonetic
  const forms = parseExchange(r.exchange)
  if (forms.length > 0) entry.forms = forms
  d[key] = entry
  dictCount++
}
writeFileSync(path.join(ROOT, 'public', 'dict.json'), JSON.stringify(d))
console.log(`dict.json: ${dictCount} 个高频词释义`)

/* ---------- 中→英反向索引（cn.json）：中文释义 -> [单词, 匹配到的词性释义] ---------- */

const cn = {}
let cnCount = 0
// d 的插入顺序就是词频顺序（ORDER BY frq ASC），先出现的词更常用
for (const [word, entry] of Object.entries(d)) {
  const seen = new Set()
  for (const s of entry.senses) {
    for (const zh of s.zh) {
      const key = zh.replace(/\s+/g, '')
      if (!key || key.length > 10 || /[a-zA-Z0-9]/.test(key)) continue
      const list = cn[key] ?? []
      if (list.length < 6 && !list.includes(word)) {
        list.push([word, `${s.pos} ${s.zh.join('；')}`])
        cn[key] = list
        seen.add(word)
        if (seen.size === 1) cnCount++
      }
      // 注意：不要 break——“这, 这个”这类同组变体都要索引
    }
  }
}
writeFileSync(path.join(ROOT, 'public', 'cn.json'), JSON.stringify(cn))
console.log(`cn.json: ${cnCount} 个中文词条（可反查英文）`)

/* ---------- 中文整句翻译索引（zhsent.json）：例句的中文翻译 -> 英文原句 ---------- */

const zhNorm = (s) => (s || '').replace(/[\s，。、；：！？·”“’‘（）《》,.;:!?'"()<>-]/g, '')
const zhsent = {}
for (const [word, sent] of glossary.entries()) {
  if (sent.zh) {
    const key = zhNorm(sent.zh)
    if (key.length >= 2 && !zhsent[key]) zhsent[key] = { en: sent.en, word }
  }
}
writeFileSync(path.join(ROOT, 'public', 'zhsent.json'), JSON.stringify(zhsent))
console.log(`zhsent.json: ${Object.keys(zhsent).length} 条整句翻译索引`)

/* ---------- CC-CEDICT 补充：中文特有词（这个/家人/时候…→英文） ---------- */

const cedictFile = path.join(TMP, 'package', 'cedict.json')
if (existsSync(cedictFile)) {
  const cedict = JSON.parse(readFileSync(cedictFile, 'utf8'))
  let cedictAdd = 0
  for (const e of cedict) {
    const key = (e.simplified || '').replace(/\s+/g, '')
    if (!key || key.length > 10 || /[a-zA-Z0-9]/.test(key)) continue
    for (const def of e.english ?? []) {
      // 剥掉 "(pronoun) this"、"percent (Tw)" 这类括号标记
      const defT = def.trim().replace(/^\([^)]*\)\s*/, '').replace(/\s*\([^)]*\)$/, '').trim()
      // 只收“单词型”定义（能点开词典卡的），且该词在释义库里存在
      if (!/^[a-zA-Z][a-zA-Z'-]{0,24}$/.test(defT)) continue
      const word = defT.toLowerCase()
      if (!d[word]) continue
      const list = cn[key] ?? []
      if (list.length >= 8) break
      if (list.some((c) => (Array.isArray(c) ? c[0] : c) === word)) continue
      list.push([word, `拼音 ${e.pinyin}`])
      cn[key] = list
      cedictAdd++
      break
    }
  }
  console.log(`CC-CEDICT 补充 ${cedictAdd} 条候选`)
}

/* ---------- 基础词补充：ECDICT 释义措辞覆盖不到的日常说法（你好→hello 这类） ---------- */

const BASIC_CN_EN = {
  你好: ['hello', 'hi'], 您好: ['hello', 'hi'], 喂: ['hello'], 再见: ['goodbye', 'bye'],
  早上好: ['Good morning'], 早安: ['Good morning'], 下午好: ['Good afternoon'], 晚上好: ['Good evening'],
  晚安: ['Good night'], 好久不见: ['Long time no see'], 我爱你: ['I love you'],
  生日快乐: ['Happy birthday'], 新年快乐: ['Happy New Year'], 圣诞快乐: ['Merry Christmas'],
  不客气: ["You're welcome"], 没关系: ["It's OK"], 对不起: ['sorry'], 抱歉: ['sorry'],
  谢谢: ['thanks'], 请: ['please'], 欢迎: ['welcome'], 加油: ['come on', 'cheer up'],
  干杯: ['cheers'], 我饿了: ["I'm hungry"], 我渴了: ["I'm thirsty"], 我累了: ["I'm tired"],
  是: ['yes', 'be'], 不是: ['no', 'not'], 好: ['good', 'well'], 坏: ['bad'], 不错: ['good', 'not bad'],
  大: ['big', 'large'], 小: ['small', 'little'], 多: ['many', 'much'], 少: ['few', 'little'],
  爱: ['love'], 喜欢: ['like'], 讨厌: ['dislike', 'hate'], 恨: ['hate'],
  家: ['home', 'family'], 家庭: ['family'], 爸爸: ['father', 'dad'], 妈妈: ['mother', 'mom'],
  朋友: ['friend'], 老师: ['teacher'], 学生: ['student'], 人: ['person', 'people'],
  男人: ['man'], 女人: ['woman'], 孩子: ['child', 'kid'], 儿童: ['child'],
  水: ['water'], 火: ['fire'], 食物: ['food'], 吃: ['eat'], 喝: ['drink'], 睡觉: ['sleep'],
  工作: ['work', 'job'], 学习: ['study'], 学校: ['school'], 书: ['book'],
  时间: ['time'], 今天: ['today'], 明天: ['tomorrow'], 昨天: ['yesterday'], 现在: ['now'],
  世界: ['world'], 中国: ['china'], 生活: ['life'],
  跑: ['run'], 走: ['walk'], 看: ['see', 'watch', 'look'], 听: ['listen'],
  说: ['say', 'speak'], 读: ['read'], 写: ['write'],
  红: ['red'], 蓝: ['blue'], 绿: ['green'], 黄: ['yellow'], 黑: ['black'], 白: ['white'],
  快: ['fast', 'quick'], 慢: ['slow'], 高: ['tall', 'high'], 矮: ['short'],
  新: ['new'], 旧: ['old'], 年轻: ['young'], 漂亮: ['beautiful', 'pretty'],
  开心: ['happy'], 高兴: ['happy'], 难过: ['sad'], 生气: ['angry'], 累: ['tired'],
  钱: ['money'], 手机: ['phone', 'mobile'], 电脑: ['computer'], 汽车: ['car'],
  火车: ['train'], 飞机: ['plane', 'airplane'], 苹果: ['apple'], 香蕉: ['banana'],
  问题: ['question', 'problem'], 答案: ['answer'], 开始: ['start', 'begin'],
  结束: ['end', 'finish'], 帮助: ['help'], 想: ['want', 'think'], 知道: ['know'],
  理解: ['understand'], 记住: ['remember'], 忘记: ['forget'], 希望: ['hope', 'wish'],
  梦想: ['dream'], 变化: ['change'], 成功: ['success', 'succeed'], 失败: ['fail', 'failure'],
  早上: ['morning'], 中午: ['noon'], 晚上: ['evening', 'night'], 夜晚: ['night'],
}
let basicHit = 0
for (const [zhKey, ws] of Object.entries(BASIC_CN_EN)) {
  const key = zhKey.replace(/\s+/g, '')
  // 短语（含空格）直接收录；单词需在释义库里有
  const valid = ws.filter((w) => /\s/.test(w) || d[w.toLowerCase()])
  if (valid.length === 0) continue
  const old = (cn[key] ?? []).filter((c) => !valid.includes(Array.isArray(c) ? c[0] : c))
  // 基础词放最前面，标为“常用短语/表达”
  cn[key] = [...valid.map((w) => [w, '常用表达']), ...old].slice(0, 8)
  basicHit++
}
writeFileSync(path.join(ROOT, 'public', 'cn.json'), JSON.stringify(cn))
console.log(`cn.json: 基础词补充 ${basicHit} 条`)

console.log(`例句：gpt4=${sentenceStats.gpt4} 其他=${sentenceStats.ew} 缺失=${sentenceStats.none}`)
console.log(`sentences.json: ${Object.keys(s).length} 句 / ${Object.keys(g).length} 个逐词释义 / ${Object.keys(mnemOut).length} 条速记法`)
dict.close()
