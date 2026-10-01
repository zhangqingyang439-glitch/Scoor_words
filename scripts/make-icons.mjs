// 生成 PWA 图标：@napi-rs/canvas 绘制
//
// 用的是「进入界面那个线描甜筒」，不是原来那个彩色卡通版：
// 黑底 + 白线，跟 App 里的墨白、梅枝、导航栏是同一套语言。
//
// 坐标是从 IceCreamIcon.tsx 那个 64 视口换算过来的，改了那边记得同步这里。
import { mkdirSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'

const BG = '#0a0a0b'
const INK = '#fafafa'
const FAINT = 'rgba(250,250,250,0.6)'

/** 64 视口 → 画布坐标。参照物：本体中心 (32,30)，圆 y=4..56 是上下边界 */
function mapper(size) {
  const s = size * 0.01135 // 让甜筒高度正好占 59% 的画布
  const X = (x) => size * 0.5 + (x - 32) * s
  const Y = (y) => size * 0.425 + (y - 30) * s
  return { s, X, Y }
}

function drawMark(ctx, size) {
  const { s, X, Y } = mapper(size)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.8 * s
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 奶油球
  ctx.beginPath()
  ctx.arc(X(32), Y(17), 13 * s, 0, Math.PI * 2)
  ctx.stroke()

  // 蛋筒
  ctx.beginPath()
  ctx.moveTo(X(20), Y(30))
  ctx.lineTo(X(44), Y(30))
  ctx.lineTo(X(32), Y(56))
  ctx.closePath()
  ctx.stroke()

  // 筒上的两道纹
  ctx.beginPath()
  ctx.moveTo(X(32), Y(36))
  ctx.lineTo(X(32), Y(48))
  ctx.moveTo(X(26), Y(41))
  ctx.lineTo(X(38), Y(41))
  ctx.stroke()

  // 球上那道高光弧。必须比主描边细得多 ——
  // 用同样的宽度会在 512px 下糊成一条横贯球顶的灰带，不是高光
  ctx.strokeStyle = FAINT
  ctx.lineWidth = 1.1 * s
  ctx.beginPath()
  ctx.moveTo(X(23), Y(12))
  ctx.quadraticCurveTo(X(32), Y(4), X(41), Y(12))
  ctx.stroke()
}

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = BG
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.225)
  ctx.fill()

  drawMark(ctx, size)

  // 品牌字
  ctx.fillStyle = INK
  ctx.font = `${Math.round(size * 0.105)}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('scoop words', size * 0.5, size * 0.875)

  return canvas.toBuffer('image/png')
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', drawIcon(192))
writeFileSync('public/icons/icon-512.png', drawIcon(512))
console.log('icons written: public/icons/icon-192.png, icon-512.png')
