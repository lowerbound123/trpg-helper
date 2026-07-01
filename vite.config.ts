import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

type BuildLog = {
  code?: string
  id?: string
  loc?: { file?: string } | null
  message?: string
}

function isVueUsePureAnnotationWarning(log: BuildLog) {
  if (log.code !== 'INVALID_ANNOTATION') return false
  const location = typeof log.loc === 'object' && log.loc ? String(log.loc.file ?? '') : ''
  const source = [
    log.id,
    location,
    log.message,
  ].filter(Boolean).join('\n')
  return source.includes('@vueuse/core')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      onLog(level: any, log: BuildLog, handler: any) {
        if (level === 'warn' && isVueUsePureAnnotationWarning(log)) return
        handler(level, log)
      },
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-pixi', test: /node_modules[\\/](pixi\.js|@pixi)[\\/]/, priority: 50 },
            { name: 'vendor-canvas', test: /node_modules[\\/](konva|vue-konva)[\\/]/, priority: 45 },
            { name: 'vendor-codemirror', test: /node_modules[\\/](@codemirror|@lezer|codemirror|style-mod|w3c-keyname)[\\/]/, priority: 40 },
            { name: 'vendor-vue', test: /node_modules[\\/](@vue|vue|pinia)[\\/]/, priority: 35 },
            { name: 'vendor-ui', test: /node_modules[\\/](@lucide[\\/]vue|@vueuse[\\/]core|reka-ui|class-variance-authority|clsx|tailwind-merge|vue-sonner)[\\/]/, priority: 30 },
            { name: 'vendor-uppy', test: /node_modules[\\/](@uppy)[\\/]/, priority: 28 },
            { name: 'vendor-finder-support', test: /node_modules[\\/](@floating-ui|@nanostores|@tanstack|@viselect|nanostores|overlayscrollbars|vanilla-lazyload|vue-advanced-cropper|mitt)[\\/]/, priority: 27 },
            { name: 'vendor-finder', test: /node_modules[\\/](vuefinder)[\\/]/, priority: 25, maxSize: 450_000 },
            { name: 'vendor-utils', test: /node_modules[\\/](zod|uuid|papaparse|@types[\\/]papaparse)[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      } as any,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/data/**', '**/logs/**', '**/src-tauri/target/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
