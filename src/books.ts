// db.ts 只从本文件引类型（编译后会被擦掉），所以这里静态导入不会成环
import { getMyBook, type MyBookRow } from './db'

export interface Sense {
  /** 词性中文标签：名词 / 动词 / 形容词 … */
  pos: string
  /** 该词性下的中文释义（用于第2遍出空与判答案） */
  zh: string[]
}

export interface BookWord {
  name: string
  trans: string[]
  usphone?: string
  ukphone?: string
  /** ECDICT 增强的词性分组释义（数据管道生成；缺失时回退 trans） */
  senses?: Sense[]
  /** 词形变化（用于例句高亮；可缺失） */
  forms?: string[]
}

export interface BookMeta {
  id: string
  name: string
  description: string
  file: string
  count: number
  /** builtin = 随 App 打包；mine = 从在线词库下载到本机的（词条在 IndexedDB 里） */
  source?: 'builtin' | 'mine'
  category?: string
}

export const BOOKS: BookMeta[] = [
  {
    id: 'zhongkao',
    name: '中考核心',
    description: '中考大纲核心词汇',
    file: '/books/zhongkao.json',
    count: 2140,
  },
  {
    id: 'gaokao',
    name: '高考 3500 词',
    description: '高考大纲核心词汇',
    file: '/books/gaokao.json',
    count: 3893,
  },
  {
    id: 'cet4',
    name: 'CET-4 四级',
    description: '大学英语四级核心词汇',
    file: '/books/cet4.json',
    count: 2607,
  },
  {
    id: 'kaoyan',
    name: '考研英语',
    description: '考研核心词汇',
    file: '/books/kaoyan.json',
    count: 3728,
  },
  {
    id: 'ielts',
    name: '雅思 IELTS',
    description: '雅思考试核心词汇',
    file: '/books/ielts.json',
    count: 3575,
  },
  {
    id: 'toefl',
    name: '托福 TOEFL',
    description: '托福考试核心词汇',
    file: '/books/toefl.json',
    count: 4264,
  },
  {
    id: 'gre',
    name: 'GRE 核心词',
    description: 'GRE 考试核心词汇',
    file: '/books/gre.json',
    count: 6515,
  },
  {
    id: 'level4',
    name: '专业四级',
    description: '英语专业四级词汇',
    file: '/books/level4.json',
    count: 4025,
  },
  {
    id: 'level8',
    name: '专业八级',
    description: '英语专业八级词汇',
    file: '/books/level8.json',
    count: 12197,
  },
]

export function getBook(id: string | null | undefined): BookMeta | null {
  return BOOKS.find((b) => b.id === id) ?? null
}

/**
 * 把下载到本机的词书挂进 BOOKS。
 *
 * 做成"往数组里塞"而不是改成异步查询，是因为 getBook() 被 study.ts、
 * Home、StudyFlow 等一堆地方同步调着用；在这里挂上去，那些地方一行都不用动。
 */
export function registerMyBooks(rows: MyBookRow[]): void {
  const wanted = new Map(rows.map((r) => [r.id, r]))
  let changed = false

  // 已经不在库里了的（用户删掉的）先从 BOOKS 里摘掉
  for (let i = BOOKS.length - 1; i >= 0; i--) {
    if (BOOKS[i].source === 'mine' && !wanted.has(BOOKS[i].id)) {
      BOOKS.splice(i, 1)
      changed = true
    }
  }

  for (const r of rows) {
    const meta: BookMeta = {
      id: r.id,
      name: r.name,
      description: r.description,
      count: r.count,
      file: '',
      source: 'mine',
      category: r.category,
    }
    const i = BOOKS.findIndex((b) => b.id === meta.id)
    if (i < 0) {
      BOOKS.push(meta)
      changed = true
    } else if (BOOKS[i].name !== meta.name || BOOKS[i].count !== meta.count) {
      BOOKS[i] = meta
      changed = true
    }
  }

  // 词条内容变了的话，之前解析好的缓存要作废
  if (changed) cache.clear()
}

/** 卸载一本下载的词书（用户删掉之后，BOOKS 里也得消失） */
export function unregisterMyBook(id: string): void {
  const i = BOOKS.findIndex((b) => b.id === id)
  if (i >= 0) {
    BOOKS.splice(i, 1)
    cache.delete(id)
  }
}

const cache = new Map<string, Promise<BookWord[]>>()

/**
 * 按需加载词书。
 *  · 随 App 打包的：fetch 那个 JSON（构建后由 Service Worker 预缓存，离线可用）
 *  · 在线下载的：直接从 IndexedDB 取，不走网络
 */
export function loadBook(meta: BookMeta): Promise<BookWord[]> {
  let p = cache.get(meta.id)
  if (!p) {
    p =
      meta.source === 'mine'
        ? getMyBook(meta.id).then((row) => {
            if (!row) throw new Error('这本词书已经被删掉了')
            return row.words
          })
        : fetch(meta.file).then((res) => {
            if (!res.ok) throw new Error(`加载词书失败: ${res.status}`)
            return res.json() as Promise<BookWord[]>
          })
    // 失败了不要把 rejected 的 promise 留在缓存里 ——
    // 否则这本词书会一直坏到刷新页面为止，网上临时断一下都缓不过来
    p.catch(() => {
      if (cache.get(meta.id) === p) cache.delete(meta.id)
    })
    cache.set(meta.id, p)
  }
  return p
}
