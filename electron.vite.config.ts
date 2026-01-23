import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['sql.js', 'regedit']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@components': resolve('src/renderer/components'),
        '@pages': resolve('src/renderer/pages'),
        '@stores': resolve('src/renderer/stores'),
        '@hooks': resolve('src/renderer/hooks'),
        '@i18n': resolve('src/renderer/i18n')
      }
    },
    plugins: [react()]
  }
})
