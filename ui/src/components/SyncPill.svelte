<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import { describeSync, type SyncSnapshot } from '../lib/sync';

  // ● Synced / ◐ Connecting / ○ Offline. Tap for what that means (SPEC 6.8).
  let { ctx }: { ctx: App } = $props();
  // svelte-ignore state_referenced_locally
  const source = ctx.api.sync;
  let snap = $state<SyncSnapshot | undefined>(source?.get());
  let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  let open = $state(false);
  const view = $derived(describeSync(snap, online, ctx.app.now));

  onMount(() => {
    const off = source?.subscribe((s) => (snap = s));
    const up = () => (online = true);
    const down = () => (online = false);
    addEventListener('online', up);
    addEventListener('offline', down);
    return () => {
      off?.();
      removeEventListener('online', up);
      removeEventListener('offline', down);
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && (open = false)} />

{#if source}
  <span class="wrap">
    <button type="button" class="pill {view.dot}" aria-expanded={open} aria-label="Sync status: {view.label}. {open ? 'Hide' : 'Show'} details" data-testid="sync-pill" onclick={() => (open = !open)}>
      <span aria-hidden="true">{view.icon}</span> {view.label}
    </button>
    {#if open}
      <div class="details card stack" role="region" aria-label="Sync details" data-testid="sync-details">
        {#each view.lines as l (l)}<p class="small">{l}</p>{/each}
        {#if view.dot !== 'synced'}<button type="button" class="btn" data-testid="sync-direct" onclick={() => ((open = false), ctx.go({ name: 'direct' }))}>Connect directly</button>{/if}
      </div>
    {/if}
  </span>
{/if}

<style>
  .wrap { position: relative; }
  .pill { min-height: 44px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .synced span { color: #15803d; }
  .syncing span { color: #b45309; }
  .offline span { color: var(--muted); }
  :global(:root[data-theme='dark']) .synced span { color: #4ade80; }
  :global(:root[data-theme='dark']) .syncing span { color: #fbbf24; }
  .details { position: absolute; right: 0; top: 52px; z-index: 40; width: 260px; }
  .details p { margin: 0; }
</style>
