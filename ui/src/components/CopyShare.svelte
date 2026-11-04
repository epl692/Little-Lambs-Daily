<script lang="ts">
  let { text, title = 'Invite' }: { text: string; title?: string } = $props();
  let copied = $state(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* the link is also shown in a selectable box */
    }
  }
  async function share() {
    try {
      await navigator.share({ title, text: `${title}: ${text}` });
    } catch {
      /* cancelled */
    }
  }
</script>

<div class="row wrap">
  <button type="button" class="btn grow" onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
  {#if canShare}
    <button type="button" class="btn grow" onclick={share}>Share…</button>
  {/if}
</div>
