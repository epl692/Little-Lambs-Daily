<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { byChild, childStatus, DIAPERING, FEEDING, sinceChip } from '../lib/timeline';
  import { dayRange, fmtDateLong, MIN } from '../lib/time';
  import ChildCard from '../components/ChildCard.svelte';

  let { ctx }: { ctx: App } = $props();
  let entries = $state<Entry[]>([]);
  let pref = $state<'here' | 'all' | undefined>();

  // Today's entries for every child on this device, live. The range only changes at midnight.
  const dayStart = $derived(dayRange(ctx.app.now)[0]);
  $effect(() => {
    const [s, e] = dayRange(dayStart);
    return ctx.api.data.query({ type: 'daycare.entry', where: (o) => Number(o.fields.at) >= s && Number(o.fields.at) < e }).subscribe((rows) => (entries = rows));
  });

  const now = $derived(ctx.app.now);
  const threshold = $derived(ctx.app.sinceThresholdMinutes * MIN);
  const cards = $derived.by(() => {
    const by = byChild(entries);
    return ctx.app.children.map((child) => {
      const mine = by.get(child.id) ?? [];
      const status = childStatus(mine, now);
      return {
        child,
        status,
        feeding: sinceChip(mine, FEEDING, now, threshold),
        diaper: sinceChip(mine, DIAPERING, now, threshold),
      };
    });
  });
  const here = $derived(cards.filter((c) => c.status.state === 'here' || c.status.state === 'napping'));
  const view = $derived(pref ?? (here.length ? 'here' : 'all'));
  const shown = $derived(view === 'here' ? here : cards);
</script>

<main class="page stack">
  <header class="row">
    <div class="grow">
      <h1 data-testid="daycare-title">{ctx.app.daycareName}</h1>
      <p class="muted small">{fmtDateLong(now)}</p>
    </div>
    <button type="button" class="btn" aria-label="Families" data-testid="manage-families" onclick={() => ctx.go({ name: 'families' })}>👪</button>
    <button type="button" class="btn" aria-label="Settings" data-testid="open-settings" onclick={() => ctx.go({ name: 'settings' })}>⚙︎</button>
  </header>

  {#if (ctx.app.st?.families.length ?? 0) === 0}
    <section class="card center stack" data-testid="roster-empty">
      <h2>No families yet</h2>
      <p class="muted">Add a family, then invite a parent by QR code. It takes about a minute.</p>
      <button type="button" class="btn primary big" data-testid="add-first-family" onclick={() => ctx.go({ name: 'addFamily' })}>Add your first family</button>
    </section>
  {:else}
    <div class="row" role="group" aria-label="Which children to show">
      <button type="button" class="chip grow" aria-pressed={view === 'here'} data-testid="show-here" onclick={() => (pref = 'here')}>Here now ({here.length})</button>
      <button type="button" class="chip grow" aria-pressed={view === 'all'} data-testid="show-all" onclick={() => (pref = 'all')}>All children ({cards.length})</button>
    </div>
    {#if shown.length === 0}
      <p class="muted center" data-testid="roster-none">{cards.length === 0 ? 'No children yet. Open Families to add one.' : 'No one is checked in yet.'}</p>
    {:else}
      <ul class="grid" aria-label="Children">
        {#each shown as c (c.child.id)}
          <li><ChildCard child={c.child} status={c.status} feeding={c.feeding} diaper={c.diaper} onopen={() => ctx.go({ name: 'timeline', child: c.child.id })} /></li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (min-width: 560px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
