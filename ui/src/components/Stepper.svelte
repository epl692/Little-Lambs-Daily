<script lang="ts">
  let { value, oninput, label, min = 0, max = 16, step = 0.5, unit = 'oz', testid = '' }: { value: number; oninput: (v: number) => void; label: string; min?: number; max?: number; step?: number; unit?: string; testid?: string } = $props();
  const set = (v: number) => oninput(Math.min(max, Math.max(min, Math.round(v / step) * step)));
</script>

<div class="row stepper" role="group" aria-label={label}>
  <span class="grow"><strong>{label}</strong></span>
  <button type="button" class="btn" aria-label="Less {label}" data-testid="{testid}-minus" disabled={value <= min} onclick={() => set(value - step)}>−</button>
  <output class="val" aria-live="polite" data-testid="{testid}-value">{value} {unit}</output>
  <button type="button" class="btn" aria-label="More {label}" data-testid="{testid}-plus" disabled={value >= max} onclick={() => set(value + step)}>+</button>
</div>

<style>
  .stepper .btn { width: 48px; padding: 0; font-size: 1.25rem; }
  .val { min-width: 72px; text-align: center; font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
