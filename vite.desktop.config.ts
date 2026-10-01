import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// 桌面单文件版构建配置：无 PWA（file:// 下没有 Service Worker），
// virtual:pwa-register 指向本地桩实现；vite-plugin-singlefile 把 JS/CSS 全部内联进一个 HTML。
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      {
        find: 'virtual:pwa-register',
        replacement: path.resolve(__dirname, 'src/pwa-stub.ts'),
      },
    ],
  },
  base: './',
  build: {
    outDir: 'dist-desktop',
    emptyOutDir: true,
  },
})
