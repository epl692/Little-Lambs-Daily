<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import Photo from './Photo.svelte';

  // Full screen: swipe or arrows to move, Save to keep a copy, Escape to close.
  let { ctx }: { ctx: App } = $props();
  const v = $derived(ctx.app.viewer!);
  let url = $state('');
  const n = $derived(v.photos.length);
  const go = (d: number) => (ctx.app.viewer = { ...v, index: (v.index + d + n) % n });
  const close = () => (ctx.app.viewer = undefined);

  let sx = 0;
  const down = (e: PointerEvent) => (sx = e.clientX);
  const up = (e: PointerEvent) => {
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 60 && n > 1) go(dx < 0 ? 1 : -1);
  };

  onMount(() => {
    const key = (e: KeyboardEvent) => (e.key === 'Escape' ? close() : e.key === 'ArrowRight' && n > 1 ? go(1) : e.key === 'ArrowLeft' && n > 1 ? go(-1) : undefined);
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const name = $derived(v.photos[v.index]?.name ?? 'photo.jpg');
</script>

<div class="viewer" role="dialog" aria-modal="true" aria-label={v.title} data-testid="photo-viewer">
  <header class="row">
    <button type="button" class="btn ghost" aria-label="Close" data-testid="viewer-close" onclick={close}>✕</button>
    <span class="grow count" aria-live="polite">{v.index + 1} / {n}</span>
    {#if url}<a class="btn" href={url} download={name} data-testid="viewer-save">Save</a>{/if}
  </header>
  <div class="stage" role="group" aria-label="Photo" onpointerdown={down} onpointerup={up}>
    {#key v.index}
      <Photo blobs={ctx.api.blobs} ref={v.photos[v.index]!} alt="Photo {v.index + 1} of {n}" fit="contain" ondone={(u) => (url = u)} />
    {/key}
  </div>
  {#if n > 1}
    <button type="button" class="nav prev" aria-label="Previous photo" data-testid="viewer-prev" onclick={() => go(-1)}>‹</button>
    <button type="button" class="nav next" aria-label="Next photo" data-testid="viewer-next" onclick={() => go(1)}>›</button>
  {/if}
</div>

<style>
  .viewer { position: fixed; inset: 0; z-index: 60; background: #000; color: #fff; display: flex; flex-direction: column; }
  header { padding: 8px 12px; gap: 8px; }
  .count { text-align: center; }
  header :global(.btn) { background: transparent; color: #fff; border: 1px solid rgb(255 255 255 / 50%); }
  .stage { flex: 1; min-height: 0; touch-action: pan-y; }
  .nav { position: absolute; top: 50%; width: 48px; height: 64px; transform: translateY(-50%); border: 0; background: rgb(0 0 0 / 40%); color: #fff; font-size: 2rem; cursor: pointer; }
  .prev { left: 0; border-radius: 0 12px 12px 0; }
  .next { right: 0; border-radius: 12px 0 0 12px; }
</style>
