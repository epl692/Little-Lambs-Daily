/**
 * Keyboard behaviour for sheets and dialogs: focus moves in when one opens, Tab and Shift+Tab stay inside it, Escape
 * closes it (when it can be dismissed), and focus goes back to whatever opened it.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapFocus(node: HTMLElement, opts: { onEscape?: () => void } = {}) {
  const opener = document.activeElement as HTMLElement | null;
  const items = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.getClientRects().length > 0);
  if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1'); // so the dialog itself can take focus when it has nothing else
  queueMicrotask(() => {
    if (!node.contains(document.activeElement)) (items()[0] ?? node).focus();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.onEscape) {
      e.stopPropagation();
      opts.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = items();
    if (list.length === 0) {
      e.preventDefault();
      node.focus();
      return;
    }
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const here = document.activeElement;
    if (e.shiftKey && (here === first || !node.contains(here))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (here === last || !node.contains(here))) {
      e.preventDefault();
      first.focus();
    }
  };
  node.addEventListener('keydown', onKey);
  return {
    update(o: { onEscape?: () => void }) {
      opts = o;
    },
    destroy() {
      node.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    },
  };
}
