<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import Top from '../components/Top.svelte';
  import QrCode from '../components/QrCode.svelte';
  import CopyShare from '../components/CopyShare.svelte';

  let { ctx }: { ctx: App } = $props();
  let code = $state('');
  let status = $state<'making' | 'ready' | 'done' | 'failed'>('making');
  let error = $state('');

  onMount(async () => {
    try {
      const r = await ctx.svc.linkAnotherDevice();
      code = r.code;
      status = 'ready';
      await r.done;
      status = 'done';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Linking did not finish.';
      status = 'failed';
    }
  });
</script>

<main class="page stack">
  <Top {ctx} title="Link another device" />
  {#if status === 'making'}
    <p class="muted">Getting a code…</p>
  {:else if status === 'ready'}
    <p class="muted">On the new device, choose “Link this device to my account” and enter this code. You’ll both check that five words match.</p>
    <QrCode text={code} label="Device link code" api={ctx.api} />
    <label class="field">Code
      <textarea readonly data-testid="link-code">{code}</textarea>
    </label>
    <CopyShare text={code} title="Device link code" />
    <p class="small muted">The code works once and expires in about ten minutes.</p>
  {:else if status === 'done'}
    <div class="card center stack"><h2>Device linked ✓</h2><button type="button" class="btn primary" onclick={() => ctx.back()}>Done</button></div>
  {:else}
    <p class="err" role="alert">{error}</p>
    <button type="button" class="btn" onclick={() => ctx.back()}>Back</button>
  {/if}
</main>
