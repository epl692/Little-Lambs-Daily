<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { shareText } from '../lib/download';
  import { summarizeDay, summaryLines, summaryText } from '../lib/reports';
  import { fmtDuration, fmtTime, toDateInput } from '../lib/time';

  // The day at a glance for one child (SPEC 7.1): arrival, naps, bottles, food, diapers, notes. Share or print.
  let { ctx, entries, name, day }: { ctx: App; entries: Entry[]; name: string; day: number } = $props();
  const s = $derived(summarizeDay(entries, ctx.app.now));
  const lines = $derived(summaryLines(s));

  async function share() {
    const r = await shareText(`${name}'s day`, summaryText(name, day, s), `${name}-${toDateInput(day)}.txt`);
    if (r === 'saved') ctx.showToast('Summary saved to your downloads');
  }

  // "Print / save as PDF": only this card is visible to the print stylesheet while the dialog is open.
  let node: HTMLElement;
  function print() {
    node.classList.add('print-this');
    document.documentElement.classList.add('print-one');
    const done = () => {
      node.classList.remove('print-this');
      document.documentElement.classList.remove('print-one');
      removeEventListener('afterprint', done);
    };
    addEventListener('afterprint', done);
    window.print();
  }
</script>

<section class="card stack summary" aria-label="Daily summary for {name}" data-testid="day-summary" bind:this={node}>
  <header class="row">
    <h2 class="grow">{name}’s day</h2>
    <span class="muted small print-only">{new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
  </header>
  {#if s.empty}
    <p class="muted">Nothing was logged.</p>
  {:else}
    <dl class="grid">
      <dt>Here</dt>
      <dd data-testid="sum-here">{s.arrival ? fmtTime(s.arrival.at) : '—'}{s.departure ? ` – ${fmtTime(s.departure.at)}` : ''}</dd>
      <dt>Naps</dt>
      <dd data-testid="sum-naps">{s.naps.length ? `${fmtDuration(s.napMs)}${s.naps.length > 1 ? ` (${s.naps.length} naps)` : ''}` : 'None'}</dd>
      <dt>Bottles</dt>
      <dd data-testid="sum-bottles">{s.bottles.count ? `${s.bottles.count} · ${s.bottles.oz} oz finished` : 'None'}</dd>
      <dt>Diapers</dt>
      <dd data-testid="sum-diapers">{s.diapers.wet + s.diapers.soiled + s.diapers.dry ? `${s.diapers.wet} wet · ${s.diapers.soiled} soiled` : 'None'}</dd>
      {#if s.meals.length}<dt>Food</dt><dd data-testid="sum-food">{s.meals.join(' · ')}</dd>{/if}
      {#if s.photos}<dt>Photos</dt><dd>{s.photos}</dd>{/if}
    </dl>
    {#if s.notes.length}
      <ul class="notes">{#each s.notes as n, i (i)}<li>{n.text}</li>{/each}</ul>
    {/if}
    <span class="sr-only" data-testid="sum-text">{lines.join('. ')}</span>
  {/if}
  <div class="row noprint">
    <button type="button" class="btn" data-testid="sum-share" onclick={share}>Share</button>
    <button type="button" class="btn" data-testid="sum-print" onclick={print}>Print / PDF</button>
  </div>
</section>

<style>
  .summary h2 { margin: 0; font-size: 1.0625rem; }
  .grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .notes { margin: 0; padding-left: 18px; }
  .print-only { display: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media print {
    .print-only { display: inline; }
  }
</style>
