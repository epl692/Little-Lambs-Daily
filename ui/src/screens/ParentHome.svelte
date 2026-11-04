<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { familyNameOf } from '../lib/service';
  import InstallHint from '../components/InstallHint.svelte';

  let { ctx }: { ctx: App } = $props();
  let kids = $state<Array<{ id: string; name: string }>>([]);
  $effect(() => {
    const q = ctx.api.data.query({ type: 'daycare.child' });
    return q.subscribe((rows) => (kids = rows.filter((r) => r.fields.active !== false).map((r) => ({ id: r.id, name: String(r.fields.firstName ?? '') }))));
  });
  const family = $derived(ctx.app.st?.families[0]);
</script>

<main class="page stack">
  <header class="row">
    <div class="grow">
      <h1 data-testid="parent-title">{family ? `${familyNameOf(family)} family` : ctx.app.appName}</h1>
      <p class="muted small">{ctx.app.daycareName}</p>
    </div>
    <button type="button" class="btn" aria-label="Settings" data-testid="open-settings" onclick={() => ctx.go({ name: 'settings' })}>⚙︎</button>
  </header>

  <section class="card stack" aria-labelledby="mine-h">
    <h2 id="mine-h">Your {kids.length === 1 ? 'child' : 'children'}</h2>
    <ul class="stack" style="list-style: none; padding: 0; margin: 0">
      {#each kids as k (k.id)}
        <li class="row"><span class="avatar" aria-hidden="true">{k.name.slice(0, 1).toUpperCase()}</span><span data-testid="my-child">{k.name}</span></li>
      {:else}
        <li class="muted">Loading…</li>
      {/each}
    </ul>
    <p class="muted small">Their daily timeline arrives in the next build.</p>
  </section>

  <InstallHint />
</main>
