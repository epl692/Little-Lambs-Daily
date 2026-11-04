// Runs synchronously before first paint (a file, not inline: the CSP forbids inline scripts). Keep in sync with ui/src/lib/theme.ts.
(function () {
  try {
    var choice = localStorage.getItem('lld.theme') || 'system';
    var dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', dark ? '#0F1B1A' : '#14B8A6');
  } catch {}
})();
