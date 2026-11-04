<script lang="ts">
  import { KIND_META, authorLine, kindOf, summary, timeText, type Entry } from '../lib/format';
  import type { App } from '../lib/app.svelte';
  import { fmtDateLong, HOUR } from '../lib/time';
  import EntryMenu from './EntryMenu.svelte';
  import ReactionBar from './ReactionBar.svelte';
  import Thread from './Thread.svelte';

  let { ctx, entry, now, childName = '' }: { ctx: App; entry: Entry; now: number; childName?: string } = $props();
  // Providers may change anything (moderation); a parent only their own entries (the authz validator enforces the same).
  const canChange = $derived(ctx.role() === 'provider' || entry.fields.createdBy === ctx.me());
  const canWake = $derived(ctx.role() === 'provider');
  async function wake() {
    try {
      await ctx.logger.wake(entry);
      ctx.buzz();
      ctx.showToast(`${childName || 'Nap'} woke up`, () => ctx.logger.undo([entry.id]));
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not wake');
    }
  }
  const f = $derived(entry.fields);
  const kind = $derived(kindOf(entry));
  const meta = $derived(KIND_META[kind]);
  const time = $derived(timeText(entry, now));
  const open = $derived(kind === 'nap' && typeof f.endAt !== 'number');
  const long = $derived(open && now - Number(f.at) > 3 * HOUR);
  // Spoken version carries the date, because the day header is not part of each card.
  const label = $derived(`${meta.label}${childName ? ` for ${childName}` : ''}, ${fmtDateLong(Number(f.at))}, ${time}`);
</script>

<li class="item" class:open data-kind={kind} data-testid="tl-item">
  <span class="dot" aria-hidden="true"></span>
  <article class="card" aria-label={label}>
    <header class="hdr">
      <span aria-hidden="true">{meta.icon}</span>
      <strong data-testid="tl-label">{meta.label}</strong>
      <span class="time" data-testid="tl-time">{time}</span>
      {#if childName}<span class="who">· {childName}</span>{/if}
    </header>
    {#if summary(entry)}<p class="sum" data-testid="tl-summary">{summary(entry)}</p>{/if}
    {#if f.text}<p class="txt">{f.text}</p>{/if}
    {#if open && canWake}<button type="button" class="btn wake" data-testid="wake" onclick={wake}>☀️ Woke up</button>{/if}
    {#if long}<p class="hint">Still sleeping? This nap is over 3 hours.</p>{/if}
    <ReactionBar {ctx} {entry} />
    <Thread {ctx} {entry} />
    <footer class="meta">
      <span>{authorLine(entry)}{#if f.editedAt} · edited{/if}</span>
      {#if canChange}<EntryMenu {ctx} {entry} />{/if}
    </footer>
  </article>
</li>

<style>
  /* Geometry: the list's line is 2px wide with its centre 12px from the list's left edge; the item starts 32px in,
     so a 12px dot at left:-26px sits exactly on the line. The dot's centre is on the header row's centre:
     12px card padding + half of the 28px header. */
  .item { position: relative; list-style: none; margin: 0 0 12px; --kc: var(--k-providerNote); }
  .item[data-kind='checkin'] { --kc: var(--k-checkin); }
  .item[data-kind='checkout'] { --kc: var(--k-checkout); }
  .item[data-kind='nap'] { --kc: var(--k-nap); }
  .item[data-kind='bottle'] { --kc: var(--k-bottle); }
  .item[data-kind='snack'] { --kc: var(--k-snack); }
  .item[data-kind='meal'] { --kc: var(--k-meal); }
  .item[data-kind='diaper'] { --kc: var(--k-diaper); }
  .item[data-kind='photo'] { --kc: var(--k-photo); }
  .item[data-kind='providerNote'] { --kc: var(--k-providerNote); }
  .item[data-kind='familyNote'] { --kc: var(--k-familyNote); }
  .item[data-kind='home'] { --kc: var(--k-home); }
  .dot { position: absolute; left: -26px; top: 26px; width: 12px; height: 12px; border-radius: 50%; background: var(--kc); box-shadow: 0 0 0 3px var(--bg); transform: translateY(-50%); }
  .open .dot { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: translateY(-50%) scale(1.5); } }
  .card { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--kc); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px; }
  .hdr { display: flex; align-items: center; gap: 6px; min-height: 28px; flex-wrap: wrap; }
  .time { color: var(--muted); font-variant-numeric: tabular-nums; }
  .who { color: var(--muted); }
  .sum { margin: 4px 0 0; }
  .txt { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .wake { margin-top: 8px; min-height: 44px; }
  .hint { margin: 6px 0 0; color: var(--warn); font-weight: 600; }
  .meta { display: flex; align-items: center; min-height: 28px; margin-top: 4px; color: var(--muted); font-size: 0.8125rem; }
</style>
