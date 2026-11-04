import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// css: 'injected' puts component styles in the JS (a <style> tag at runtime; the CSP allows inline styles),
// so the single ui.js file is all app-build needs to import.
export default { preprocess: vitePreprocess(), compilerOptions: { runes: true, css: 'injected' } };
