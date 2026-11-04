<script lang="ts">
  import { FILTERS } from '../lib/timeline';

  let { value, onchange }: { value: string; onchange: (id: string) => void } = $props();
</script>

<div class="chips" role="group" aria-label="Filter the timeline">
  {#each FILTERS as f (f.id)}
    <button type="button" class="chip" aria-pressed={value === f.id} data-testid="filter-{f.id}" onclick={() => onchange(f.id)}>{f.label}</button>
  {/each}
</div>

<style>
  .chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 10px; margin-bottom: 4px; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; white-space: nowrap; }
</style>
