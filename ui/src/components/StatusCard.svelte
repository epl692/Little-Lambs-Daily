<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { childStatus } from '../lib/timeline';
  import { dayRange, fmtClock } from '../lib/time';

  // "Checked in at 7:58a by Mom · Napping now 😴 0:35" for one child, from today's entries.
  let { ctx, childId, name = '' }: { ctx: App; childId: string; name?: string } = $props();
  let entries = $state<Entry[]>([]);
  const now = $derived(ctx.app.now);
  const dayStart = $derived(dayRange(now)[0]);

  $effect(() => {
    const [s, e] = dayRange(dayStart);
    return ctx.api.data
      .query({ type: 'daycare.entry', where: (o) => o.fields.child === childId && Number(o.fields.at) >= s && Number(o.fields.at) < e })
      .subscribe((rows) => (entries = rows));
  });

  const open = (e: Entry) => e.fields.kind === 'nap' && typeof e.fields.endAt !== 'number';
  const base = $derived(childStatus(entries.filter((e) => !open(e)), now));
  const napping = $derived(childStatus(entries, now));
  const line = $derived.by(() => {
    const t = base.label.replace(/^(Checked in|Picked up) /, '$1 at ');
    return base.state === 'here' || base.state === 'gone' ? `${t}${base.by ? ` by ${base.by}` : ''}` : base.state === 'notHere' ? 'Not here yet' : 'Here today';
  });
</script>

<section class="card row wrap" aria-label="{name ? name + ': ' : ''}status" data-testid="status-card">
  {#if name}<strong>{name}</strong>{/if}
  <span data-testid="status-line">{line}</span>
  {#if napping.state === 'napping'}<span class="nap" data-testid="status-nap">· Napping now 😴 {fmtClock(now - (napping.since ?? now))}</span>{/if}
</section>

<style>
  .nap { color: var(--k-nap); font-weight: 600; }
  :global(:root[data-theme='dark']) .nap { color: #a5b4fc; }
</style>
