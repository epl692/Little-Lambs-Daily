<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import QrScanner from '../components/QrScanner.svelte';
  import Top from '../components/Top.svelte';

  let { ctx }: { ctx: App } = $props();
  let code = $state('');
  let sas = $state('');
  let busy = $state(false);
  let error = $state('');
  let scanning = $state(false);
  const words = (s: string) => s.split('-').join(' · ');

  async function submit(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await ctx.svc.joinAsDevice(code, (s) => (sas = s));
      const until = Date.now() + 30_000;
      while (Date.now() < until) {
        const st = await ctx.refresh();
        if (st.mode !== 'welcome') break;
        await new Promise((r) => setTimeout(r, 400));
      }
      ctx.home();
    } catch (err) {
      error = err instanceof Error && err.message ? err.message : 'Could not link this device. Check the code and try again.';
      busy = false;
      sas = '';
    }
  }
</script>

<main class="page">
  <Top {ctx} title="Link this device" back={!busy} />
  {#if !busy}
    <form class="stack" onsubmit={submit}>
      <p class="muted">On your other device, open Settings → Link another device, then enter the code it shows.</p>
      <button type="button" class="btn" data-testid="scan-qr" onclick={() => (scanning = true)}>📷 Scan the QR code</button>
      <label class="field">Code
        <textarea bind:value={code} required data-testid="link-code-input"></textarea>
      </label>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <button type="submit" class="btn primary big">Link this device</button>
    </form>
  {:else}
    <div class="stack center" aria-live="polite">
      <h2>Waiting for approval</h2>
      {#if sas}
        <p class="muted">Your other device will ask you to confirm these five words.</p>
        <div class="sas" data-testid="link-sas">{words(sas)}</div>
      {:else}
        <p class="muted">Connecting…</p>
      {/if}
    </div>
  {/if}
</main>
{#if scanning}
  <QrScanner expect="link" onfound={(t) => ((code = t), (scanning = false))} onclose={() => (scanning = false)} />
{/if}
