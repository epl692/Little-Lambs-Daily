<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { replyCountText, type Reply } from '../lib/threads';
  import { fmtTimeShort } from '../lib/time';
  import Avatar from './Avatar.svelte';

  let { ctx, entry, open = $bindable(false) }: { ctx: App; entry: Entry; open?: boolean } = $props();
  const replies = $derived(ctx.app.replies[entry.id] ?? []);
  const target = $derived({ id: entry.id, space: entry.space });
  let draft = $state('');
  let editing = $state<string | undefined>();
  let editText = $state('');
  let busy = $state(false);

  const mayChange = (r: Reply) => ctx.role() === 'provider' || r.createdBy === ctx.me();
  const mayEdit = (r: Reply) => r.createdBy === ctx.me();

  async function send() {
    if (!draft.trim() || busy) return;
    busy = true;
    try {
      const id = await ctx.threads.reply(target, draft);
      draft = '';
      ctx.showToast('Reply sent', () => ctx.threads.removeReply(id));
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not send');
    } finally {
      busy = false;
    }
  }
  async function saveEdit(r: Reply) {
    try {
      await ctx.threads.editReply(r.id, editText);
      editing = undefined;
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not save');
    }
  }
  async function del(r: Reply) {
    if (!confirm('Delete this reply?')) return;
    try {
      await ctx.threads.removeReply(r.id);
      ctx.showToast('Reply deleted', () => ctx.threads.undo(r.id));
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Could not delete');
    }
  }
  const roleMark = (r: Reply) => (r.createdByRole === 'provider' ? '' : ' 🏡');
</script>

<div class="thread">
  <button type="button" class="toggle" aria-expanded={open} data-testid="thread-toggle" onclick={() => (open = !open)}>
    💬 {replies.length ? replyCountText(replies.length) : 'Reply'}
  </button>
  {#if open}
    <div class="body" data-testid="thread">
      {#if replies.length}
        <ul class="list">
          {#each replies as r (r.id)}
            <li class="reply" data-testid="reply">
              <Avatar id={r.createdBy} name={r.createdByName} size={24} />
              <div class="grow">
                <div class="who"><strong>{r.createdByName}{roleMark(r)}</strong> <span class="muted">{fmtTimeShort(r.at)}{#if r.editedAt}{' · edited'}{/if}</span></div>
                {#if editing === r.id}
                  <textarea class="edit" rows="2" maxlength="2000" aria-label="Edit reply" data-testid="reply-edit-input" bind:value={editText}></textarea>
                  <div class="row">
                    <button type="button" class="btn" data-testid="reply-edit-save" onclick={() => saveEdit(r)}>Save</button>
                    <button type="button" class="btn ghost" onclick={() => (editing = undefined)}>Cancel</button>
                  </div>
                {:else}
                  <p class="txt" data-testid="reply-text">{r.text}</p>
                  {#if mayChange(r)}
                    <div class="row acts">
                      {#if mayEdit(r)}<button type="button" class="link" data-testid="reply-edit" onclick={() => ((editing = r.id), (editText = r.text))}>Edit</button>{/if}
                      <button type="button" class="link" data-testid="reply-delete" onclick={() => del(r)}>Delete</button>
                    </div>
                  {/if}
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      <form class="compose row" onsubmit={(e) => (e.preventDefault(), send())}>
        <textarea rows="1" maxlength="2000" placeholder="Write a reply…" aria-label="Write a reply" data-testid="reply-input" bind:value={draft}></textarea>
        <button type="submit" class="btn primary" disabled={!draft.trim() || busy} data-testid="reply-send">Send</button>
      </form>
    </div>
  {/if}
</div>

<style>
  .toggle { min-height: 32px; padding: 0 4px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 0.875rem; cursor: pointer; margin-top: 2px; }
  .body { margin: 4px 0 2px 6px; padding-left: 10px; border-left: 2px solid var(--line); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .reply { display: flex; gap: 8px; align-items: flex-start; }
  .who { font-size: 0.8125rem; }
  .txt { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .acts { gap: 12px; }
  .link { min-height: 28px; padding: 0; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 0.8125rem; text-decoration: underline; cursor: pointer; }
  .compose { gap: 8px; align-items: flex-end; margin-top: 8px; }
  .compose textarea, .edit { flex: 1; min-height: 44px; padding: 10px; font: inherit; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--text); resize: vertical; width: 100%; box-sizing: border-box; }
</style>
