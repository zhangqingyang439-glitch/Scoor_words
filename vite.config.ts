import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'scoop words',
        short_name: 'scoop words',
        description: '纯本地离线英语背单词：四遍通关学习法，FSRS 无关的错误率复习，进度存本机',
        lang: 'zh-CN',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // jpg/jpeg：首页的冬夜全景；glb：水面上的小船 ——
        // 都是 Three.js 运行时按路径加载的，不列进预缓存手机断网就加载不到
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,json,woff2,glb}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // 真人发音：听过的自动缓存，离线也能播。
        // 有道词典音 → CacheFirst（词典音不会变）；
        // 百度句子音 → NetworkFirst（避免把偶发失败响应缓存死），离线回退缓存
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/dict\.youdao\.com\/dictvoice/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'human-pronunciation-v1',
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fanyi\.baidu\.com\/gettts/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'human-sentences-v2',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
