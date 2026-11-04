<script lang="ts">
  import { getChoice, setChoice, type ThemeChoice } from './lib/theme';
  import type { UiApi } from './main';

  let { api }: { api: UiApi } = $props();
  let choice = $state<ThemeChoice>(getChoice());
  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  function pick(v: ThemeChoice) {
    choice = v;
    setChoice(v);
  }
</script>

<main>
  <header>
    <h1>{api.appName}</h1>
    <p class="muted">{api.daycareName}</p>
  </header>
  <section class="card" aria-labelledby="theme-h">
    <h2 id="theme-h">Theme</h2>
    <div class="seg" role="radiogroup" aria-label="Theme">
      {#each options as o (o.value)}
        <button type="button" role="radio" aria-checked={choice === o.value} class:on={choice === o.value} onclick={() => pick(o.value)}>{o.label}</button>
      {/each}
    </div>
  </section>
  <p class="muted">Scaffold is running. Next: data layer (phase 2).</p>
</main>

<style>
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
  h1 { margin: 0; font-size: 1.5rem; }
  h2 { margin: 0 0 12px; font-size: 1rem; }
  .muted { color: var(--muted); }
  .card { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); border: 1px solid var(--line); padding: 16px; margin: 16px 0; }
  .seg { display: flex; gap: 8px; }
  button { flex: 1; min-height: 48px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--text); font: inherit; cursor: pointer; }
  button.on { background: var(--accent); border-color: var(--accent); color: #04211e; font-weight: 600; }
  button:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 2px; }
</style>
