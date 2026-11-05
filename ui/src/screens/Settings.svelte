<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import { getChoice, setChoice, type ThemeChoice } from '../lib/theme';
  import type { MemberInfo } from '../lib/types';
  import { familyNameOf } from '../lib/service';
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
  let threshold = $state(180);
  const thresholds = [60, 120, 180, 240, 360];
  let leaveError = $state('');

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
    threshold = s.sinceThresholdMinutes;
  });

  async function leave(space: string, name: string) {
    if (!confirm(`Leave the ${name} family? This device will stop showing their days.`)) return;
    try {
      await ctx.svc.leaveFamily(space);
      await ctx.refresh();
      ctx.home();
    } catch (e) {
      leaveError = e instanceof Error ? e.message : 'Could not leave';
    }
  }

  async function saveThreshold() {
    await ctx.svc.updateSettings({ sinceThresholdMinutes: threshold });
    ctx.app.sinceThresholdMinutes = threshold; // the roster chips update straight away
  }

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

  <section class="card stack" aria-labelledby="rp-h">
    <h2 id="rp-h">Reports and exports</h2>
    <button type="button" class="btn" data-testid="open-reports" onclick={() => ctx.go({ name: 'reports' })}>{provider ? 'Attendance, backup' : 'Download your records'}</button>
  </section>

  {#if !provider}
    <section class="card stack" aria-labelledby="lv-h">
      <h2 id="lv-h">Family</h2>
      {#each ctx.app.st?.families ?? [] as fam (fam.id)}
        <div class="row">
          <span class="grow">{familyNameOf(fam)} family</span>
          <button type="button" class="btn danger" data-testid="leave-family" onclick={() => leave(fam.id, familyNameOf(fam))}>Leave</button>
        </div>
      {/each}
      {#if leaveError}<p class="err" role="alert">{leaveError}</p>{/if}
    </section>
  {/if}

  {#if provider}
    <section class="card stack" aria-labelledby="st-h">
      <h2 id="st-h">Staff</h2>
      <ul class="stack" style="list-style: none; padding: 0; margin: 0">
        {#each staff as m (m.user)}<li data-testid="staff-row">{m.displayName ?? 'Provider'}</li>{/each}
      </ul>
      <button type="button" class="btn" data-testid="invite-provider" onclick={() => ctx.go({ name: 'staffInvite' })}>Invite a provider</button>
      <p class="small muted">New providers get access to every family automatically.</p>
    </section>

    <section class="card stack" aria-labelledby="sn-h">
      <h2 id="sn-h">“Since” reminders</h2>
      <label class="field">Turn the last-bottle and last-diaper chips amber after
        <select bind:value={threshold} onchange={saveThreshold} data-testid="since-threshold">
          {#each thresholds as m (m)}<option value={m}>{m / 60} hour{m === 60 ? '' : 's'}</option>{/each}
        </select>
      </label>
      <p class="small muted">A gentle nudge on the roster, never an alarm.</p>
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

  <p class="muted small center" data-testid="about">{ctx.app.appName} · v{ctx.api.version ?? '?'}</p>
</main>
