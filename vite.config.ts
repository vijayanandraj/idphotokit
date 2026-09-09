import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

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
