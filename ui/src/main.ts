import { mount as svelteMount, unmount } from 'svelte';
import App from './App.svelte';
import themeCss from './styles/theme.css?inline';
import { apply, followSystem, getChoice } from './lib/theme';
import type { UiApi } from './lib/types';

export type { UiApi } from './lib/types';

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
