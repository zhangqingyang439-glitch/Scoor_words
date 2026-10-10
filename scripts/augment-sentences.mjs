// 例句库增补脚本：在现有 public/sentences.json 上**增量**合并，不重跑 build-data.mjs
// （data-tmp 的 ECDICT 原始库已被清掉，全量重建不可行；本脚本只依赖仓库内产物 + data-tmp 新语料）
//
// 做什么：
//   1. 合并 Tatoeba 英中句对（data-tmp/tatoeba/tatoeba-full.json，人工翻译，CC-BY）：
//      · 给完全没例句的词补例句
//      · 给有例句但没翻译的词换成带翻译的句子（原句丢弃）
//   2. 合并 AI 例句（data-tmp/ai-sentences.tsv：word\t英文\t中文，冷门词用）
//   3. 给**所有**例句（旧的+新的）做：
//      · 短语标注：扫描 data-tmp/phrases.json 的常用短语表，命中才标
//      · 句子结构讲解：规则检测（被动/从句/比较/there be 等，保守规则）
//      · 老字段 phr（"cancel out 抵消"）转成 phrases 结构
//   4. 逐词释义表 g：新句子里没收录的 token，从 public/dict.json 派生短释义
//   5. 重建 zhsent.json（中文整句翻译索引，来自新的例句库）
//
// 运行：node scripts/augment-sentences.mjs   （可重复运行，幂等）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BOOK_IDS = ['zhongkao', 'gaokao', 'cet4', 'kaoyan', 'ielts', 'toefl', 'gre', 'level4', 'level8']

/* ---------- 词书与词形 ---------- */

const wordForms = new Map() // lower(word) -> Set(含本身的全部词形，小写)
for (const id of BOOK_IDS) {
  const words = JSON.parse(readFileSync(path.join(ROOT, 'public', 'books', `${id}.json`), 'utf8'))
  for (const w of words) {
    const k = w.name.toLowerCase()
    const set = wordForms.get(k) ?? new Set([k])
    for (const f of w.forms ?? []) set.add(f.toLowerCase())
    wordForms.set(k, set)
  }
}

/* ---------- 例句质量过滤 ---------- */

const CJK = /[\u4e00-\u9fff]/
/** 一句英文能不能当学习例句用 */
function goodEn(en) {
  if (!en || en.length < 8 || en.length > 140) return false
  if (!/^[A-Z"']/.test(en)) return false
  if (!/[.!?]$/.test(en)) return false
  if (/http|www\.|@|\{|\}|_|\.\.\./i.test(en)) return false
  const words = en.match(/[a-zA-Z']+/g) ?? []
  if (words.length < 3 || words.length > 16) return false
  // 连续三个以上全大写多为噪音
  if (/\b[A-Z]{4,}\b/.test(en)) return false
  return true
}
function goodZh(zh) {
  if (!zh || !CJK.test(zh)) return false
  if (zh.length > 60) return false
  if (/[a-zA-Z]{4,}/.test(zh)) return false // 中文里夹长英文多为脏数据
  return true
}

/* ---------- 1. Tatoeba 合并 ---------- */

function loadTatoeba() {
  // 优先读繁转简版（tatoeba 语料里有大量繁体翻译，App 用户是简体）
  let file = path.join(ROOT, 'data-tmp', 'tatoeba', 'tatoeba-full-sc.json')
  if (!existsSync(file)) file = path.join(ROOT, 'data-tmp', 'tatoeba', 'tatoeba-full.json')
  if (!existsSync(file)) return []
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  // 结构：[中文句id, 中文, 英文句id, 英文]
  const pairs = []
  for (const row of raw) {
    const en = (row[3] ?? '').trim()
    const zh = (row[1] ?? '').trim()
    if (!goodEn(en) || !goodZh(zh)) continue
    pairs.push({ en, zh, src: 'tatoeba' })
  }
  return pairs
}

/** TED2020 演讲字幕句对（[en, zh]，CC BY-NC-ND）：补 Tatoeba 覆盖不到的中高级词 */
function loadTed() {
  const file = path.join(ROOT, 'data-tmp', 'tatoeba', 'ted2020.json')
  if (!existsSync(file)) return []
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const pairs = []
  for (const [en, zh] of raw) {
    if (!goodEn(en) || !goodZh(zh)) continue
    pairs.push({ en, zh, src: 'ted' })
  }
  return pairs
}

/* ---------- 2. AI 例句（TSV：word\t英文\t中文） ---------- */

function loadAiSentences() {
  const file = path.join(ROOT, 'data-tmp', 'ai-sentences.tsv')
  const out = new Map() // word -> {en, zh}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [w, en, zh] = t.split('\t')
    if (!w || !en || !zh) continue
    out.set(w.trim().toLowerCase(), { en: en.trim(), zh: zh.trim() })
  }
  return out
}

/* ---------- 3. 短语表 ---------- */

function loadPhrases() {
  const file = path.join(ROOT, 'data-tmp', 'phrases.json')
  if (!existsSync(file)) return []
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return raw.map(([p, zh]) => ({
    tokens: (p.toLowerCase().match(/[a-z']+/g) ?? []),
    p,
    zh,
  })).filter((e) => e.tokens.length >= 2)
}

/** 老字段 phr（"cancel out 抵消"）拆成短语结构 */
function parseLegacyPhr(phr) {
  const m = phr.match(/^([a-zA-Z][a-zA-Z' -]*?)\s*([\u4e00-\u9fff].*)$/)
  if (!m) return null
  const tokens = (m[1].toLowerCase().match(/[a-z']+/g) ?? [])
  return tokens.length >= 2 ? { tokens, p: m[1].trim(), zh: m[2].trim() } : null
}

/* ---------- 4. 句子结构检测（保守规则，宁可漏不误） ---------- */

const IRREG_PP = new Set([
  'done', 'made', 'given', 'taken', 'written', 'seen', 'known', 'found', 'told', 'held', 'kept',
  'brought', 'built', 'bought', 'sent', 'spent', 'met', 'put', 'cut', 'become', 'shown', 'grown',
  'drawn', 'driven', 'eaten', 'fallen', 'forgotten', 'heard', 'hidden', 'left', 'lost', 'paid',
  'read', 'said', 'sold', 'stood', 'taught', 'thought', 'won', 'broken', 'chosen', 'spoken',
  'stolen', 'understood', 'caught', 'begun', 'drunk', 'sung', 'worn', 'born', 'beaten', 'felt',
  'hit', 'led', 'lain', 'laid', 'rung', 'risen', 'shaken', 'shut', 'swum', 'thrown', 'woken',
])
const BE = new Set(['am', 'is', 'are', 'was', 'were', 'been', 'being'])
const THAT_VERBS = new Set([
  'think', 'thought', 'know', 'knew', 'say', 'said', 'believe', 'hope', 'wish', 'guess',
  'remember', 'forget', 'wonder', 'ask', 'asked', 'tell', 'told', 'see', 'saw', 'hear', 'heard',
  'find', 'found', 'feel', 'felt', 'sure', 'afraid', 'glad', 'happy', 'sad', 'true', 'clear',
])

function detectGrammar(en) {
  const notes = []
  const low = en.toLowerCase()
  const toks = low.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean)
  const push = (n) => {
    if (notes.length < 2 && !notes.includes(n)) notes.push(n)
  }

  // 感叹句要放在 what 从句前面判（What a...! 不是从句）
  if (/^\s*(what|how)\s+[\w' -]{2,30}[!?]$/.test(low) && /\bday\b|\bnice\b|\bbeautiful\b|\bwonderful\b|!/.test(en)) {
    if (/[!?]$/.test(en) && /^what a\b|^how\b/.test(low)) push('感叹句（What/How 开头，句尾用 !）')
  }

  // —— 时态 / 词形（为什么用 going、为什么用过去式……用户最关心，放在最前）——
  if (/\b(am|is|are|was|were)\s+going\s+to\b/.test(low)) {
    push("'be going to' 结构（am/is/are + going to，表示打算或将要做某事）")
  } else if (/\b(am|is|are)\s+\w+ing\b/.test(low)) {
    push('现在进行时（am/is/are + V-ing，表示动作正在进行）')
  } else if (/\b(was|were)\s+\w+ing\b/.test(low)) {
    push('过去进行时（was/were + V-ing，过去某时正在进行）')
  }
  if (/\bwill\s+\w+/.test(low)) push('一般将来时（will + 动词原形）')
  const PAST_PERFECT = /\bhad\s+(been|done|made|taken|seen|known|found|given|told|kept|brought|built|bought|sent|spent|met|put|lost|paid|said|won|left|heard|held|understood|\w+ed)\b/.test(low)
  const PERFECT = /\b(have|has)\s+(been|gone|done|made|taken|seen|known|found|given|told|kept|brought|built|bought|sent|spent|met|put|lost|paid|said|won|left|heard|held|understood|grown|drawn|driven|eaten|fallen|forgotten|hidden|broken|chosen|spoken|stolen|caught|begun|drunk|sung|worn|\w+ed)\b/.test(low)
  if (PAST_PERFECT) push('过去完成时（had + 过去分词，表示"过去的过去"）')
  else if (PERFECT) push('现在完成时（have/has + 过去分词，过去的事对现在有影响）')
  // 一般过去时：不规则过去式（前面不是 have/has/had/be），或 -ed 动词，或 yesterday/ago 类时间词
  const IRREG_PAST = new Set([
    'went', 'had', 'saw', 'made', 'came', 'took', 'got', 'said', 'told', 'found', 'gave', 'knew',
    'thought', 'bought', 'brought', 'built', 'kept', 'left', 'met', 'paid', 'ran', 'sat', 'stood',
    'taught', 'understood', 'won', 'wrote', 'sold', 'sent', 'spent', 'woke', 'grew', 'threw',
    'drove', 'ate', 'fell', 'felt', 'heard', 'lost', 'meant', 'began', 'broke', 'chose', 'drew',
    'drank', 'flew', 'hid', 'let', 'lay', 'rose', 'rang', 'sank', 'sang', 'slept', 'spoke',
    'swam', 'swore', 'swept',
  ])
  const NOT_PARTICIPLE = new Set(['used', 'supposed', 'interested', 'excited', 'worried', 'tired', 'surprised', 'pleased', 'amazed', 'scared'])
  let pastHit = /\b(yesterday|last (?:night|week|month|year|monday|friday|sunday|summer|winter)|\d+ (?:days?|weeks?|months?|years?) ago|long ago)\b/.test(low)
  if (!pastHit) {
    for (let i = 1; i < toks.length; i++) {
      const prev = toks[i - 1]
      const t = toks[i]
      if (IRREG_PAST.has(t) && prev !== 'have' && prev !== 'has' && prev !== 'had' && !BE.has(prev)) { pastHit = true; break }
      if (/\w{3,}ed$/.test(t) && !NOT_PARTICIPLE.has(t) && prev !== 'have' && prev !== 'has' && prev !== 'had' && !BE.has(prev)) { pastHit = true; break }
    }
  }
  if (pastHit) push('一般过去时（动词用过去式，表示过去发生的事）')

  // 被动语态：be + 过去分词
  for (let i = 0; i < toks.length - 1; i++) {
    if (BE.has(toks[i]) && (IRREG_PP.has(toks[i + 1]) || (/\w{3,}ed$/.test(toks[i + 1]) && !/\b(used|supposed|interested|excited|worried|tired|surprised|pleased|amazed|scared)$/.test(toks[i + 1])))) {
      push('被动语态（be + 过去分词），主语是动作的承受者')
      break
    }
  }
  // 定语从句：名词 + who/which/that + 动词
  if (/\b[a-z]+\s+(who|which|that)\s+(is|are|was|were|has|have|had|\w+s|\w+ed)\b/.test(low)) {
    push('定语从句（who/which/that 修饰前面的名词）')
  }
  // 宾语从句：think/say/... + that + 完整句
  for (let i = 0; i < toks.length - 2; i++) {
    if (THAT_VERBS.has(toks[i]) && toks[i + 1] === 'that' && toks[i + 2] !== 'a' && toks[i + 2] !== 'an' && toks[i + 2] !== 'the') {
      push('宾语从句（think/say/know 等 + that + 完整句子）')
      break
    }
  }
  // what 引导的名词性从句
  if (/^\s*what\s+\S+(\s+\S+){0,4}\s+(is|was|are|were|means|matters)\b/.test(low)) {
    push('what 引导的主语从句（What... is/was...）')
  } else if (/\b(know|knew|tell|told|said|understand|understood|see)\s+what\b/.test(low)) {
    push('what 引导的宾语从句')
  }
  // 状语从句：后面必须跟主谓结构，"After much discussion" 这种介词短语不算
  if (/^\s*if\b/.test(low)) push('if 引导条件状语从句')
  else if (/^\s*because\b/.test(low)) push('because 引导原因状语从句')
  else if (/^\s*(when|while|after|until|as soon as)\s+\w+\s+(is|are|was|were|has|have|had|will|\w+s\b|\w+ed\b)/.test(low)) push('时间状语从句（when/while/after...）')
  if (/\bso\s+[\w\s]{1,20}\bthat\b/.test(low)) push('so...that 结果状语从句（如此…以至于）')
  else if (/\bsuch\s+a?\s?[\w\s]{1,20}\bthat\b/.test(low)) push('such...that 结果状语从句（如此…以至于）')
  if (/\btoo\s+\w+\s+to\s+\w+/.test(low)) push('too...to 结构（太…而不能）')
  if (/\bnot only\b.*\bbut also\b/.test(low)) push('not only...but also 并列结构')
  if (/\b(both|either|neither)\b.*\b(and|or|nor)\b/.test(low)) push('both/either/neither...and/or/nor 并列结构')
  if (/\b\w+er\s+than\b/.test(low) || /\bmore\s+[\w-]+\s+than\b/.test(low)) push('比较级 + than 比较结构')
  // as...as 要排除 as well as / as soon as / as long as 这些固定短语
  if (/\bas\s+\w+\s+as\b/.test(low) && !/\bas (well|soon|long) as\b/.test(low)) push('as...as 同级比较')
  if (/^\s*there\s+(is|are|was|were)\b/.test(low)) push('there be 存在句')
  if (/^\s*it\s+(is|was)\s+(\w+ly\s+)?(to\s|that\b)/.test(low)) push('It 作形式主语（It is... to do/that...）')

  return notes.join('；') || null
}

/* ---------- 主流程 ---------- */

const sentFile = path.join(ROOT, 'public', 'sentences.json')
const sent = JSON.parse(readFileSync(sentFile, 'utf8'))
const s = sent.s
const before = Object.keys(s).length
let noZhBefore = 0
for (const v of Object.values(s)) if (!v.zh) noZhBefore++

// 每句最多给 4 个不同的词用，防止一句万能句服务 20 个词
const usedEn = new Map()
for (const v of Object.values(s)) usedEn.set(v.en, (usedEn.get(v.en) ?? 0) + 1)
function usable(en) {
  return (usedEn.get(en) ?? 0) < 4
}

// Tatoeba + TED 按 token 建索引（TED 排序时降权：字幕腔比 Tatoeba 口语重）
const pool = new Map() // token -> [{en, zh, wc, src}]
function poolAdd(list) {
  for (const { en, zh, src } of list) {
    const wc = (en.match(/[a-zA-Z']+/g) ?? []).length
    for (const t of new Set((en.toLowerCase().match(/[a-z']+/g) ?? []))) {
      const l = pool.get(t) ?? []
      l.push({ en, zh, wc, src })
      pool.set(t, l)
    }
  }
}
poolAdd(loadTatoeba())
poolAdd(loadTed())

function pickFor(wordLower) {
  const forms = wordForms.get(wordLower) ?? new Set([wordLower])
  const seen = new Set()
  const cands = []
  for (const f of forms) {
    for (const c of pool.get(f) ?? []) {
      if (seen.has(c.en)) continue
      seen.add(c.en)
      if (!usable(c.en)) continue
      // 整词匹配（pool 是按 token 建的，这里再确认一次是这个词形）
      cands.push(c)
    }
  }
  if (cands.length === 0) return null
  // 偏短偏简单的优先（4~12 词），TED 字幕句降 2 分让位给 Tatoeba
  cands.sort((a, b) => Math.abs(a.wc - 8) + (a.src === 'ted' ? 2 : 0) - (Math.abs(b.wc - 8) + (b.src === 'ted' ? 2 : 0)))
  return cands[0]
}

let filled = 0
let replaced = 0
for (const [k, forms] of wordForms) {
  const cur = s[k]
  if (cur && cur.zh) continue
  const pick = pickFor(k)
  if (!pick) continue
  usedEn.set(pick.en, (usedEn.get(pick.en) ?? 0) + 1)
  s[k] = { en: pick.en, zh: pick.zh, src: pick.src }
  if (cur) replaced++
  else filled++
}

// AI 例句补冷门词
const ai = loadAiSentences()
let aiFilled = 0
for (const [k, v] of ai) {
  if (s[k] || !goodEn(v.en) || !goodZh(v.zh)) continue
  s[k] = { en: v.en, zh: v.zh, src: 'ai' }
  aiFilled++
}

/* 短语 + 结构：全量补（旧条目也没有这些字段） */

const PHRASES = loadPhrases()
// be 动词变位：句子里出现的是 am/is/are/was/were，短语表里写的是 "be ..."，
// 把变位形式也映射到同一个短语，"I am going to work" 才能标出 "be going to"
const BE_FORMS = ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']
const PHRASE_BY_KEY = new Map()
for (const p of PHRASES) {
  PHRASE_BY_KEY.set(p.tokens.join(' '), p)
  if (p.tokens[0] === 'be') {
    for (const f of BE_FORMS) PHRASE_BY_KEY.set([f, ...p.tokens.slice(1)].join(' '), p)
  }
}
let phrHit = 0
let grHit = 0
for (const v of Object.values(s)) {
  // 老 phr 转 phrases
  const legacy = v.phr ? parseLegacyPhr(v.phr) : null
  const phraseList = legacy ? [legacy] : []
  // 扫描常用短语表
  const toks = v.en.toLowerCase().match(/[a-z']+/g) ?? []
  for (let i = 0; i < toks.length - 1; i++) {
    for (let len = 4; len >= 2; len--) {
      const key = toks.slice(i, i + len).join(' ')
      const hit = PHRASE_BY_KEY.get(key)
      if (hit) {
        if (!phraseList.some((x) => x.p === hit.p)) phraseList.push(hit)
        i += len - 1 // 命中就跳过这几个词
        break
      }
    }
    if (phraseList.length >= 5) break
  }
  if (phraseList.length > 0) {
    v.phrases = phraseList.map(({ p, zh }) => ({ p, zh }))
    phrHit++
  } else if (v.phrases) {
    delete v.phrases
  }
  // 结构 + 时态讲解（规则每次演进后全量重算，保证新旧句子一致）
  const gr = detectGrammar(v.en)
  if (gr) {
    v.gr = gr
    grHit++
  } else if (v.gr) {
    delete v.gr
  }
}

/* 逐词释义表：新句子的 token 从 dict.json 派生 */

const dict = JSON.parse(readFileSync(path.join(ROOT, 'public', 'dict.json'), 'utf8'))
function shortGloss(token) {
  const e = dict[token]
  if (!e || !e.senses?.length) return null
  const zh = e.senses[0].zh?.[0]
  if (!zh) return null
  const first = zh.split(/[,，;；、(（]/)[0].trim()
  if (!first) return null
  return first.length <= 16 ? first : first.slice(0, 16)
}
function glossWithStem(token) {
  const direct = shortGloss(token)
  if (direct) return direct
  const cands = []
  if (token.endsWith('ies')) cands.push(token.slice(0, -3) + 'y')
  if (token.endsWith('es')) cands.push(token.slice(0, -2))
  if (token.endsWith('s')) cands.push(token.slice(0, -1))
  if (token.endsWith('ing')) { cands.push(token.slice(0, -3)); cands.push(token.slice(0, -3) + 'e') }
  if (token.endsWith('ed')) { cands.push(token.slice(0, -2)); cands.push(token.slice(0, -1)) }
  for (const c of cands) {
    if (c.length < 2) continue
    const g = shortGloss(c)
    if (g) return g
  }
  return null
}
let gAdd = 0
for (const v of Object.values(s)) {
  for (const t of v.en.match(/[a-zA-Z']+/g) ?? []) {
    const k = t.toLowerCase().replace(/^'+|'+$/g, '')
    if (!k || sent.g[k]) continue
    const g = glossWithStem(k)
    if (g) {
      sent.g[k] = g
      gAdd++
    }
  }
}

/* 词 → 常用短语搭配（词典卡讲解用）：短语表里以该词开头的搭配，每词最多 4 个 */
const wordPhrases = {}
for (const { p, zh, tokens } of [...PHRASES].sort((a, b) => a.tokens.length - b.tokens.length)) {
  const head = tokens[0]
  if (!head || head.length < 2 || head === 'be') continue
  const list = wordPhrases[head] ?? (wordPhrases[head] = [])
  if (list.length < 4 && !list.some((x) => x.p === p)) list.push({ p, zh })
}
sent.p = wordPhrases

/* 写回 + 重建 zhsent */

writeFileSync(sentFile, JSON.stringify(sent))

const zhNorm = (str) => (str || '').replace(/[\s，。、；：！？·”“’‘（）《》,.;:!?'"()<>-]/g, '')
const zhsent = {}
for (const [word, v] of Object.entries(s)) {
  if (!v.zh) continue
  const key = zhNorm(v.zh)
  if (key.length >= 2 && !zhsent[key]) zhsent[key] = { en: v.en, word }
}
writeFileSync(path.join(ROOT, 'public', 'zhsent.json'), JSON.stringify(zhsent))

const after = Object.keys(s).length
let noZhAfter = 0
for (const v of Object.values(s)) if (!v.zh) noZhAfter++
console.log(`例句：${before} -> ${after}（Tatoeba 补 ${filled}，换掉无翻译 ${replaced}，AI 补 ${aiFilled}）`)
console.log(`无翻译例句：${noZhBefore} -> ${noZhAfter}`)
console.log(`短语标注 ${phrHit} 条，结构讲解 ${grHit} 条，逐词释义新增 ${gAdd} 条`)
console.log(`zhsent.json：${Object.keys(zhsent).length} 条`)
