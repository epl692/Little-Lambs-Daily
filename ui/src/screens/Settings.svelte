<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import { getChoice, setChoice, type ThemeChoice } from '../lib/theme';
  import type { MemberInfo } from '../lib/types';
  import Top from '../components/Top.svelte';

  let { ctx }: { ctx: App } = $props();
  const provider = $derived(ctx.app.st?.mode === 'provider');
  // svelte-ignore state_referenced_locally
  const session = ctx.api.spaces.admin?.session();
  let choice = $state<ThemeChoice>(getChoice());
  let staff = $state<MemberInfo[]>([]);
  let requireApproval = $state(true);
  let hours = $state(24);
  let saved = $state('');

  const themes: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  onMount(async () => {
    if (!provider) return;
    const st = ctx.app.st!;
    staff = (await ctx.svc.members(st.staff!.id)).filter((m) => m.role === 'owner');
    const s = await ctx.svc.settings();
    requireApproval = s.requireApproval;
    hours = s.defaultInviteHours;
  });

  async function saveInvites() {
    await ctx.svc.updateSettings({ requireApproval, defaultInviteHours: Math.min(720, Math.max(1, Math.round(hours) || 24)) });
    saved = 'Saved';
    setTimeout(() => (saved = ''), 1500);
  }
</script>

<main class="page stack">
  <Top {ctx} title="Settings" />

  <section class="card stack" aria-labelledby="th">
    <h2 id="th">Theme</h2>
    <div class="row" role="radiogroup" aria-label="Theme">
      {#each themes as t (t.value)}
        <button type="button" class="chip grow" role="radio" aria-checked={choice === t.value} onclick={() => { choice = t.value; setChoice(t.value); }}>{t.label}</button>
      {/each}
    </div>
  </section>

  <section class="card stack" aria-labelledby="me-h">
    <h2 id="me-h">This device</h2>
    <p class="muted">Signed in as <strong data-testid="my-name">{session?.displayName ?? 'you'}</strong></p>
    <button type="button" class="btn" data-testid="link-another" onclick={() => ctx.go({ name: 'showLinkCode' })}>Link another device</button>
  </section>

  {#if provider}
    <section class="card stack" aria-labelledby="st-h">
      <h2 id="st-h">Staff</h2>
      <ul class="stack" style="list-style: none; padding: 0; margin: 0">
        {#each staff as m (m.user)}<li data-testid="staff-row">{m.displayName ?? 'Provider'}</li>{/each}
      </ul>
      <button type="button" class="btn" data-testid="invite-provider" onclick={() => ctx.go({ name: 'staffInvite' })}>Invite a provider</button>
      <p class="small muted">New providers get access to every family automatically.</p>
    </section>

    <section class="card stack" aria-labelledby="iv-h">
      <h2 id="iv-h">Parent invites</h2>
      <label class="row"><input type="checkbox" bind:checked={requireApproval} /> <span>Require my approval when a parent joins (recommended)</span></label>
      <label class="field">Invites expire after (hours)
        <input type="text" inputmode="numeric" value={String(hours)} oninput={(e) => (hours = Number(e.currentTarget.value))} />
      </label>
      <div class="row"><button type="button" class="btn" onclick={saveInvites}>Save</button><span class="muted" role="status">{saved}</span></div>
    </section>
  {/if}

  <p class="muted small center">{ctx.app.appName} · v0.3</p>
</main>
