<script lang="ts">
  import { onMount } from 'svelte';

  const KEY = 'lld.hint.install';
  let dismissed = $state(typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1');
  let prompt = $state<{ prompt(): Promise<void> } | undefined>();
  const standalone = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const ios = /iPhone|iPad|iPod/.test(ua);

  onMount(() => {
    const on = (e: Event) => {
      e.preventDefault();
      prompt = e as unknown as { prompt(): Promise<void> };
    };
    addEventListener('beforeinstallprompt', on);
    return () => removeEventListener('beforeinstallprompt', on);
  });
  function dismiss() {
    dismissed = true;
    localStorage.setItem(KEY, '1');
  }
</script>

{#if !dismissed && !standalone}
  <section class="card stack" aria-label="Install the app">
    <h2>Add to Home Screen</h2>
    {#if prompt}
      <p class="muted">Install this app for the best experience.</p>
      <button type="button" class="btn primary" onclick={() => prompt?.prompt()}>Install</button>
    {:else if ios}
      <p class="muted">Tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.</p>
    {:else}
      <p class="muted">Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
    {/if}
    <button type="button" class="btn ghost" onclick={dismiss}>Not now</button>
  </section>
{/if}
