/**
 * 给 dict.json 补上「变形词」条目。
 *
 * 为什么需要这个：
 *   dict.json 是从 ECDICT 筛出来的，筛选条件是「词频前 5 万 或 带考纲标签」。
 *   但 had / has / were / did / went 这些变形词在 ECDICT 里**既没有词频排名、
 *   也没有考纲标签**，于是全被筛掉了 —— 结果查 "had" 会显示「词库未收录」，
 *   而 have / was / go 都好好的。
 *
 * 怎么补：
 *   ECDICT 给每个词标了 forms（词形变化），比如 have -> [having, had, has, haves]。
 *   把这个关系反过来用：变形查不到时，补一条指向原词的条目，
 *   释义直接用原词的，再加一行「原形 have」。
 *
 * 补哪些（不是全补）：
 *   全部缺口有 4.5 万条，全补 dict.json 会翻倍。只补「原词在词频前 RANK_LIMIT 名以内」的。
 *
 *   试过把「词书里出现的词」也算进来，结果要补 25884 条、dict.json 从 5.3MB 涨到 10.2MB ——
 *   多出来的那 4.5MB 买的是一堆 GRE 生僻词的变形，不值。词频这一条已经把
 *   had / has / were / did / went / made / took 这些真正会查到的全覆盖了。
 *
 * 注意：dict.json 是 build-data.mjs 生成的。**重跑 build-data.mjs 会覆盖掉这个补丁**，
 * 到时候再跑一遍本脚本即可（脚本是幂等的，跑几次结果一样）。
 *
 * 用法：node scripts/patch-inflections.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DICT = path.join(ROOT, 'public', 'dict.json')

/** 原词进前多少名就补它的变形 */
const RANK_LIMIT = 12000

/**
 * ECDICT 的 forms 字段自己漏掉的那些 —— 实测只有 were 和 gotten，
 * 但把 be 的整套和几个经典不规则都列上保险。已经存在的不受影响。
 */
const MANUAL = [
  ['were', 'be'],
  ['gotten', 'get'],
  ['am', 'be'],
  ['are', 'be'],
  ['is', 'be'],
  ['was', 'be'],
  ['been', 'be'],
  ['being', 'be'],
  ['shone', 'shine'],
  ['swum', 'swim'],
  ['swam', 'swim'],
  ['slain', 'slay'],
  ['borne', 'bear'],
  ['wrought', 'work'],
  ['clung', 'cling'],
  ['flung', 'fling'],
  ['stung', 'sting'],
  ['swung', 'swing'],
  ['wrung', 'wring'],
  ['dug', 'dig'],
  ['spun', 'spin'],
  ['stuck', 'stick'],
  ['struck', 'strike'],
  ['swept', 'sweep'],
  ['wept', 'weep'],
  ['crept', 'creep'],
  ['leapt', 'leap'],
  ['dealt', 'deal'],
  ['fled', 'flee'],
  ['froze', 'freeze'],
  ['frozen', 'freeze'],
  ['chose', 'choose'],
  ['chosen', 'choose'],
  ['rode', 'ride'],
  ['ridden', 'ride'],
  ['rose', 'rise'],
  ['risen', 'rise'],
  ['drove', 'drive'],
  ['driven', 'drive'],
  ['threw', 'throw'],
  ['thrown', 'throw'],
  ['grew', 'grow'],
  ['grown', 'grow'],
  ['blew', 'blow'],
  ['blown', 'blow'],
  ['flew', 'fly'],
  ['flown', 'fly'],
  ['drew', 'draw'],
  ['drawn', 'draw'],
  ['shook', 'shake'],
  ['shaken', 'shake'],
  ['spoke', 'speak'],
  ['spoken', 'speak'],
  ['stole', 'steal'],
  ['stolen', 'steal'],
  ['woke', 'wake'],
  ['woken', 'wake'],
  ['broke', 'break'],
  ['broken', 'break'],
  ['wove', 'weave'],
  ['woven', 'weave'],
  ['tore', 'tear'],
  ['torn', 'tear'],
  ['wore', 'wear'],
  ['worn', 'wear'],
  ['swore', 'swear'],
  ['sworn', 'swear'],
  ['bore', 'bear'],
  ['lay', 'lie'],
  ['lain', 'lie'],
  ['laid', 'lay'],
]

const dict = JSON.parse(readFileSync(DICT, 'utf8'))
const keys = Object.keys(dict)

/**
 * dict.json 的插入顺序**不是**纯词频顺序。
 *
 * build-data.mjs 里是 `ORDER BY frq ASC, bnc ASC`，而筛选条件有一条是
 * 「带考纲标签」——那些词 frq=0、bnc=0，于是排在最前面，且基本按字母序。
 * 实测前 14166 条全是这种，第 14166 个才是 "the"（英语里排名第一的词）。
 *
 * 所以算词频排名必须减掉这个偏移。不减的话 have（index 14173）会被当成
 * 14173 名的生僻词，而 abnegate（index 0）会被当成最高频 —— 正好反了。
 */
const FREQ_OFFSET = (() => {
  const i = keys.indexOf('the')
  if (i > 0) return i
  console.warn('⚠ 找不到锚点词 "the"，按没有偏移处理（补出来的结果可能不对）')
  return 0
})()

const rank = new Map(keys.map((k, i) => [k, i - FREQ_OFFSET]))

// forms 反过来：变形 -> 原词。手工表放最后，它修正的是 ECDICT 自己漏的
const baseOf = new Map()
for (const [w, e] of Object.entries(dict)) {
  for (const f of e.forms ?? []) {
    const k = String(f).toLowerCase().trim()
    if (k && k !== w && !baseOf.has(k)) baseOf.set(k, w)
  }
}
for (const [form, base] of MANUAL) {
  if (dict[base]) baseOf.set(form, base)
}

const worthIt = (base) => {
  const r = rank.get(base)
  // r < 0 的那些是「只靠考纲标签入选、没有词频排名」的词，不补
  return r !== undefined && r >= 0 && r < RANK_LIMIT
}

let added = 0
const skippedRare = []
for (const [form, base] of baseOf) {
  if (dict[form]) continue // 已经有了，不动
  const baseEntry = dict[base]
  if (!baseEntry) continue
  if (!worthIt(base)) {
    skippedRare.push(form)
    continue
  }
  dict[form] = {
    // 先点明它是谁的变形，再把原词的释义整段带上 ——
    // 查 had 的人要的是 have 的意思，不是一句"had 是 have 的过去式"就完了
    senses: [{ pos: '原形', zh: [base] }, ...baseEntry.senses],
    forms: [base],
  }
  added++
}

writeFileSync(DICT, JSON.stringify(dict))

console.log(`只补词频前 ${RANK_LIMIT} 名的原词的变形`)
console.log(`变形索引共 ${baseOf.size} 条，本次补进 ${added} 条`)
console.log(`原词太生僻而跳过 ${skippedRare.length} 条（例如 ${skippedRare.slice(0, 5).join(', ')}）`)
console.log(`dict.json 现在 ${Object.keys(dict).length} 条，${(readFileSync(DICT).length / 1024 / 1024).toFixed(1)} MB`)
