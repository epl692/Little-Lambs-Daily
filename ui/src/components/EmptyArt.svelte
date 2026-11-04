<script lang="ts">
  let { text }: { text: string } = $props();
</script>

<div class="empty center stack" data-testid="tl-empty">
  <!-- Original artwork: a sleepy cloud under a crescent moon and a few stars. -->
  <svg viewBox="0 0 160 110" width="160" height="110" role="img" aria-label="A sleepy cloud under the moon">
    <path d="M118 14a20 20 0 1 0 14 34 16 16 0 0 1-14-34z" fill="var(--k-meal)" opacity="0.85" />
    <g fill="var(--accent)" opacity="0.9"><circle cx="30" cy="22" r="2.5" /><circle cx="64" cy="12" r="2" /><circle cx="140" cy="70" r="2" /></g>
    <g fill="var(--surface)" stroke="var(--line)" stroke-width="2">
      <circle cx="52" cy="72" r="20" /><circle cx="78" cy="62" r="26" /><circle cx="106" cy="73" r="19" /><rect x="40" y="72" width="80" height="20" rx="10" stroke="none" />
    </g>
    <path d="M62 74q4 4 8 0M88 74q4 4 8 0" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" />
  </svg>
  <p class="muted">{text}</p>
</div>

<style>
  .empty { padding: 32px 0; }
</style>
