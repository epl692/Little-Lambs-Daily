<script lang="ts">
  import type { App } from '../lib/app.svelte';

  import { resetThisDevice, RESET_WARNING } from '../lib/reset';

  let { ctx }: { ctx: App } = $props();
  const reset = async () => confirm(RESET_WARNING) && (await resetThisDevice());
</script>

<main class="page stack" style="padding-top: 48px">
  <header class="center stack">
    <div class="logo" aria-hidden="true">🐑</div>
    <h1>{ctx.app.appName}</h1>
    <p class="muted">A private daily log for your daycare. No accounts, no passwords.</p>
  </header>
  <button type="button" class="btn primary big" data-testid="im-provider" onclick={() => ctx.go({ name: 'providerSetup' })}>I’m the provider (set up daycare)</button>
  <button type="button" class="btn big" data-testid="have-invite" onclick={() => ctx.go({ name: 'join' })}>I have an invite</button>
  <button type="button" class="btn ghost" data-testid="link-device" onclick={() => ctx.go({ name: 'linkThisDevice' })}>Link this device to my account</button>
  <button type="button" class="btn ghost small" data-testid="reset-device" onclick={reset}>Trouble signing in? Reset this device</button>
</main>

<style>
  .logo { font-size: 64px; line-height: 1; }
</style>
