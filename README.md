# scoop words 🍦

纯本地运行的英语背单词 PWA：手机浏览器打开一次、添加到主屏幕，之后**完全离线可用**。
所有数据存在设备本机（IndexedDB），不联网、不注册、无广告。

## 学习模式：四遍通关法

每个单词过四遍，**第②③遍零错误才算真正通关**：

1. **极速记忆**：单词 + 词性释义 + 速记法，60 秒倒计时，可随时「下一个」
2. **看词填义**：按词性出空（n. ___ / v. ___），填对任一释义即过；**答错的词当场重现直到全对**
3. **看义默写**：显示中文释义，默写英文；答错同样当场重现
4. **例句翻译**：例句（目标词高亮）→ 自己翻译 → 详细讲解（整句翻译 + 完整释义 + 逐词释义 + 速记法）

学习全程可用**草稿板**（✏️）手写加深记忆。

复习机制：通关的词按**错误率**排序，每天复习错误率最高的前 50%（数量 = 每日额度，24h 内不重复）。

## 记词本：单词书架

- 一本本"单词书"卡片（书封风格），可新建 / 命名 / 删除多本，默认「我的生词」
- 学习时点 ✓ 收藏，弹层选放哪本书；首页手动添加的词同样选书
- 点开一本书 → 词列表（词 / 释义 / 移出）→ 复习本书（完整四遍，不限量）

## 首页：添加生词

输入单词自动查释义（内置 1.7 万高频词释义库，含音标），可手动修改，查不到的词手填释义；
添加后进入下次学习队列，走四遍流程。

## 学习计划（类百词斩）

- 选词书后可设计划：**按天数背完**（自动算每日额度）或**直接指定每日词数**
- 额度背完不锁死，可以无限「继续加背」
- 中途退出再进 = 「接着学习」，从断点继续

## 技术栈

- Vite + React 19 + TypeScript + Tailwind CSS v4
- Dexie（IndexedDB）：词卡进度（stage/对错/收藏书）、单词书、每日统计、学习计划
- vite-plugin-pwa 离线缓存（预缓存全部资源，约 6.4MB）
- 发音：系统离线语音引擎（Web Speech API）
- 草稿板：Canvas 手写

## 数据来源

- 词书：[qwerty-learner](https://github.com/RealKai42/qwerty-learner) 词库（上游 [kajweb/dict](https://github.com/kajweb/dict)），内置高考 3500 / CET-4 / 考研
- 释义增强：[ECDICT](https://github.com/skywind3000/ECDICT)（词性分组释义 + 词形变化，覆盖 96%+；另提取 1.7 万高频词释义库供手动添加查词）
- 例句：[DictionaryByGPT4](https://github.com/Ceelog/DictionaryByGPT4)（带中文翻译，3900+ 句）+ 4000 Essential Words 例句库，合计覆盖 85% 词书词汇
- 速记法：DictionaryByGPT4 的词根/词缀分析（约 5900 条，如 disable = dis-(否定) + able(能)）

### 数据管道（需要重跑时）

```sh
npm i -D better-sqlite3
# 下载 ECDICT sqlite（npm 包 cdict_query 内含全量库）解压到 data-tmp/package/db/
# 下载 gptwords.json（DictionaryByGPT4）到 data-tmp/gpt4dict/
# 下载 ew-sentence.json / ew-meaning.json 到 data-tmp/
node scripts/build-data.mjs
```

产物：增强版 `public/books/*.json`（+senses/forms）与 `public/sentences.json`。

## 本地开发

```sh
npm install
npm run dev          # 开发调试，http://localhost:5173
npm run build        # 类型检查 + 产出 dist/
npm run preview      # 本地预览构建产物
npm run icons        # 重新生成 PWA 图标
```

## 怎么装到手机上离线用

Service Worker 要求 **https**（localhost 除外），持久离线需要先部署：

1. 把 `dist/` 部署到 [Vercel](https://vercel.com) 或 [Cloudflare Pages](https://pages.cloudflare.com)（拖拽即可，免费 https）
2. 手机浏览器打开网址，等首页出现（首次下载约 3.4MB 缓存）
3. 安卓 Chrome：菜单 →「添加到主屏幕」；iOS Safari：分享 →「添加到主屏幕」
4. 之后从主屏幕图标启动即为独立应用，断网完全可用

> 局域网试用：`npm run preview -- --host`，手机同 WiFi 访问；但 http 下 SW 不生效，仅作快速体验。

## 备份与恢复

设置页 →「导出进度」生成 JSON 备份（含学习进度、收藏、计划）；「导入进度」可还原。
iOS 对长期不打开的 PWA 可能回收网站数据，建议定期导出。

## 项目结构

```
src/
├── main.tsx              入口 + Service Worker 注册
├── App.tsx               四 Tab 壳：首页/记词本/词书/设置
├── db.ts                 Dexie v2：WordProgress / BookPlan / DayStat
├── study.ts              会话编排：额度/断点续学/错误率复习/记词本会话
├── match.ts              词性解析、中英文判题、例句高亮
├── books.ts              词书清单与按需加载
├── sentences.ts          例句库加载
└── components/
    ├── Home.tsx          计划进度 + 开始/接着学习/继续加背
    ├── Notebook.tsx      记词本
    ├── Books.tsx         词书选择 + 计划编辑
    ├── SettingsPage.tsx  备份/清空/关于
    ├── speech.ts         离线发音
    └── study/
        ├── StudyFlow.tsx     四遍轮次调度（含断点续学）
        ├── Stage1Memorize.tsx 极速记忆（60s 倒计时）
        ├── Stage2Fill.tsx     看词填义（按词性出空）
        ├── Stage3Spell.tsx    看义默写
        └── Stage4Sentence.tsx 例句翻译 + 讲解
public/
├── books/*.json          增强版词书（senses + forms）
├── sentences.json        例句库 + 逐词释义表
└── icons/                PWA 图标（冰淇淋）
scripts/
├── build-data.mjs        数据管道
└── make-icons.mjs        零依赖 PNG 图标生成器
docs/tech-research.md     技术调研
```
