<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { joinErrorMessage } from '../lib/service';
  import QrScanner from '../components/QrScanner.svelte';
  import Top from '../components/Top.svelte';

  let { ctx, link = '' }: { ctx: App; link?: string } = $props();
  const RELATIONSHIPS = ['Mom', 'Dad', 'Grandma', 'Grandpa', 'Other'];

  // svelte-ignore state_referenced_locally
  let text = $state(link);
  let name = $state('');
  let chip = $state('Mom');
  let other = $state('');
  let phase = $state<'form' | 'waiting' | 'syncing'>('form');
  let sas = $state('');
  let error = $state('');
  let scanning = $state(false);
  const relationship = $derived(chip === 'Other' ? other.trim() : chip);
  const words = (s: string) => s.split('-').join(' · ');

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    phase = 'waiting';
    try {
      await ctx.svc.acceptInvite(text, { name, relationship, onSas: (s) => (sas = s) });
      phase = 'syncing';
      // Membership shows up once this device has received its own join: wait for it before showing a home screen.
      const until = Date.now() + 30_000;
      while (Date.now() < until) {
        const st = await ctx.refresh();
        if (st.mode !== 'welcome') break;
        await new Promise((r) => setTimeout(r, 400));
      }
      ctx.home();
    } catch (err) {
      error = joinErrorMessage(err);
      phase = 'form';
      sas = '';
    }
  }
</script>

<main class="page">
  <Top {ctx} title="Join with an invite" back={phase === 'form'} />

  {#if phase === 'form'}
    <form class="stack" onsubmit={submit}>
      <button type="button" class="btn" data-testid="scan-qr" onclick={() => (scanning = true)}>📷 Scan the QR code</button>
      <label class="field">Invite link
        <textarea bind:value={text} placeholder="Paste the link you were sent" required data-testid="invite-text"></textarea>
      </label>
      <label class="field">Your name
        <input type="text" bind:value={name} autocomplete="name" required data-testid="join-name" />
      </label>
      <div class="stack" role="group" aria-label="Your relationship to the child">
        <span class="field">I am their…</span>
        <div class="row wrap">
          {#each RELATIONSHIPS as r (r)}
            <button type="button" class="chip" aria-pressed={chip === r} onclick={() => (chip = r)}>{r}</button>
          {/each}
        </div>
        {#if chip === 'Other'}
          <input type="text" bind:value={other} placeholder="e.g. Aunt" aria-label="Relationship" />
        {/if}
      </div>
      {#if error}<p class="err" role="alert" data-testid="join-error">{error}</p>{/if}
      <button type="submit" class="btn primary big" data-testid="join-submit">Join</button>
    </form>
  {:else if phase === 'waiting'}
    <div class="stack center" aria-live="polite">
      <h2>Waiting for approval</h2>
      {#if sas}
        <p class="muted">Show these five words to the daycare. They’ll check they match their screen.</p>
        <div class="sas" data-testid="join-sas">{words(sas)}</div>
      {:else}
        <p class="muted">Connecting…</p>
      {/if}
    </div>
  {:else}
    <div class="stack center" aria-live="polite">
      <h2 data-testid="join-approved">Approved! Getting set up…</h2>
      <p class="muted">Loading your child’s day.</p>
    </div>
  {/if}
</main>
{#if scanning}
  <QrScanner expect="invite" onfound={(t) => ((text = t), (scanning = false))} onclose={() => (scanning = false)} />
{/if}
