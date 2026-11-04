<script lang="ts">
  import type { Child } from '../lib/app.svelte';
  import type { SinceChip, Status } from '../lib/timeline';
  import Avatar from './Avatar.svelte';

  // Tap opens the timeline. Long-press, or the "+" in the corner, opens quick-add for this child.
  let { child, status, feeding, diaper, onopen, onquick }: { child: Child; status: Status; feeding?: SinceChip; diaper?: SinceChip; onopen: () => void; onquick: () => void } = $props();
  const present = $derived(status.state === 'here' || status.state === 'napping');

  let timer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  const press = () => {
    fired = false;
    timer = setTimeout(() => ((fired = true), onquick()), 500);
  };
  const release = () => clearTimeout(timer);
  const click = () => (fired ? (fired = false) : onopen());
</script>

<div class="card tile" data-testid="child-card" data-state={status.state}>
  <button type="button" class="open" onclick={click} onpointerdown={press} onpointerup={release} onpointerleave={release} onpointercancel={release} oncontextmenu={(e) => e.preventDefault()}>
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
  <button type="button" class="qa" aria-label="Quick add for {child.name}" data-testid="quick-add" onclick={onquick}>+</button>
</div>

<style>
  .tile { position: relative; padding: 0; min-height: 96px; }
  .tile[data-state='notHere'] { opacity: 0.8; }
  .tile[data-state='napping'] { border-color: var(--k-nap); }
  .open { display: flex; flex-direction: column; gap: 8px; text-align: left; font: inherit; color: inherit; cursor: pointer; width: 100%; min-height: 96px; padding: 14px 14px 18px; background: transparent; border: 0; border-radius: var(--radius); -webkit-touch-callout: none; user-select: none; }
  /* bottom-right, so it never squeezes the name in a narrow two-column card */
  .qa { position: absolute; bottom: 2px; right: 2px; width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent; color: var(--accent-ink); font-size: 1.5rem; line-height: 1; cursor: pointer; }
  .qa:hover { background: var(--bg); }
  .nm { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
  .allergy { color: var(--danger); font-size: 1.1rem; }
  .status { color: var(--muted); font-variant-numeric: tabular-nums; padding-right: 30px; }
  .since { font-size: 0.8125rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .since.amber { border-color: var(--warn); color: var(--warn); font-weight: 600; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
