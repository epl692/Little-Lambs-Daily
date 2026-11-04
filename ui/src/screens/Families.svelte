<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { familyNameOf } from '../lib/service';
  import Top from '../components/Top.svelte';

  let { ctx }: { ctx: App } = $props();
  const families = $derived(ctx.app.st?.families ?? []);
  const kids = $derived(
    ctx.app.children.reduce<Record<string, string[]>>((m, c) => ((m[c.space] ??= []).push(c.name), m), {}),
  );
</script>

<main class="page stack">
  <Top {ctx} title="Families" />
  {#if families.length === 0}
    <p class="muted">No families yet.</p>
  {:else}
    <ul class="stack" style="list-style: none; padding: 0; margin: 0" aria-label="Families">
      {#each families as f (f.id)}
        <li>
          <button type="button" class="card row fam" data-testid="family-card" onclick={() => ctx.go({ name: 'family', space: f.id })}>
            <span class="avatar" aria-hidden="true">{familyNameOf(f).slice(0, 1).toUpperCase()}</span>
            <span class="grow" style="text-align: left">
              <strong>{familyNameOf(f)}</strong>
              <span class="muted small" style="display: block">{(kids[f.id] ?? []).join(', ') || 'No children yet'}</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <button type="button" class="btn primary" data-testid="add-family" onclick={() => ctx.go({ name: 'addFamily' })}>+ Family</button>
</main>

<style>
  .fam { width: 100%; font: inherit; color: inherit; cursor: pointer; min-height: 64px; }
</style>
