<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { applyFilter, sortEntries, withHourBreaks, type Order } from '../lib/timeline';
  import { dayRange, isSameDay, shiftDay } from '../lib/time';
  import DayNav from './DayNav.svelte';
  import EmptyArt from './EmptyArt.svelte';
  import FilterChips from './FilterChips.svelte';
  import TimelineItem from './TimelineItem.svelte';

  // One child's day, or every child on this device ('all', for a parent with siblings).
  let { ctx, childId }: { ctx: App; childId: string } = $props();

  const ORDER_KEY = 'lld.order';
  let day = $state(Date.now());
  let filter = $state('all');
  let order = $state<Order>((typeof localStorage !== 'undefined' && (localStorage.getItem(ORDER_KEY) as Order)) || 'newest');
  let entries = $state<Entry[]>([]);

  const ids = $derived(new Set(childId === 'all' ? ctx.app.children.map((c) => c.id) : [childId]));
  const names = $derived(new Map(ctx.app.children.map((c) => [c.id, c.name])));
  const showChild = $derived(childId === 'all' && ctx.app.children.length > 1);

  $effect(() => {
    const [s, e] = dayRange(day);
    const want = ids;
    return ctx.api.data
      .query({ type: 'daycare.entry', where: (o) => want.has(o.fields.child) && Number(o.fields.at) >= s && Number(o.fields.at) < e })
      .subscribe((rows) => (entries = rows));
  });

  const rows = $derived(withHourBreaks(sortEntries(applyFilter(entries, filter), order)));
  const today = $derived(isSameDay(day, ctx.app.now));

  function flip() {
    order = order === 'newest' ? 'oldest' : 'newest';
    localStorage.setItem(ORDER_KEY, order);
  }

  // Swipe left/right to change day; vertical scrolling is left alone.
  let start: { x: number; y: number } | undefined;
  const down = (e: PointerEvent) => (start = { x: e.clientX, y: e.clientY });
  const up = (e: PointerEvent) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = undefined;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) day = shiftDay(day, dx < 0 ? 1 : -1);
  };
</script>

<DayNav {day} now={ctx.app.now} onchange={(ms) => (day = ms)} />
<div class="row" style="justify-content: space-between">
  <FilterChips value={filter} onchange={(id) => (filter = id)} />
</div>
<div class="row small" style="margin: -4px 0 10px">
  <button type="button" class="btn ghost" data-testid="order-toggle" onclick={flip} aria-label="Order: {order === 'newest' ? 'newest first' : 'oldest first'}. Tap to flip.">
    {order === 'newest' ? 'Newest first ↓' : 'Oldest first ↑'}
  </button>
</div>

<div class="list" role="region" aria-label="Timeline for {today ? 'today' : 'the selected day'}" onpointerdown={down} onpointerup={up} onpointercancel={() => (start = undefined)}>
  {#if rows.length === 0}
    <EmptyArt text={filter !== 'all' ? 'Nothing here for this filter.' : today ? 'Nothing logged yet today.' : 'Nothing was logged on this day.'} />
  {:else}
    <ol class="tl" data-testid="timeline">
      {#each rows as r (r.key)}
        {#if r.type === 'hour'}
          <li class="hour" aria-hidden="true">{r.label}</li>
        {:else}
          <TimelineItem entry={r.entry} now={ctx.app.now} childName={showChild ? (names.get(String(r.entry.fields.child)) ?? '') : ''} />
        {/if}
      {/each}
    </ol>
  {/if}
</div>

<style>
  .list { touch-action: pan-y; min-height: 40vh; }
  /* A continuous 2px line down the left, from the top of the list through the last item. */
  .tl { position: relative; margin: 0; padding: 0 0 0 32px; }
  .tl::before { content: ''; position: absolute; left: 11px; top: 0; bottom: 0; width: 2px; background: var(--line); }
  .hour { list-style: none; margin: 0 0 6px; color: var(--muted); font-size: 0.8125rem; font-weight: 600; }
</style>
