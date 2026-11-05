<script lang="ts">
  import { dayLabel, fmtDateLong, fromDateInput, isSameDay, shiftDay, toDateInput } from '../lib/time';

  let { day, now, onchange }: { day: number; now: number; onchange: (ms: number) => void } = $props();
  let picker: HTMLInputElement | undefined = $state();
  const today = $derived(isSameDay(day, now));
</script>

<nav class="row daynav" aria-label="Choose day">
  <button type="button" class="btn" aria-label="Previous day" data-testid="day-prev" onclick={() => onchange(shiftDay(day, -1))}>‹</button>
  <div class="grow center date">
    <button type="button" class="btn ghost" data-testid="day-label" aria-label="{dayLabel(day, now)}, {fmtDateLong(day)}. Choose a date" onclick={() => picker?.showPicker?.()}>
      <strong>{dayLabel(day, now)}</strong>
    </button>
    <input bind:this={picker} class="pick" type="date" tabindex="-1" aria-hidden="true" value={toDateInput(day)} onchange={(e) => { const v = fromDateInput(e.currentTarget.value); if (v) onchange(v); }} />
  </div>
  <button type="button" class="btn" aria-label="Next day" data-testid="day-next" onclick={() => onchange(shiftDay(day, 1))}>›</button>
  {#if !today}<button type="button" class="btn primary" data-testid="day-today" onclick={() => onchange(now)}>Today</button>{/if}
</nav>

<style>
  .daynav { margin: 4px 0 12px; }
  .date { position: relative; }
  .pick { position: absolute; inset: 0; opacity: 0; pointer-events: none; width: 100%; }
</style>
