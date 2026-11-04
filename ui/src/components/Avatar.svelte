<script lang="ts">
  const KEYS = ['rose', 'orange', 'amber', 'lime', 'teal', 'sky', 'indigo', 'violet'];

  let { id, name, color, size = 40 }: { id: string; name: string; color?: string; size?: number } = $props();
  // The child's chosen color, or a steady one picked from their id so it never changes between screens.
  const key = $derived(
    color && KEYS.includes(color) ? color : KEYS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % KEYS.length]!,
  );
</script>

<span class="avatar" aria-hidden="true" style="background: var(--c-{key}); width: {size}px; height: {size}px; font-size: {Math.round(size * 0.45)}px">{name.slice(0, 1).toUpperCase()}</span>
