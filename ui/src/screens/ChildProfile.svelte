<script lang="ts">
  import { onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import type { MemberInfo } from '../lib/types';
  import { age } from '../lib/time';
  import Avatar from '../components/Avatar.svelte';
  import Top from '../components/Top.svelte';

  // A child's profile (SPEC 6.7): read-only for everyone here, except Family notes, which parents and providers both write.
  let { ctx, child }: { ctx: App; child: string } = $props();
  const kid = $derived(ctx.app.children.find((c) => c.id === child));
  let members = $state<MemberInfo[]>([]);
  let draft = $state<string | undefined>(undefined);
  let saved = $state('');
  let error = $state('');
  const notes = $derived(draft ?? kid?.familyNotes ?? '');

  onMount(() => {
    const space = ctx.app.children.find((c) => c.id === child)?.space;
    if (space) void ctx.svc.members(space).then((m) => (members = m));
  });

  async function save() {
    error = '';
    try {
      await ctx.api.data.update(child, { familyNotes: notes.trim() });
      draft = undefined;
      saved = 'Saved';
      setTimeout(() => (saved = ''), 1500);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save';
    }
  }
</script>

<main class="page stack">
  <Top {ctx} title={kid ? kid.name : 'Profile'} />
  {#if kid}
    <div class="row">
      <Avatar id={kid.id} name={kid.name} color={kid.color} size={56} />
      <div>
        <strong data-testid="profile-name">{kid.firstName}</strong>
        {#if age(kid.birthDate, ctx.app.now)}<p class="muted small">{age(kid.birthDate, ctx.app.now)}</p>{/if}
      </div>
    </div>

    <section class="card stack" aria-labelledby="al-h">
      <h2 id="al-h">Allergies</h2>
      <p data-testid="profile-allergies">{kid.allergies || 'None on file'}</p>
    </section>
    <section class="card stack" aria-labelledby="cn-h">
      <h2 id="cn-h">Care notes</h2>
      <p data-testid="profile-care">{kid.careNotes || 'Nothing yet'}</p>
      <p class="muted small">Only the daycare changes these.</p>
    </section>

    <section class="card stack" aria-labelledby="fn-h">
      <h2 id="fn-h">Family notes</h2>
      <label class="field">What should the daycare know?
        <textarea rows="4" maxlength="1000" data-testid="family-notes" value={notes} oninput={(e) => (draft = e.currentTarget.value)}></textarea>
      </label>
      <div class="row">
        <button type="button" class="btn primary" data-testid="family-notes-save" disabled={draft === undefined} onclick={save}>Save notes</button>
        <span class="muted" role="status">{saved}</span>
      </div>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
    </section>

    <section class="card stack" aria-labelledby="fm-h">
      <h2 id="fm-h">Family members</h2>
      <ul class="stack" style="list-style: none; padding: 0; margin: 0">
        {#each members.filter((m) => m.role === 'editor') as m (m.user)}<li data-testid="profile-member">{ctx.display(m.user, m.displayName ?? 'Parent')}</li>{/each}
      </ul>
    </section>
  {:else}
    <p class="muted" role="status">Loading…</p>
  {/if}
</main>
