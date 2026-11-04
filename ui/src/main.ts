import { mount as svelteMount, unmount } from 'svelte';
import App from './App.svelte';
import themeCss from './styles/theme.css?inline';
import { apply, followSystem, getChoice } from './lib/theme';

/** What the daycare module hands the UI. Grows each phase; the UI never imports framework packages. */
export interface UiApi {
  appName: string;
  daycareName: string;
  [capability: string]: unknown;
}

export function mount(target: HTMLElement, api: UiApi): () => void {
  const style = document.createElement('style');
  style.textContent = themeCss;
  document.head.append(style);
  apply(getChoice());
  const stopFollowing = followSystem();
  const app = svelteMount(App, { target, props: { api } });
  return () => {
    stopFollowing();
    void unmount(app);
    style.remove();
  };
}
