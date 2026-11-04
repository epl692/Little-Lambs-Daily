<script lang="ts">
  import type { App } from '../lib/app.svelte';

  let { ctx, title, back = true }: { ctx: App; title: string; back?: boolean } = $props();
</script>

<header class="row" style="margin-bottom: 16px">
  {#if back}
    <button type="button" class="btn ghost" onclick={() => ctx.back()} aria-label="Back">← Back</button>
  {/if}
  <h1 class="grow">{title}</h1>
</header>
