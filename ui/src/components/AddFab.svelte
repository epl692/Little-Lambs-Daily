<script lang="ts">
  import type { App } from '../lib/app.svelte';

  // The floating "+" (SPEC 6.5): bottom-right, 64px, in the thumb zone. `preset` skips the "who" step.
  let { ctx, preset }: { ctx: App; preset?: string[] } = $props();
</script>

<button type="button" class="fab" aria-label="Add to the day" data-testid="add-fab" onclick={() => ctx.openAdd({ preset })}>+</button>

<style>
  .fab { position: fixed; z-index: 30; right: calc(max(0px, (100vw - 640px) / 2) + 16px); bottom: calc(16px + env(safe-area-inset-bottom)); width: 64px; height: 64px; border-radius: 50%; border: 0; background: var(--accent); color: #04211e; font-size: 2rem; line-height: 1; font-weight: 500; cursor: pointer; box-shadow: 0 4px 14px rgb(0 0 0 / 30%); }
  .fab:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 3px; }
</style>
