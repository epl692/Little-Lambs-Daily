<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import { getChoice, setChoice, type ThemeChoice } from '../lib/theme';
  import type { MemberInfo } from '../lib/types';
  import type { MyDevice } from '../lib/service';
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
  // svelte-ignore state_referenced_locally
  let daycareName = $state(ctx.app.daycareName); // already loaded at start; never overwritten while someone is typing
  // svelte-ignore state_referenced_locally
  let appNameField = $state(ctx.app.appName);
  let nameSaved = $state('');
  let saved = $state('');
  let threshold = $state(180);
  const thresholds = [60, 120, 180, 240, 360];
  let devices = $state<MyDevice[]>([]);
  // svelte-ignore state_referenced_locally
  let myName = $state(ctx.display(session?.user ?? '', session?.displayName ?? ''));
  let myNameStatus = $state('');
  let manageError = $state('');
  let leaveError = $state('');

  const themes: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  async function loadDevices() {
    devices = await ctx.svc.myDevices();
  }
  async function loadStaff() {
    staff = (await ctx.svc.members(ctx.app.st!.staff!.id)).filter((m) => m.role === 'owner');
  }
  async function revokeDevice(d: MyDevice) {
    manageError = '';
    if (!confirm(`Sign out ${d.name || 'this device'}? It will stop getting data, and anything saved only on it stays there.`)) return;
    try {
      await ctx.svc.revokeMyDevice(d.id);
      await loadDevices();
    } catch (e) {
      manageError = e instanceof Error ? e.message : 'Could not sign it out.';
    }
  }
  async function removeProvider(m: MemberInfo) {
    manageError = '';
    if (!confirm(`Remove ${ctx.display(m.user, m.displayName ?? 'this provider')}? They lose access to every family.`)) return;
    try {
      await ctx.svc.removeProvider(m.user);
      await loadStaff();
    } catch (e) {
      manageError = e instanceof Error ? e.message : 'Could not remove them.';
    }
  }

  onMount(async () => {
    void loadDevices();
    if (!provider) return;
    await loadStaff();
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

  async function saveMyName() {
    myNameStatus = '';
    try {
      await ctx.svc.renameSelf(myName);
      myNameStatus = 'Saved';
    } catch (e) {
      myNameStatus = e instanceof Error ? e.message : 'Could not save';
    }
  }

  async function saveNames() {
    nameSaved = '';
    try {
      await ctx.svc.setBrand(daycareName, appNameField);
      ctx.app.daycareName = daycareName.trim() || ctx.app.daycareName;
      ctx.app.appName = appNameField.trim() || ctx.app.appName;
      nameSaved = 'Saved. Parents see the new name too.';
    } catch (e) {
      nameSaved = e instanceof Error ? e.message : 'Could not save';
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
    <p class="muted">Signed in as <strong data-testid="my-name">{ctx.display(session?.user ?? '', session?.displayName ?? 'you')}</strong></p>
    <label class="field">Your name
      <input type="text" maxlength="80" bind:value={myName} data-testid="my-name-input" />
    </label>
    <div class="row"><button type="button" class="btn" data-testid="save-my-name" disabled={!myName.trim()} onclick={saveMyName}>Save name</button><span class="muted" role="status" data-testid="my-name-status">{myNameStatus}</span></div>
    <ul class="stack" style="list-style: none; padding: 0; margin: 0" aria-label="Devices signed in as you">
      {#each devices.filter((d) => d.active) as d (d.id)}
        <li class="row" data-testid="my-device">
          <span class="grow">{d.name || 'A device'}{d.current ? ' (this one)' : ''}</span>
          {#if !d.current}<button type="button" class="btn ghost danger" data-testid="revoke-device" onclick={() => revokeDevice(d)}>Sign out</button>{/if}
        </li>
      {/each}
    </ul>
    {#if manageError}<p class="err" role="alert">{manageError}</p>{/if}
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
        {#each staff as m (m.user)}
          <li class="row" data-testid="staff-row"><span class="grow">{ctx.display(m.user, m.displayName ?? 'Provider')}</span>{#if m.user !== session?.user}<button type="button" class="btn ghost danger" data-testid="remove-provider" onclick={() => removeProvider(m)}>Remove</button>{/if}</li>
        {/each}
      </ul>
      <button type="button" class="btn" data-testid="invite-provider" onclick={() => ctx.go({ name: 'staffInvite' })}>Invite a provider</button>
      <p class="small muted">New providers get access to every family automatically.</p>
    </section>

    <section class="card stack" aria-labelledby="nm-h">
      <h2 id="nm-h">Daycare and app name</h2>
      <label class="field">Daycare name<input type="text" maxlength="80" bind:value={daycareName} data-testid="daycare-name" /></label>
      <label class="field">App name<input type="text" maxlength="40" bind:value={appNameField} data-testid="app-name" /></label>
      <div class="row"><button type="button" class="btn" data-testid="save-names" onclick={saveNames}>Save</button><span class="muted" role="status" data-testid="names-saved">{nameSaved}</span></div>
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
