import { defineConfig } from 'vite';
// Plugin Figma : un seul fichier JavaScript autonome (pas d'import possible).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'figma-plugin',
    emptyOutDir: false,
    target: 'es2017',
    minify: false,
    lib: {
      entry: 'figma-plugin/src/code.ts',
      formats: ['iife'],
      name: 'DSStudioBridge',
      fileName: () => 'code.js',
    },
  },
});
