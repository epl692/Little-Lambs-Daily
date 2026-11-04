<script lang="ts">
  import type { UiApi } from '../lib/types';

  let { text, label = 'QR code', api }: { text: string; label?: string; api: UiApi } = $props();
  // The QR library draws an SVG from the text; shown as an image so nothing is injected into the page.
  const src = $derived.by(() => {
    const svg = api.bridge.qrToSvg?.(text);
    return svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : '';
  });
</script>

{#if src}
  <img {src} alt={label} width="280" height="280" class="qr" />
{/if}

<style>
  .qr { display: block; margin: 0 auto; background: #fff; padding: 12px; border-radius: 12px; max-width: 100%; height: auto; box-sizing: content-box; }
</style>
