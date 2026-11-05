<script lang="ts">
  import type { BlobRef, BlobsApi } from '../lib/types';

  // One image from an attachment: fetched (from this device, a peer or the relay) and shown as soon as it is here.
  let { blobs, ref, alt = '', fit = 'cover', ondone }: { blobs: BlobsApi | undefined; ref: BlobRef; alt?: string; fit?: 'cover' | 'contain'; ondone?: (url: string) => void } = $props();

  let url = $state('');
  let failed = $state(false);
  let attempt = $state(0);

  $effect(() => {
    void attempt;
    const r = ref;
    let live = true;
    let made = '';
    failed = false;
    url = '';
    if (!blobs) {
      failed = true;
      return;
    }
    blobs
      .toBlob(r)
      .then((b) => {
        if (!live) return;
        made = URL.createObjectURL(b);
        url = made;
        ondone?.(made);
      })
      .catch(() => live && (failed = true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  });
</script>

{#if url}
  <img src={url} {alt} style="object-fit: {fit}" data-testid="photo-img" />
{:else if failed}
  <button type="button" class="ph retry" onclick={() => attempt++}>Couldn’t load. Tap to retry</button>
{:else}
  <span class="ph" role="status" aria-label="Loading photo" data-testid="photo-loading"></span>
{/if}

<style>
  img { width: 100%; height: 100%; display: block; }
  .ph { display: grid; place-items: center; width: 100%; height: 100%; min-height: 80px; background: var(--bg); color: var(--muted); font: inherit; font-size: 0.8125rem; text-align: center; border: 0; animation: shimmer 1.4s ease-in-out infinite; }
  .retry { cursor: pointer; animation: none; }
  @keyframes shimmer { 50% { opacity: 0.55; } }
</style>
