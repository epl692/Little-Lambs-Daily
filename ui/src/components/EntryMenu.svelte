<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { summary, type Entry } from '../lib/format';

  let { ctx, entry }: { ctx: App; entry: Entry } = $props();
  let open = $state(false);
  // Entries logged together (one tap for several children) can be edited together. Providers only: a parent's entries are single.
  let batch = $state.raw<Entry[]>([]);
  $effect(() => {
    const id = entry.fields.batchId;
    if (!open || !id || ctx.role() !== 'provider' || entry.fields.kind === 'nap') return void (batch = []);
    void ctx.api.data.query({ type: 'daycare.entry', where: (o) => o.fields.batchId === id }).once().then((rows) => (batch = rows.length > 1 ? rows : []));
  });
  const text = $derived(String(entry.fields.text ?? '') || summary(entry));

  async function del() {
    open = false;
    if (!confirm('Delete this entry?')) return;
    try {
      await ctx.logger.remove([entry.id]);
      ctx.showToast('Deleted', () => ctx.logger.undo([entry.id]));
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not delete');
    }
  }
  const edit = () => ((open = false), ctx.openAdd({ edit: entry }));
  const editAll = () => ((open = false), ctx.openAdd({ edit: entry, batch }));
  async function copy() {
    open = false;
    try {
      await navigator.clipboard.writeText(text);
      ctx.showToast('Copied');
    } catch {
      ctx.showToast('Could not copy');
    }
  }
</script>

<span class="wrap">
  <button type="button" class="more" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} data-testid="entry-menu" onclick={() => (open = !open)}>⋯</button>
  {#if open}
    <button type="button" class="away" tabindex="-1" aria-label="Close menu" onclick={() => (open = false)}></button>
    <ul class="menu card" role="menu">
      <li role="none"><button type="button" role="menuitem" data-testid="menu-edit" onclick={edit}>Edit</button></li>
      {#if batch.length > 1}<li role="none"><button type="button" role="menuitem" data-testid="menu-edit-all" onclick={editAll}>Edit for all {batch.length} in batch</button></li>{/if}
      {#if text}<li role="none"><button type="button" role="menuitem" data-testid="menu-copy" onclick={copy}>Copy text</button></li>{/if}
      <li role="none"><button type="button" role="menuitem" class="danger" data-testid="menu-delete" onclick={del}>Delete</button></li>
    </ul>
  {/if}
</span>

<style>
  /* lives in the card's footer row, so it can never change the header row the timeline dot is centred on */
  .wrap { position: relative; margin-left: auto; }
  /* 28px tall like the header row (the timeline dot is centred on it), with a larger invisible tap area */
  .more { position: relative; width: 32px; height: 28px; padding: 0; border: 0; background: transparent; color: var(--muted); font-size: 1.25rem; line-height: 1; cursor: pointer; border-radius: 8px; }
  .more::after { content: ''; position: absolute; inset: -10px -8px; }
  .away { position: fixed; inset: 0; z-index: 25; background: transparent; border: 0; }
  .menu { position: absolute; right: 0; bottom: 30px; z-index: 26; list-style: none; margin: 0; padding: 4px; min-width: 150px; }
  .menu button { width: 100%; min-height: 44px; text-align: left; padding: 0 12px; border: 0; background: transparent; color: var(--text); font: inherit; border-radius: 10px; cursor: pointer; }
  .menu button:hover { background: var(--bg); }
  .menu .danger { color: var(--danger); }
</style>
