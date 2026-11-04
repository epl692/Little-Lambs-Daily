<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { EMOJI, emojiChar, emojiLabel } from '../lib/threads';

  let { ctx, entry }: { ctx: App; entry: Entry } = $props();
  let picking = $state(false);
  const pills = $derived(ctx.app.reactions[entry.id] ?? []);
  const target = $derived({ id: entry.id, space: entry.space });

  async function toggle(emoji: string) {
    picking = false;
    try {
      await ctx.threads.toggleReaction(target, emoji);
      ctx.buzz();
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not react');
    }
  }
  const who = () => (ctx.app.whoReacted = { entry: entry.id, space: entry.space });

  // Long-press (or right-click) a pill to see who reacted; the ⓘ button does the same for keyboards.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  const press = () => {
    fired = false;
    timer = setTimeout(() => ((fired = true), who()), 500);
  };
  const release = () => clearTimeout(timer);
  const click = (emoji: string) => (fired ? (fired = false) : toggle(emoji));
</script>

<div class="bar row wrap" data-testid="reaction-bar">
  {#each pills as p (p.emoji)}
    <button
      type="button"
      class="pill"
      class:mine={p.mine}
      aria-pressed={p.mine}
      aria-label="{emojiLabel(p.emoji)}, {p.count}{p.mine ? ', including you' : ''}"
      data-testid="reaction-{p.emoji}"
      onclick={() => click(p.emoji)}
      onpointerdown={press}
      onpointerup={release}
      onpointerleave={release}
      onpointercancel={release}
      oncontextmenu={(e) => (e.preventDefault(), who())}
    >
      <span aria-hidden="true">{emojiChar(p.emoji)}</span> <span data-testid="reaction-count">{p.count}</span>
    </button>
  {/each}
  <button type="button" class="pill add" aria-label="Add a reaction" aria-expanded={picking} data-testid="react-open" onclick={() => (picking = !picking)}>☺+</button>
  {#if pills.length}
    <button type="button" class="pill info" aria-label="See who reacted" data-testid="react-who" onclick={who}>ⓘ</button>
  {/if}
</div>
{#if picking}
  <div class="picker row wrap" role="group" aria-label="Pick a reaction" data-testid="react-picker">
    {#each EMOJI as e (e.key)}
      <button type="button" class="pick" aria-label={e.label} data-testid="pick-{e.key}" onclick={() => toggle(e.key)}>{e.char}</button>
    {/each}
  </div>
{/if}

<style>
  .bar { gap: 6px; margin-top: 6px; }
  .pill { min-height: 32px; min-width: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 0.875rem; cursor: pointer; -webkit-touch-callout: none; user-select: none; }
  .pill.mine { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); font-weight: 600; }
  .pill.add, .pill.info { color: var(--muted); }
  .picker { gap: 4px; margin-top: 6px; padding: 6px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
  .pick { width: 44px; height: 44px; border: 0; border-radius: 12px; background: transparent; font-size: 1.5rem; cursor: pointer; }
  .pick:hover { background: var(--surface); }
</style>
