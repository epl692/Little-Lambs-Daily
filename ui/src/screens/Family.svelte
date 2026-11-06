<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import { familyNameOf } from '../lib/service';
  import type { MemberInfo, Obj } from '../lib/types';
  import Top from '../components/Top.svelte';

  let { ctx, space }: { ctx: App; space: string } = $props();
  const info = $derived(ctx.app.st?.families.find((f) => f.id === space));
  let kids = $state<Obj[]>([]);
  let members = $state<MemberInfo[]>([]);
  let newKid = $state('');
  // Removing a child is deliberate: open "Manage" on their row, then type their name.
  let managing = $state('');
  let typed = $state('');
  let managingFamily = $state(false);
  let typedFamily = $state('');
  const familyMatches = $derived(!!info && typedFamily.trim().toLowerCase() === familyNameOf(info).trim().toLowerCase());
  const nameOf = (k: Obj) => String(k.fields.firstName ?? '').trim();
  const matches = (k: Obj) => typed.trim().toLowerCase() === nameOf(k).toLowerCase() && !!nameOf(k);
  let error = $state('');
  // svelte-ignore state_referenced_locally
  let pending = $state(ctx.svc.pendingInvites(space));
  // svelte-ignore state_referenced_locally
  const me = ctx.api.spaces.admin?.session()?.user;

  async function loadMembers() {
    members = await ctx.svc.members(space);
  }
  onMount(() => {
    void loadMembers();
    const off = ctx.api.spaces.admin!.on((e) => {
      if (e.kind === 'member:changed') void loadMembers();
    });
    const sub = ctx.api.data.query({ type: 'daycare.child', space }).subscribe((rows) => (kids = rows.filter((r) => r.fields.active !== false)));
    return () => {
      off();
      sub();
    };
  });

  async function addKid(e: Event) {
    e.preventDefault();
    error = '';
    try {
      await ctx.svc.addChild(space, newKid);
      newKid = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not add the child.';
    }
  }
  async function removeKid(k: Obj) {
    const name = String(k.fields.firstName ?? 'this child');
    error = '';
    try {
      await ctx.svc.setChildActive(k.id, false);
      managing = '';
      typed = '';
      ctx.showToast(`${name} removed`, async () => void (await ctx.svc.setChildActive(k.id, true)));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not remove the child.';
    }
  }
  async function removeFamily() {
    if (!info) return;
    error = '';
    try {
      const name = familyNameOf(info);
      await ctx.svc.archiveFamily(space);
      await ctx.refresh();
      ctx.go({ name: 'families' }, { replace: true });
      ctx.showToast(`${name} family removed`, async () => {
        await ctx.svc.restoreFamily(space);
        await ctx.refresh();
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not remove the family.';
    }
  }
  async function cancelInvite(id: string) {
    await ctx.svc.revokeInvite(space, id);
    pending = ctx.svc.pendingInvites(space);
  }
  async function remove(m: MemberInfo) {
    if (!confirm(`Remove ${ctx.display(m.user, m.displayName ?? 'this person')} from this family? Their phones stop getting this family’s days right away. You can invite them again later.`)) return;
    await ctx.svc.removeMember(space, m.user);
    await loadMembers();
  }
  const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const parents = $derived(members.filter((m) => m.role === 'editor'));
</script>

<main class="page stack">
  <Top {ctx} title={info ? `${familyNameOf(info)} family` : 'Family'} />

  <section class="card stack" aria-labelledby="kids-h">
    <h2 id="kids-h">Children</h2>
    <ul class="stack" style="list-style: none; padding: 0; margin: 0">
      {#each kids as k (k.id)}
        <li class="stack" style="gap: 8px">
          <div class="row"><span class="avatar" aria-hidden="true">{String(k.fields.firstName ?? '?').slice(0, 1).toUpperCase()}</span><span class="grow" data-testid="child-row">{k.fields.firstName}</span><button type="button" class="btn ghost small" data-testid="manage-child" aria-expanded={managing === k.id} aria-label={`Manage ${k.fields.firstName}`} onclick={() => ((managing = managing === k.id ? '' : k.id), (typed = ''))}>Manage</button></div>
          {#if managing === k.id}
            <div class="card stack" data-testid="manage-panel">
              <p class="small muted">Added by mistake? Removing {nameOf(k)} takes them off the roster and out of the parents’ view. Nothing is deleted, and you can undo it right after.</p>
              <label class="field">Type {nameOf(k)}’s name to remove them
                <input type="text" bind:value={typed} autocomplete="off" data-testid="remove-confirm-input" />
              </label>
              <div class="row">
                <button type="button" class="btn danger" data-testid="remove-child" disabled={!matches(k)} onclick={() => removeKid(k)}>Remove {nameOf(k)}</button>
                <button type="button" class="btn ghost" onclick={() => ((managing = ''), (typed = ''))}>Keep</button>
              </div>
            </div>
          {/if}
        </li>
      {:else}
        <li class="muted">No children yet</li>
      {/each}
    </ul>
    <form class="row" onsubmit={addKid}>
      <input type="text" class="grow" bind:value={newKid} placeholder="Add another child" aria-label="Child’s first name" />
      <button type="submit" class="btn" disabled={!newKid.trim()}>Add</button>
    </form>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
  </section>

  <section class="card stack" aria-labelledby="par-h">
    <h2 id="par-h">Parents and family</h2>
    <ul class="stack" style="list-style: none; padding: 0; margin: 0">
      {#each parents as m (m.user)}
        <li class="row">
          <span class="grow" data-testid="parent-row">{ctx.display(m.user, m.displayName ?? 'Parent')}</span>
          {#if m.user !== me}<button type="button" class="btn ghost danger" data-testid="remove-parent" onclick={() => remove(m)}>Remove</button>{/if}
        </li>
      {:else}
        <li class="muted">No one has joined yet</li>
      {/each}
    </ul>
    {#each pending as inv (inv.inviteId)}
      <div class="row small muted" data-testid="pending-invite">
        <span class="grow">Invite waiting · expires {when(inv.expiresAt)}</span>
        <button type="button" class="btn ghost danger" onclick={() => cancelInvite(inv.inviteId)}>Cancel</button>
      </div>
    {/each}
    <button type="button" class="btn primary big" data-testid="invite-parent" onclick={() => ctx.go({ name: 'invite', space })}>Invite a parent</button>
  </section>

  {#if ctx.app.st?.mode === 'provider'}
    <section class="card stack" aria-labelledby="rf-h">
      <div class="row"><h2 id="rf-h" class="grow">Manage family</h2><button type="button" class="btn ghost small" data-testid="manage-family" aria-expanded={managingFamily} onclick={() => ((managingFamily = !managingFamily), (typedFamily = ''))}>{managingFamily ? 'Close' : 'Open'}</button></div>
      {#if managingFamily && info}
        <p class="small muted">Is this child leaving the daycare? Removing the {familyNameOf(info)} family hides them everywhere, parents included. Nothing is deleted, and you can restore them any time from the Families screen.</p>
        <label class="field">Type {familyNameOf(info)} to remove this family
          <input type="text" bind:value={typedFamily} autocomplete="off" data-testid="remove-family-input" />
        </label>
        <button type="button" class="btn danger" data-testid="remove-family" disabled={!familyMatches} onclick={removeFamily}>Remove the {familyNameOf(info)} family</button>
      {/if}
    </section>
  {/if}
</main>
