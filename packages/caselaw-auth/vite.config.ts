import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        client: resolve(__dirname, 'src/client-entry.ts'),
        server: resolve(__dirname, 'src/server.ts'),
        svelte: resolve(__dirname, 'src/svelte.ts'),
        vue: resolve(__dirname, 'src/vue-entry.ts'),
      },
      cssFileName: 'style',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['svelte/store', 'vue'],
      output: {
        globals: {
          'svelte/store': 'SvelteStore',
          vue: 'Vue',
        },
      },
    },
  },
})
