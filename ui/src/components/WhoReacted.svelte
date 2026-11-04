<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { emojiChar, emojiLabel } from '../lib/threads';

  let { ctx, entry, space }: { ctx: App; entry: string; space: string } = $props();
  const pills = $derived(ctx.app.reactions[entry] ?? []);
  let names = $state<Record<string, string>>({});

  // Resolve every reacting user's name (display names live in the Space's member list).
  $effect(() => {
    const users = new Set(pills.flatMap((p) => p.users));
    for (const u of users) void ctx.nameOf(space, u).then((n) => (names[u] = n));
  });
  // you first, then everyone else by name (the stored order is arbitrary)
  const order = (users: string[]) =>
    [...users].sort((a, b) => Number(names[b] === 'You') - Number(names[a] === 'You') || (names[a] ?? '').localeCompare(names[b] ?? ''));
  const close =() => (ctx.app.whoReacted = undefined);
</script>

<button type="button" class="scrim" aria-label="Close" tabindex="-1" onclick={close}></button>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="who-t" data-testid="who-sheet">
  <header class="row hd">
    <h2 id="who-t" class="grow">Who reacted</h2>
    <button type="button" class="btn ghost" aria-label="Close" data-testid="who-close" onclick={close}>✕</button>
  </header>
  <div class="body stack">
    {#if pills.length === 0}
      <p class="muted">No reactions yet.</p>
    {/if}
    {#each pills as p (p.emoji)}
      <section aria-label={emojiLabel(p.emoji)}>
        <div class="big" aria-hidden="true">{emojiChar(p.emoji)}</div>
        <ul>
          {#each order(p.users) as u (u)}<li data-testid="who-name">{names[u] ?? '…'}</li>{/each}
        </ul>
      </section>
    {/each}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 50%); border: 0; z-index: 40; cursor: default; }
  .sheet { position: fixed; left: 50%; transform: translateX(-50%); bottom: 0; width: 100%; max-width: 640px; max-height: 70vh; display: flex; flex-direction: column; background: var(--surface); color: var(--text); border-radius: 20px 20px 0 0; box-shadow: 0 -8px 30px rgb(0 0 0 / 25%); z-index: 41; }
  .hd { padding: 12px 12px 4px 16px; }
  .hd h2 { margin: 0; }
  .body { padding: 8px 16px 20px; overflow: auto; }
  section { display: flex; gap: 12px; align-items: flex-start; }
  .big { font-size: 1.75rem; width: 40px; text-align: center; }
  ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; min-height: 40px; align-content: center; }
</style>
