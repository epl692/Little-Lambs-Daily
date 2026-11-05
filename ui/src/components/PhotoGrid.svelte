<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import type { BlobRef } from '../lib/types';
  import Photo from './Photo.svelte';

  let { ctx, entry, who = '' }: { ctx: App; entry: Entry; who?: string } = $props();
  const full = $derived((Array.isArray(entry.fields.photos) ? entry.fields.photos : []) as BlobRef[]);
  // older or foreign entries may have no thumbnails: fall back to the full image
  const thumbs = $derived((Array.isArray(entry.fields.thumbs) && entry.fields.thumbs.length === full.length ? entry.fields.thumbs : full) as BlobRef[]);
  const blobs = $derived(ctx.api.blobs);
  const open = (index: number) => (ctx.app.viewer = { photos: full, index, title: who ? `Photos of ${who}` : 'Photos' });
</script>

{#if full.length}
  <div class="grid" class:one={full.length === 1} data-testid="photo-grid">
    {#each thumbs as t, i (t.id + i)}
      <button type="button" class="cell" aria-label="Open photo {i + 1} of {full.length}" data-testid="photo-open" onclick={() => open(i)}>
        <Photo {blobs} ref={t} alt="Photo {i + 1}" />
      </button>
    {/each}
  </div>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 8px; }
  .grid.one { grid-template-columns: 1fr; }
  .cell { padding: 0; border: 0; border-radius: 10px; overflow: hidden; aspect-ratio: 1; background: var(--bg); cursor: pointer; }
  .one .cell { aspect-ratio: 4 / 3; }
</style>
