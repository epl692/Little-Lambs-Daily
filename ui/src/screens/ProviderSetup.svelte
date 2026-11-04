<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import Top from '../components/Top.svelte';

  let { ctx }: { ctx: App } = $props();
  let name = $state('');
  // svelte-ignore state_referenced_locally
  let daycare = $state(ctx.app.daycareName);
  let busy = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await ctx.svc.setupProvider(name, daycare, ctx.app.appName);
      await ctx.refresh();
      ctx.home();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not set up. Try again.';
    } finally {
      busy = false;
    }
  }
</script>

<main class="page">
  <Top {ctx} title="Set up your daycare" />
  <form class="stack" onsubmit={submit}>
    <label class="field">Your name
      <input type="text" bind:value={name} placeholder="Miss Bri" autocomplete="name" required data-testid="provider-name" />
    </label>
    <label class="field">Daycare name
      <input type="text" bind:value={daycare} required data-testid="daycare-name" />
    </label>
    <p class="muted small">Parents will see your name next to what you log. Everything is encrypted on your devices.</p>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <button type="submit" class="btn primary big" disabled={busy} data-testid="create-daycare">{busy ? 'Setting up…' : 'Create daycare'}</button>
  </form>
</main>
