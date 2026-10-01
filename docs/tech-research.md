# 技术调研：开源背单词项目 & 离线方案

> 目标：做一个**手机离线可用、纯本地、不联网**的英语背单词应用。
> 调研日期：2026-09-30

---

## 一、参考项目对比

| 项目 | 星数 | 技术栈 | 存储 | 对我们的价值 |
|---|---|---|---|---|
| [qwerty-learner](https://github.com/RealKai42/qwerty-learner) | 23.3k | React 18 + Vite + TS + Tailwind + Radix UI + jotai | **Dexie（IndexedDB）**，支持导出/导入备份 | UI/交互参考 + **376 本现成词书**（见下文） |
| [anki](https://github.com/ankitects/anki) | 31.7k | Rust + Qt | SQLite | 记忆算法（FSRS）发源地，产品标杆 |
| [ToastFish](https://github.com/Uahh/ToastFish) | 6.6k | C# / WPF | 本地 | Windows 桌面，不适用手机；交互可参考 |
| [MuJing](https://github.com/tangshimin/MuJing) | 4.6k | Kotlin / Compose | 本地 | 桌面端；"美剧语境背单词"的产品思路 |
| [remix-words-funny](https://github.com/SteveSuv/remix-words-funny) | 1.5k | React + Vite + oRPC + Drizzle + PostgreSQL | 服务端数据库 | **需联网**，仅参考其单词详情页设计（音标/释义/短语/例句/同义词/同根词） |
| [BlueSea](https://github.com/jiangqizheng/BlueSea) | 1.2k | Chrome 扩展 JS | 扩展存储 | 划词高亮 + 记忆曲线复习的交互 |
| [obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) | 2.6k | TS（Obsidian 插件） | Markdown 文件 | "数据就是纯文本"的极简思路 |
| [vocage](https://github.com/proycon/vocage) | 197 | Rust 终端 | TSV 文件 | 同上：一张表就是一个词库，极简 |

**关键结论：** 现有高星项目里没有"手机离线 PWA"形态的成品（qwerty-learner 是在线网页 + 无 Service Worker；发音用的是在线有道 API）。这就是我们自己要补的空位。

---

## 二、词库数据资源

### 2.1 首选：qwerty-learner 自带词书（可直接打包）

- 位置：`https://github.com/RealKai42/qwerty-learner/tree/master/public/dicts/`，共 **376 本**词书
- 数据格式（实测 `CET4_T.json`，约 499KB / 2607 词）：

```json
[
  {
    "name": "cancel",
    "trans": ["取消， 撤销； 删去"],
    "usphone": "'kænsl",
    "ukphone": "'kænsl"
  }
]
```

- 词书索引（`src/resources/dictionary.ts`）按 `{id, name, description, category, url, length}` 组织
- 部分词书清单：CET-4 (2607 词)、CET-6 (2345)、考研 (3728)、考研2024、专四 (4025)、专八 (12197)、COCA20000 (20199)、Longman 3000 (3168)、高考、中考、IT 词汇 (1665) 等

### 2.2 上游源头：kajweb/dict

- [kajweb/dict](https://github.com/kajweb/dict)（3.6k 星）：四六级/考研/雅思/托福/SAT/GRE 词库爬虫数据，仓库超 50MB（jsDelivr 无法代理，需从 GitHub 直接下载）。qwerty-learner 的词书就是从它转换来的，**用 qwerty 的即可**。

### 2.3 增强字段：ECDICT（8.4k 星）

[skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)：77 万词条的英中双解词典（CSV / SQLite），字段：

| 字段 | 含义 |
|---|---|
| word / phonetic | 单词 / 音标 |
| definition / translation | 英文释义 / 中文释义（每行一条） |
| pos | 词性及占比，如 `n:46/v:54` |
| collins / oxford | 柯林斯星级 / 牛津3000核心词 |
| tag | 考纲标签：`zk`中考 `gk`高考 `cet4` `cet6` `kyk`考研 `toefl` `ielts` `gre` |
| bnc / frq | BNC 词频 / 当代语料库词频排名 |
| exchange | 词形变化：`p`过去式 `d`过去分词 `i`现在分词 `3`三单 `r`比较级 `t`最高级 `s`复数 `0`原型，格式 `p:perceived/d:perceived/...` |

用途：给词书补充**英文释义、词频排序、考纲标注、词形变化**。

### 2.4 内容素材（可选）

- [DictionaryByGPT4](https://github.com/Ceelog/DictionaryByGPT4)（6.4k 星）：GPT-4 生成的 8000 词详解——词义、例句、**词根词缀**、变形、记忆技巧、小故事
- [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)（2k 星）、[1eez/103976](https://github.com/1eez/103976)（10万词 SQL/CSV）：备选数据源

---

## 三、记忆算法：ts-fsrs

[open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)：FSRS v6 调度器（Anki 新版默认算法），**纯 TypeScript、浏览器可直接用**，`npm i ts-fsrs`。

```ts
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'

const scheduler = fsrs()                 // 可传自定义参数
const card = createEmptyCard()           // 新卡

// 用户作答后打分：Again=记错 / Hard / Good / Easy
const { card: next, log } = scheduler.next(card, new Date(), Rating.Good)
next.due   // 下次复习时间
// scheduler.repeat(card, now) 可预览四种结局的调度结果（用于提前展示"下次复习间隔"）
```

持久化时把 `card` 对象整体序列化存库即可（含 due/stability/difficulty/state 等）。同组织另有 [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs)（Python）。

---

## 四、离线方案选型

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **PWA**（Web + Service Worker + IndexedDB） | 一套代码；可"添加到主屏幕"全屏运行；首次打开后完全离线；无应用商店 | iOS 存储配额可能被系统回收（7天不使用）；需 http 服务（不能用 file:// 直接开） | ✅ **首选** |
| Capacitor 打包成 APK/IPA | 真·原生应用，存储更稳 | 要装 Android SDK/签名，迭代慢 | PWA 跑通后可升级 |
| 单个 HTML 文件 | 极简 | iOS Safari 打开本地文件体验差，存储不可靠 | ❌ |
| Flutter / RN / 原生 | 性能最好 | 全新技术栈，开发成本最高 | ❌ |

**关键实现点：**

1. **缓存**：`vite-plugin-pwa`（workbox）把 HTML/JS/CSS/词书 JSON 全部预缓存，之后断网可用。
2. **存储**：`Dexie`（IndexedDB 封装）存学习记录与卡片状态——qwerty-learner 同款，配 `dexie-export-import` 可导出备份文件。
3. **发音离线**：qwerty-learner 用在线有道 API，我们弃用；改用 Web Speech API（`speechSynthesis`），Android/iOS 的本地英语语音引擎不联网即可发音。
4. **词书**：精选 2–5 本（如 CET4 + 考研 + COCA5000）打包进构建产物，每本压缩后 <300KB，总体积可控。

---

## 五、推荐技术栈（我们的版本）

```
Vite + React 18 + TypeScript
├── UI：Tailwind CSS + 少量 Radix 组件（移动端优先）
├── 状态：jotai（轻量）
├── 存储：Dexie（IndexedDB）：卡片状态 / 每日统计 / 设置
├── 算法：ts-fsrs（FSRS v6）
├── 离线：vite-plugin-pwa（预缓存 + manifest）
├── 发音：Web Speech API
└── 词书数据：qwerty-learner 词书 JSON + ECDICT 增强脚本（Node 一次性处理）
```

### MVP 功能清单

- [ ] 词书选择 + 章节划分
- [ ] 学习卡片：单词 / 音标 / 释义，打字或选择两种答题模式
- [ ] FSRS 复习调度：今日待复习队列，四档评分（Again/Hard/Good/Easy）
- [ ] 统计：今日学习数、连续打卡天数
- [ ] 设置：每日新词量、发音开关、深色模式
- [ ] 进度导出/导入（备份 JSON）

### 数据流水线（构建前跑一次）

```
1. 从 qwerty-learner 仓库下载选定词书 JSON
2. Node 脚本用 ECDICT (SQLite) 补充：英文释义、tag 考纲、bnc/frq 词频、exchange 词形
3. 输出压缩后的 books/{id}.json → 打包进 PWA
```

---

## 六、风险与注意事项

- **iOS 激活间隔**：Safari 对长时间未打开的 PWA 可能清除网站数据，重要进度要勤导出（或后期做 Capacitor 版规避）。
- **Service Worker 必须 https 或 localhost**：开发用 `vite dev`（localhost 没问题），部署到任意静态托管（Vercel/Cloudflare Pages/GitHub Pages 均免费）或局域网 http。
- **语音引擎**：`speechSynthesis` 的离线可用性取决于设备已下载的语音包；做静默失败兜底。
- **IndexedDB 容量**：纯文本数据几 MB 级别，远低于配额上限，无风险。
