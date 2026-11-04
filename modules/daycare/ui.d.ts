// The compiled Svelte UI (ui/dist/ui.js, built by `npm run build:ui`).
declare module '*/ui/dist/ui.js' {
  export interface UiApi {
    appName: string;
    daycareName: string;
    [capability: string]: unknown;
  }
  export function mount(target: HTMLElement, api: UiApi): () => void;
}
