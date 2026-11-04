<script lang="ts">
  import type { Child } from '../lib/app.svelte';
  import type { SinceChip, Status } from '../lib/timeline';
  import Avatar from './Avatar.svelte';

  let { child, status, feeding, diaper, onopen }: { child: Child; status: Status; feeding?: SinceChip; diaper?: SinceChip; onopen: () => void } = $props();
  const present = $derived(status.state === 'here' || status.state === 'napping');
</script>

<button type="button" class="card tile" data-testid="child-card" data-state={status.state} onclick={onopen}>
  <span class="top row">
    <Avatar id={child.id} name={child.name} color={child.color} size={44} />
    <span class="grow nm">
      <strong data-testid="child-name-label">{child.name}</strong>
      {#if child.allergies}<span class="allergy" role="img" aria-label="Allergies: {child.allergies}" title={child.allergies} data-testid="allergy-badge">⚠</span>{/if}
    </span>
  </span>
  <span class="status" data-testid="child-status">{#if status.state === 'napping'}😴 {/if}{status.label}</span>
  {#if present && (feeding || diaper)}
    <span class="chips row wrap">
      {#if feeding}<span class="since" class:amber={feeding.amber} data-testid="since-feed" title="Since last feeding">🍼 {feeding.text}{#if feeding.amber}<span class="sr"> (a while ago)</span>{/if}</span>{/if}
      {#if diaper}<span class="since" class:amber={diaper.amber} data-testid="since-diaper" title="Since last diaper">🧷 {diaper.text}{#if diaper.amber}<span class="sr"> (a while ago)</span>{/if}</span>{/if}
    </span>
  {/if}
</button>

<style>
  .tile { display: flex; flex-direction: column; gap: 8px; text-align: left; font: inherit; color: inherit; cursor: pointer; min-height: 96px; width: 100%; }
  .tile[data-state='notHere'] { opacity: 0.75; }
  .tile[data-state='napping'] { border-color: var(--k-nap); }
  .nm { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
  .allergy { color: var(--danger); font-size: 1.1rem; }
  .status { color: var(--muted); font-variant-numeric: tabular-nums; }
  .since { font-size: 0.8125rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .since.amber { border-color: var(--warn); color: var(--warn); font-weight: 600; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
