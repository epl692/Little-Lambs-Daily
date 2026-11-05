<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { fmtClock } from '../lib/time';
  import Avatar from './Avatar.svelte';

  // "Asleep now" (SPEC 6.3): sticky while any nap is open. Tap a child to wake them; "Wake all" wakes everyone.
  let { ctx }: { ctx: App } = $props();
  const naps = $derived(
    ctx.app.openNaps
      .map((n) => ({ nap: n, child: ctx.app.children.find((c) => c.id === n.fields.child) }))
      .filter((x) => x.child)
      .sort((a, b) => Number(a.nap.fields.at) - Number(b.nap.fields.at) || a.child!.name.localeCompare(b.child!.name) || a.nap.id.localeCompare(b.nap.id)),
  );

  async function wake(i: number) {
    const { nap, child } = naps[i]!;
    try {
      await ctx.logger.wake(nap);
      ctx.buzz();
      ctx.showToast(`${child!.name} woke up`, () => ctx.logger.undo([nap.id]));
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not wake');
    }
  }
  async function wakeAll() {
    const list = naps.map((x) => x.nap);
    try {
      await ctx.logger.wakeAll(list);
      ctx.buzz();
      ctx.showToast(`${list.length} woke up`, () => ctx.logger.undo(list.map((n) => n.id)));
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not wake');
    }
  }
</script>

{#if naps.length > 0}
  <section class="banner card" aria-label="Asleep now" data-testid="nap-banner">
    <div class="row wrap">
      <strong class="grow">😴 Asleep now</strong>
      {#if naps.length > 1}<button type="button" class="btn" data-testid="wake-all" onclick={wakeAll}>Wake all</button>{/if}
    </div>
    <ul class="row wrap" style="list-style: none; padding: 0; margin: 8px 0 0">
      {#each naps as { nap, child }, i (nap.id)}
        <li>
          <button type="button" class="kid row" data-testid="asleep-{child!.name}" aria-label="Wake {child!.name}, asleep {fmtClock(ctx.app.now - Number(nap.fields.at))}" onclick={() => wake(i)}>
            <Avatar id={child!.id} name={child!.name} color={child!.color} size={32} />
            <span>{child!.name}</span>
            <span class="timer" data-testid="asleep-timer">{fmtClock(ctx.app.now - Number(nap.fields.at))}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .banner { position: sticky; top: 8px; z-index: 20; border-color: var(--k-nap); }
  .kid { min-height: 48px; padding: 4px 12px 4px 6px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; cursor: pointer; }
  .timer { font-variant-numeric: tabular-nums; color: var(--muted); }
</style>
