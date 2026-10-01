// 桌面单文件版：把整个应用（含全部词库数据）打包成一个双击即开的 HTML。
// 产物：桌面/Scoop Words.html（电脑版）+ 桌面/Scoop Words-手机版.html（同一内容，手机浏览器打开自动适配比例）
// 运行：npm run build:desktop
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'dist-desktop')

/**
 * 产物输出目录。
 *
 * 默认是「源代码」的上一级 —— 也就是说源码和产物平时是并排放在一起的。
 * 但如果把「源代码」单独挪到了别处（比如挪到桌面，方便随手改），
 * 默认规则就会把 70MB 的产物撒到那个目录里。
 *
 * 这种情况在「源代码」下建一个 build.config.json 指一下就行：
 *     { "outDir": "../Scoop" }        // 相对「源代码」解析
 */
const CONFIG_FILE = path.join(ROOT, 'build.config.json')
function resolveAppDir() {
  if (existsSync(CONFIG_FILE)) {
    try {
      // 去掉 BOM —— Windows 记事本和 PowerShell 的 Set-Content -Encoding UTF8
      // 都会在开头塞一个 \uFEFF，JSON.parse 见到它直接抛错
      const raw = readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '')
      const cfg = JSON.parse(raw)
      if (cfg.outDir) return path.resolve(ROOT, cfg.outDir)
    } catch (e) {
      console.warn(`⚠ build.config.json 读不了（${e.message}），改用默认输出目录`)
    }
  }
  return path.dirname(ROOT)
}
const appDir = resolveAppDir()

// 1. 单文件构建（无 PWA、JS/CSS 全内联）
execSync('npx vite build --config vite.desktop.config.ts', { cwd: ROOT, stdio: 'inherit' })

let html = readFileSync(path.join(OUT, 'index.html'), 'utf8')

// 2. 注入内嵌数据 + fetch 补丁（file:// 下 fetch 不可用，从内存直接返回）
const embed = {
  books: {},
  sentences: readFileSync(path.join(ROOT, 'public', 'sentences.json'), 'utf8'),
  dict: readFileSync(path.join(ROOT, 'public', 'dict.json'), 'utf8'),
  cn: readFileSync(path.join(ROOT, 'public', 'cn.json'), 'utf8'),
  zhsent: readFileSync(path.join(ROOT, 'public', 'zhsent.json'), 'utf8'),
}
const booksDir = path.join(ROOT, 'public', 'books')
for (const f of existsSync(booksDir) ? readdirSync(booksDir) : []) {
  if (f.endsWith('.json')) {
    embed.books[f.replace(/\.json$/, '')] = readFileSync(path.join(booksDir, f), 'utf8')
  }
}

// 每本词书都内嵌。file:// 下没有服务器，"没内嵌的" 就是 "点了打不开"。
// （这里原来写死了三本 gaokao/cet4/kaoyan，导致另外六本在电脑版里全是坏的。）
const bookEntries = Object.entries(embed.books)
  .map(([id, text]) => `    ${JSON.stringify(id)}: ${JSON.stringify(text)}`)
  .join(',\n')

// 防呆：src/books.ts 里声明了、但 public/books 里没有文件的词书，
// 在电脑版里就是"界面看得到、点了打不开"。这种事构建时就得吼出来。
const declaredBooks = [
  ...new Set(
    [...readFileSync(path.join(ROOT, 'src', 'books.ts'), 'utf8').matchAll(/id:\s*'([a-z0-9_]+)'/g)].map(
      (m) => m[1],
    ),
  ),
]
const missing = declaredBooks.filter((id) => !embed.books[id])
console.log(`词书：声明 ${declaredBooks.length} 本，内嵌 ${Object.keys(embed.books).length} 本 -> ${Object.keys(embed.books).join(' / ')}`)
if (missing.length) console.warn(`⚠ 以下词书在 src/books.ts 里声明了，但 public/books 里没有文件，电脑版会打不开：${missing.join(', ')}`)

const patch = `<script>
window.__EMBED = {
  books: {
${bookEntries}
  },
  sentences: ${embed.sentences},
  dict: ${embed.dict},
  cn: ${embed.cn},
  zhsent: ${embed.zhsent}
};
(function () {
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var m = url.match(/^(?:\\.?\\/)?(?:books\\/([a-z0-9_]+)\\.json|sentences\\.json|dict\\.json|cn\\.json|zhsent\\.json)$/);
      if (m) {
        var body = m[1] ? window.__EMBED.books[m[1]] : (url.indexOf('sentences') >= 0 ? window.__EMBED.sentences : (url.indexOf('dict') >= 0 ? window.__EMBED.dict : (url.indexOf('zhsent') >= 0 ? window.__EMBED.zhsent : window.__EMBED.cn)));
        // dict/sentences/cn/zhsent 是直接插值进来的对象字面量（books 才是字符串），
        // 不转回 JSON 文本的话 new Response(obj) 只会得到 "[object Object]"，
        // res.json() 立刻抛错 —— 桌面版查单词就整个失效了。
        if (body !== undefined && body !== null && typeof body !== 'string') body = JSON.stringify(body);
        if (body !== undefined && body !== null) {
          return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'application/json' } }));
        }
      }
    } catch (e) {}
    return realFetch ? realFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
  };
  // file:// 下没有 Service Worker：给个桩，避免注册报错
  try {
    if (!navigator.serviceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', { value: { register: function () { return Promise.resolve({}) }, getRegistrations: function () { return Promise.resolve([]) }, addEventListener: function () {} } });
    }
  } catch (e) {}
})();
</script>`

// 注到第一个 <script 前面，保证补丁先于应用执行
const scriptIdx = html.indexOf('<script')
html = html.slice(0, scriptIdx) + patch + html.slice(scriptIdx)

// 3. 输出目录
//    原来写死成桌面的「英语背单词」，文件夹一改名就会在桌面另建一个旧名字的文件夹，
//    产物被劈成两半。后来改成跟着源码走（源码上一级）。
//    现在源码可能被单独挪到别处，所以再进一步：优先看 build.config.json 里的 outDir，
//    没有才退回「源码上一级」。见文件开头的 resolveAppDir()。
if (!existsSync(appDir)) mkdirSync(appDir, { recursive: true })
writeFileSync(path.join(appDir, 'Scoop Words-手机版.html'), html)
writeFileSync(path.join(appDir, 'Scoop Words-电脑版.html'), html)

const usage = `scoop words · 使用说明
════════════════════════════

【电脑上用（最简单）】
  双击「Scoop Words-电脑版.html」即可，浏览器自动打开，断网也能用。

【手机上用（变成桌面 App 图标）★重点】
  原理：本地文件无法直接加手机桌面图标，需要把「部署包」放到免费网站上，
  得到一条网址，手机打开该网址后就能"添加到主屏幕"变成 App。

  第一步：把部署包传上网（电脑操作，约 3 分钟，免费）
    最简单（不用注册也行，注册可长期保留）：
      1. 电脑浏览器打开  https://app.netlify.com/drop
      2. 把本文件夹里的「部署包」文件夹整个拖进网页
         （或上传 部署包.zip）
      3. 等 30 秒左右，网页会给你一条网址，形如 https://xxxx.netlify.app
         —— 这条网址就是你的 App 地址
    国内访问更快的替代方案：
      · 腾讯 EdgeOne Pages：https://edgeone.ai  （拖拽/上传，国内快）
      · Cloudflare Pages：https://pages.cloudflare.com  （上传，免费）

  第二步：手机加图标（约 1 分钟）
    安卓（Chrome / Edge 浏览器）：
      打开上面那条网址 → 点右上角菜单（⋮）→「添加到主屏幕」→ 确认
    iPhone（Safari 浏览器）：
      打开网址 → 点底部「分享」按钮 →「添加到主屏幕」→ 添加

  完成！手机桌面出现「scoop words」图标，点开就是全屏 App，
  首次打开会缓存全部内容，之后断网也能用。

【更新版本】
  电脑上重新生成部署包后，回到托管网站重新上传一次即可（网址不变，
  手机图标不用重加）。

【外观】
  设置页 →「外观」可在 跟随系统 / 浅色 / 深色 之间切换。
  深色是纯黑底，浅色是纸白底；选「跟随系统」时会跟随手机的深色模式自动切。

【背景音乐】
  每个界面右上角都有一根小梅枝：
    · 点一下  → 开／关音乐。关着是光秃的梅枝挂着花苞，点开后梅花绽开、吐出花丝
    · 长按    → 跳到设置里的「背景音乐」，可以调音量和换音色
  每响一个音符，就有一朵花轻轻亮一下。

  枝子照着真实白梅画的：枝条带折角、花直接贴在枝干上开、
  五片圆瓣、花心一簇花丝，旁边还挂着几颗没开的花苞。

  八种音色（设置页里排成一排花苞，选中的那朵开）：
    八音盒 / 风铃 —— 有旋律
    雨声 / 海浪 / 风声 / 篝火 —— 现场合成的自然声，不是录音
    白噪 / 暖垫 —— 没有旋律，只有一层底
  音乐是现场合成的，不占体积、不联网、断网照响
  音量默认 50，压得很低 —— 是背景音，不是主角
  开关、音量、音色都会记住；下次打开时第一次点屏幕才出声
  （浏览器不允许没有任何点击就自动播放）
  切到后台会自动暂停，省电

  开场那屏右上角也有一根更大的梅枝（四朵花 + 两颗花苞 + 花丝），
  纯粹是装饰：开场页只认「进入」按钮，点别处不会有反应。

【记词本是一棵梅树】
  收藏的单词分门别类放，每本单词书是枝上的一颗花苞。
  点开哪本，哪本才绽开成花，花下面涌出这本书的词；
  再点一下收回去，又变回花苞。

  · 花下面能直接「整体复习」或「精确复习」（勾几个复习几个）
  · 每个词右边有朗读按钮，能看学到第几遍
  · 想删书点花下面的「删除这本书」，词会回到未收藏，学习记录保留

【词书是一棵梅树】
  「词书」页和记词本一样是一棵梅树：没在用的都是花苞，
  正在用的那本才开花，花下面挂着它的学习计划（几天背完 / 每天几个词）。
  点哪本哪本开花，原来那朵合上。

【在线词库】
  「词书」页最上面那朵花（花心是个 ＋）就是入口。
  里面有 372 部词典：中考高考、四六级、考研、雅思托福 GRE、
  新概念、外研社小学英语、代码练习、日语假名……可以搜可以按分类筛。

  · 目录是随 App 打包的，打开就能看，不联网也行
  · 点「下载」才去取词条，取回来整本存进本机，之后离线可用
  · 下好的书会像内置词书一样排在树上，能设计划、能走四遍通关
  · 不想要了点「已加入 · 移除」，学过的进度不会丢

  下载走的是 jsDelivr 的 CDN（国内不开梯子也能访问），
  取不到会自动退回 GitHub 原始地址。

【进度与备份】
  学习进度保存在浏览器的 IndexedDB 里（按浏览器隔离）。
  设置页 →「导出进度」可生成备份文件；换设备用「导入进度」恢复。

【常见问题】
  · 中文搜词 / 整句翻译：联网时自动在线翻译并缓存，之后离线也能查
  · 问题反馈：制作人 YYovo（2529138387@qq.com）

生成时间：${new Date().toLocaleString('zh-CN')}
`
writeFileSync(path.join(appDir, '使用说明.txt'), usage)

// 源代码（排除体积大的目录）
// 注意：如果脚本就是在桌面文件夹里跑的，ROOT 和 srcCopy 会是同一个目录，
// 先 rmSync 再 copy 就等于把源码自己删了。这种情况直接跳过自拷贝。
const srcCopy = path.join(appDir, '源代码')
if (path.resolve(srcCopy) === path.resolve(ROOT)) {
  console.log('源代码目录即项目根目录，跳过自拷贝（避免自删）')
} else {
  if (existsSync(srcCopy)) rmSync(srcCopy, { recursive: true, force: true })
  mkdirSync(srcCopy, { recursive: true })
  for (const item of ['src', 'public', 'scripts', 'docs', 'package.json', 'package-lock.json', 'vite.config.ts', 'vite.desktop.config.ts', 'tsconfig.json', 'index.html', 'README.md', 'build.config.json']) {
    const from = path.join(ROOT, item)
    if (!existsSync(from)) continue
    copyAll(from, path.join(srcCopy, item))
  }
  // 源码现在单独放在桌面，这里是打包时复制的一份快照。
  // 不放个牌子的话，桌面上就同时有「源代码」和「Scoop\源代码」两个，
  // 很容易改错那个 —— 而改错的那个下次打包就被覆盖了。
  writeFileSync(
    path.join(srcCopy, '！！！别在这里改代码！！！.txt'),
    [
      '这是一份打包快照，不要在这里改代码。',
      '',
      `真正的源码在：${ROOT}`,
      '',
      `这里是 npm run build:desktop 自动复制过来的，`,
      `为的是让「${path.basename(appDir)}」这个文件夹能独立运行、独立修改。`,
      '',
      '每次打包都会整份覆盖掉这里 —— 在这儿改的东西会丢。',
      '要改代码请去上面那个真正的源码目录。',
      '',
    ].join('\n'),
  )
}
function copyAll(from, to) {
  if (statSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true })
    for (const f of readdirSync(from)) {
      if (f === 'node_modules' || f.startsWith('.')) continue
      copyAll(path.join(from, f), path.join(to, f))
    }
  } else {
    copyFileSync(from, to)
  }
}

// 部署包（给手机加桌面图标用：上传到免费托管 → 手机打开网址 → 添加到主屏幕）
const deployDir = path.join(appDir, '部署包')
if (existsSync(deployDir)) rmSync(deployDir, { recursive: true, force: true })
copyAll(path.join(ROOT, 'dist'), deployDir)
try {
  execSync(`powershell -command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${path.join(appDir, '部署包.zip')}' -Force"`, { stdio: 'ignore' })
} catch {
  // zip 生成失败不影响主流程
}

// 4. 清掉早期布局遗留在桌面根目录的旧文件（那时候产物直接扔在桌面上）
//
//    两个保护：
//      · appDir 如果就是桌面，这一段整个跳过 —— 否则会把刚写出来的删掉
//      · 名字列表里带上「电脑版」，早期只清手机版，电脑版一直留在桌面上
const desktopRoot = path.join(os.homedir(), 'Desktop')
if (path.resolve(appDir) !== path.resolve(desktopRoot)) {
  for (const old of ['雪糕单词机.html', '雪糕单词机-手机版.html', 'Scoop Words.html', 'Scoop Words-手机版.html', 'Scoop Words-电脑版.html']) {
    const p = path.join(desktopRoot, old)
    if (existsSync(p)) rmSync(p)
  }
}

const sizeMB = (html.length / 1048576).toFixed(1)
console.log(`产物已写入：${appDir}`)
console.log(`  Scoop Words-手机版.html / Scoop Words-电脑版.html (${sizeMB} MB)`)
console.log(`  使用说明.txt + 源代码/ + 部署包/ + 部署包.zip`)
