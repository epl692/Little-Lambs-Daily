<script lang="ts">
  import { onMount } from 'svelte';
  import { watchForUpdate, type ContainerLike } from '../lib/updates';

  // A newer version of the app is downloaded and waiting. Offer it; never swap versions under someone mid-entry.
  let apply = $state<(() => void) | undefined>();
  onMount(() => {
    const sw = typeof navigator !== 'undefined' ? (navigator.serviceWorker as unknown as ContainerLike | undefined) : undefined;
    watchForUpdate(sw, (a) => (apply = a), () => location.reload());
  });
</script>

{#if apply}
  <div class="banner row" role="status" data-testid="update-banner">
    <span class="grow">A new version is ready.</span>
    <button type="button" class="btn" data-testid="update-reload" onclick={apply}>Reload</button>
    <button type="button" class="btn ghost" aria-label="Dismiss" onclick={() => (apply = undefined)}>Later</button>
  </div>
{/if}

<style>
  .banner { position: fixed; z-index: 55; top: 0; left: 0; right: 0; padding: 8px 12px; background: var(--accent); color: #04211e; box-shadow: 0 2px 8px rgb(0 0 0 / 25%); }
  .banner :global(.btn) { min-height: 40px; background: #fff; color: #04211e; border-color: transparent; }
  .banner :global(.btn.ghost) { background: transparent; }
</style>
