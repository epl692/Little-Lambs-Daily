<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { familyNameOf } from '../lib/service';

  let { ctx }: { ctx: App } = $props();
  let kids = $state<Record<string, string[]>>({});

  // Live: children arrive as families sync in.
  $effect(() => {
    const q = ctx.api.data.query({ type: 'daycare.child' });
    return q.subscribe((rows) => {
      const by: Record<string, string[]> = {};
      for (const r of rows) {
        if (r.fields.active === false) continue;
        (by[r.space] ??= []).push(String(r.fields.firstName ?? ''));
      }
      kids = by;
    });
  });
  const families = $derived(ctx.app.st?.families ?? []);
</script>

<main class="page stack">
  <header class="row">
    <div class="grow">
      <h1 data-testid="daycare-title">{ctx.app.daycareName}</h1>
      <p class="muted small">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    </div>
    <button type="button" class="btn" aria-label="Settings" data-testid="open-settings" onclick={() => ctx.go({ name: 'settings' })}>⚙︎</button>
  </header>

  {#if families.length === 0}
    <section class="card center stack" data-testid="roster-empty">
      <h2>No families yet</h2>
      <p class="muted">Add a family, then invite a parent by QR code. It takes about a minute.</p>
      <button type="button" class="btn primary big" data-testid="add-first-family" onclick={() => ctx.go({ name: 'addFamily' })}>Add your first family</button>
    </section>
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
    <button type="button" class="btn primary" data-testid="add-family" onclick={() => ctx.go({ name: 'addFamily' })}>+ Family</button>
  {/if}
  <p class="muted small center">Daily log screens arrive in the next build.</p>
</main>

<style>
  .fam { width: 100%; font: inherit; color: inherit; cursor: pointer; min-height: 64px; }
</style>
