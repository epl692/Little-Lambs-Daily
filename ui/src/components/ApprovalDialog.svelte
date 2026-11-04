<script lang="ts">
  import type { App } from '../lib/app.svelte';

  let { ctx }: { ctx: App } = $props();
  const current = $derived(ctx.app.approvals[0]);
  let approveBtn: HTMLButtonElement | undefined = $state();
  $effect(() => {
    if (current) approveBtn?.focus();
  });
  const words = (sas: string) => sas.split('-').join(' · ');
</script>

{#if current}
  <div class="scrim">
    <div class="card dlg stack" role="alertdialog" aria-modal="true" aria-labelledby="ap-t" aria-describedby="ap-d">
      <h2 id="ap-t">{current.title}</h2>
      {#if current.detail}<p class="muted" id="ap-d">{current.detail}</p>{/if}
      <p class="small muted">Check these five words match the other screen exactly.</p>
      <div class="sas" data-testid="approval-sas">{words(current.sas)}</div>
      <div class="row wrap">
        <button type="button" class="btn grow" onclick={() => current.resolve(false)}>Not a match</button>
        <button type="button" class="btn primary grow" bind:this={approveBtn} data-testid="approve" onclick={() => current.resolve(true)}>Words match, approve</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 55%); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 50; }
  .dlg { max-width: 440px; width: 100%; }
</style>
