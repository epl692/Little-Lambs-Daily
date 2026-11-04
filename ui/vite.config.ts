import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Library mode: one ES module exporting mount(target, api). app-build (esbuild) imports the compiled file.
export default defineConfig({
  root,
  plugins: [svelte()],
  build: {
    lib: { entry: 'src/main.ts', formats: ['es'], fileName: () => 'ui.js' },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false, // esbuild minifies the final bundle
    target: 'es2022',
  },
});
