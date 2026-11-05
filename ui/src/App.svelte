<script lang="ts">
  import { onMount } from 'svelte';
  import { createApp } from './lib/app.svelte';
  import type { UiApi } from './lib/types';
  import AddFamily from './screens/AddFamily.svelte';
  import ChildTimeline from './screens/ChildTimeline.svelte';
  import Families from './screens/Families.svelte';
  import Family from './screens/Family.svelte';
  import Invite from './screens/Invite.svelte';
  import Join from './screens/Join.svelte';
  import LinkThisDevice from './screens/LinkThisDevice.svelte';
  import ParentHome from './screens/ParentHome.svelte';
  import ProviderSetup from './screens/ProviderSetup.svelte';
  import Roster from './screens/Roster.svelte';
  import Settings from './screens/Settings.svelte';
  import ShowLinkCode from './screens/ShowLinkCode.svelte';
  import Welcome from './screens/Welcome.svelte';
  import AddSheet from './components/AddSheet.svelte';
  import ApprovalDialog from './components/ApprovalDialog.svelte';
  import PhotoViewer from './components/PhotoViewer.svelte';
  import Snackbar from './components/Snackbar.svelte';
  import WhoReacted from './components/WhoReacted.svelte';

  let { api }: { api: UiApi } = $props();
  // svelte-ignore state_referenced_locally
  const ctx = createApp(api);
  let fatal = $state('');

  onMount(() => {
    ctx.start().catch((e) => (fatal = e instanceof Error ? e.message : String(e)));
    return () => ctx.stop();
  });
  const view = $derived(ctx.app.view);
  const mode = $derived(ctx.app.st?.mode);
</script>

{#if fatal}
  <main class="page"><p class="err" role="alert">Could not start: {fatal}</p></main>
{:else if ctx.app.loading}
  <main class="page"><p class="muted" role="status">Loading…</p></main>
{:else if view.name === 'welcome'}
  <Welcome {ctx} />
{:else if view.name === 'providerSetup'}
  <ProviderSetup {ctx} />
{:else if view.name === 'join'}
  <Join {ctx} link={view.link ?? ''} />
{:else if view.name === 'linkThisDevice'}
  <LinkThisDevice {ctx} />
{:else if view.name === 'home'}
  {#if mode === 'provider'}<Roster {ctx} />{:else if mode === 'parent'}<ParentHome {ctx} />{:else}<Welcome {ctx} />{/if}
{:else if view.name === 'addFamily'}
  <AddFamily {ctx} />
{:else if view.name === 'families'}
  <Families {ctx} />
{:else if view.name === 'timeline'}
  <ChildTimeline {ctx} child={view.child} />
{:else if view.name === 'family'}
  <Family {ctx} space={view.space} />
{:else if view.name === 'invite'}
  <Invite {ctx} mode="family" space={view.space} />
{:else if view.name === 'staffInvite'}
  <Invite {ctx} mode="staff" />
{:else if view.name === 'settings'}
  <Settings {ctx} />
{:else if view.name === 'showLinkCode'}
  <ShowLinkCode {ctx} />
{/if}

{#if ctx.app.sheet}
  {#key ctx.app.sheet}<AddSheet {ctx} sheet={ctx.app.sheet} />{/key}
{/if}
{#if ctx.app.viewer}
  <PhotoViewer {ctx} />
{/if}
{#if ctx.app.whoReacted}
  <WhoReacted {ctx} entry={ctx.app.whoReacted.entry} space={ctx.app.whoReacted.space} />
{/if}
<Snackbar {ctx} />
<ApprovalDialog {ctx} />
