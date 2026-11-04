<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { familyNameOf } from '../lib/service';
  import InstallHint from '../components/InstallHint.svelte';
  import Avatar from '../components/Avatar.svelte';
  import StatusCard from '../components/StatusCard.svelte';
  import Timeline from '../components/Timeline.svelte';

  let { ctx }: { ctx: App } = $props();
  const KEY = 'lld.lastChild';
  const family = $derived(ctx.app.st?.families[0]);
  const kids = $derived(ctx.app.children);
  let picked = $state(typeof localStorage !== 'undefined' ? (localStorage.getItem(KEY) ?? '') : '');
  // One child: their day. Siblings: a switcher with an "All" option that merges them with name labels.
  const sel = $derived(kids.length === 1 ? kids[0]!.id : picked === 'all' || kids.some((k) => k.id === picked) ? picked : 'all');
  const pick = (id: string) => ((picked = id), localStorage.setItem(KEY, id));
</script>

<main class="page stack">
  <header class="row">
    <div class="grow">
      <h1 data-testid="parent-title">{family ? `${familyNameOf(family)} family` : ctx.app.appName}</h1>
      <p class="muted small">{ctx.app.daycareName}</p>
    </div>
    <button type="button" class="btn" aria-label="Settings" data-testid="open-settings" onclick={() => ctx.go({ name: 'settings' })}>⚙︎</button>
  </header>

  {#if kids.length === 0}
    <p class="muted" role="status">Loading…</p>
  {:else}
    {#if kids.length > 1}
      <div class="row wrap" role="group" aria-label="Which child">
        {#each kids as k (k.id)}
          <button type="button" class="chip row" aria-pressed={sel === k.id} data-testid="sibling-{k.name}" onclick={() => pick(k.id)}><Avatar id={k.id} name={k.name} color={k.color} size={24} />{k.name}</button>
        {/each}
        <button type="button" class="chip" aria-pressed={sel === 'all'} data-testid="sibling-all" onclick={() => pick('all')}>All</button>
      </div>
    {/if}
    {#if kids.length === 1}
      <div class="row"><Avatar id={kids[0]!.id} name={kids[0]!.name} color={kids[0]!.color} /><strong data-testid="my-child">{kids[0]!.name}</strong></div>
    {/if}
    {#if sel === 'all'}
      {#each kids as k (k.id)}<StatusCard {ctx} childId={k.id} name={k.name} />{/each}
    {:else}
      <StatusCard {ctx} childId={sel} />
    {/if}
    {#if kids.some((k) => k.allergies && (sel === 'all' || k.id === sel))}
      <p class="muted small" role="note">⚠ Allergies on file: {kids.filter((k) => k.allergies && (sel === 'all' || k.id === sel)).map((k) => `${k.name} (${k.allergies})`).join('; ')}</p>
    {/if}
    <Timeline {ctx} childId={sel} />
  {/if}

  <InstallHint />
</main>
