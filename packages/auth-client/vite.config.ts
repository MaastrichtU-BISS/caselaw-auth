import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CaselawAuthClient',
      fileName: 'caselaw-auth-client',
      formats: ['es', 'cjs'],
    },
  },
})
