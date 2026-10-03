import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { parseSpecs } from './scripts/specs.mjs'

/**
 * Turns specs/documents.csv into a JavaScript module when the app imports it.
 *
 * The sheet is checked as it is read: a bad row stops the build (or shows Vite's error
 * overlay in dev) with the row and column named, instead of shipping a wrong spec.
 */
function specsSheet(): Plugin {
  return {
    name: 'specs-sheet',
    async load(id) {
      if (!id.endsWith('.csv')) return null
      this.addWatchFile(id)
      const rows = parseSpecs(await readFile(id, 'utf8'), 'specs/documents.csv')
      return `export default ${JSON.stringify(rows)};`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [specsSheet(), react()],

  optimizeDeps: {
    // onnxruntime-web locates its .wasm relative to its own module URL. Vite's dev-time
    // dependency pre-bundling rewrites the package into node_modules/.vite/deps, which
    // breaks that lookup: the request 404s, the dev server answers with index.html, and the
    // runtime fails with "expected magic word 00 61 73 6d, found 3c 21 64 6f" — the leading
    // bytes of "<!doctype html>". Leaving it unbundled keeps the relative path intact.
    // Production is unaffected either way; Vite emits the wasm as an asset there.
    exclude: ['onnxruntime-web'],
  },
})
