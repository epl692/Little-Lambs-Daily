<script lang="ts">
  import type { App } from '../lib/app.svelte';

  let { ctx }: { ctx: App } = $props();
  const toast = $derived(ctx.app.toast);

  async function undo() {
    const t = ctx.app.toast;
    if (!t?.undo) return;
    ctx.dismissToast();
    try {
      await t.undo();
      ctx.showToast('Undone');
    } catch (e) {
      ctx.showToast(e instanceof Error ? `Could not undo: ${e.message}` : 'Could not undo');
    }
  }
</script>

{#if toast}
  <div class="snack row" role="status" aria-live="polite" data-testid="toast">
    <span class="grow" data-testid="toast-text">{toast.message}</span>
    {#if toast.undo}<button type="button" class="btn ghost" data-testid="toast-undo" onclick={undo}>Undo</button>{/if}
  </div>
{/if}

<style>
  .snack { position: fixed; z-index: 60; left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom)); width: calc(100% - 32px); max-width: 520px; box-sizing: border-box; padding: 6px 8px 6px 16px; border-radius: 14px; background: #1c2b2a; color: #fff; box-shadow: 0 6px 20px rgb(0 0 0 / 35%); }
  .snack :global(.btn.ghost) { color: #5eead4; }
  :global(:root[data-theme='dark']) .snack { background: #eaf3f2; color: #0f1b1a; }
  :global(:root[data-theme='dark']) .snack :global(.btn.ghost) { color: #0b5f57; }
</style>
