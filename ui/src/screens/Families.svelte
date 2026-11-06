<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { familyNameOf } from '../lib/service';
  import Top from '../components/Top.svelte';

  let { ctx }: { ctx: App } = $props();
  const families = $derived(ctx.app.st?.families ?? []);
  const archived = $derived(ctx.app.st?.archived ?? []);
  let restoreError = $state('');
  async function restore(space: string) {
    restoreError = '';
    try {
      await ctx.svc.restoreFamily(space);
      await ctx.refresh();
    } catch (e) {
      restoreError = e instanceof Error ? e.message : 'Could not restore the family.';
    }
  }
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
  {#if archived.length}
    <section class="card stack" aria-labelledby="ar-h">
      <h2 id="ar-h">Removed families</h2>
      <p class="small muted">Kept in case they come back. Their days are hidden from everyone until you restore them.</p>
      {#each archived as f (f.id)}
        <div class="row" data-testid="archived-family">
          <span class="grow">{familyNameOf(f)}</span>
          <button type="button" class="btn" data-testid="restore-family" onclick={() => restore(f.id)}>Restore</button>
        </div>
      {/each}
      {#if restoreError}<p class="err" role="alert">{restoreError}</p>{/if}
    </section>
  {/if}
  <button type="button" class="btn primary" data-testid="add-family" onclick={() => ctx.go({ name: 'addFamily' })}>+ Family</button>
</main>

<style>
  .fam { width: 100%; font: inherit; color: inherit; cursor: pointer; min-height: 64px; }
</style>
