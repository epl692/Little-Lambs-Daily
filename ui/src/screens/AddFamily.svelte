<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import Top from '../components/Top.svelte';

  let { ctx }: { ctx: App } = $props();
  let family = $state('');
  let child = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const { space } = await ctx.svc.addFamily(family, child);
      await ctx.refresh();
      ctx.go({ name: 'family', space: space.id }, { replace: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not add the family.';
      busy = false;
    }
  }
</script>

<main class="page">
  <Top {ctx} title="Add a family" />
  <form class="stack" onsubmit={submit}>
    <label class="field">Family name
      <input type="text" bind:value={family} placeholder="Lee" required data-testid="family-name" />
    </label>
    <label class="field">First child’s first name
      <input type="text" bind:value={child} placeholder="Ada" required data-testid="child-name" />
    </label>
    <p class="muted small">You can add more children and invite parents next.</p>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <button type="submit" class="btn primary big" disabled={busy} data-testid="create-family">{busy ? 'Adding…' : 'Add family'}</button>
  </form>
</main>
