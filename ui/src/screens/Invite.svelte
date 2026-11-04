<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import type { InviteArtifact } from '../lib/types';
  import QrCode from '../components/QrCode.svelte';
  import CopyShare from '../components/CopyShare.svelte';

  // mode 'family': a parent invite for one family. mode 'staff': another provider joining the Staff Space.
  let { ctx, mode, space = '' }: { ctx: App; mode: 'family' | 'staff'; space?: string } = $props();
  let art = $state<InviteArtifact | undefined>();
  let error = $state('');

  onMount(async () => {
    try {
      art = mode === 'staff' ? await ctx.svc.inviteProvider() : await ctx.svc.inviteParent(space);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not create the invite.';
    }
  });
  const expires = $derived(art ? new Date(art.expiresAt).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : '');
</script>

<main class="page stack center">
  <h1>{mode === 'staff' ? 'Invite a provider' : 'Invite a parent'}</h1>
  {#if error}
    <p class="err" role="alert">{error}</p>
  {:else if !art}
    <p class="muted">Making an invite…</p>
  {:else}
    <p class="muted">{mode === 'staff' ? 'Have them scan this with their camera, or send the link.' : 'Ask the parent to scan this with their phone camera, or send them the link.'}</p>
    <QrCode text={art.qrPayload} label="Invite QR code" api={ctx.api} />
    <label class="field" style="text-align: left">Invite link
      <input type="text" readonly value={art.url} data-testid="invite-link" onfocus={(e) => e.currentTarget.select()} />
    </label>
    <CopyShare text={art.url} title={mode === 'staff' ? 'Join our daycare staff' : `Join ${ctx.app.daycareName}`} />
    <p class="small muted">Works once. Expires {expires}. You’ll be asked to approve when they join.</p>
  {/if}
  <button type="button" class="btn primary big" data-testid="invite-done" onclick={() => ctx.back()}>Done</button>
</main>
