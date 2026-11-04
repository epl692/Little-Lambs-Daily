export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_KEY = 'lld.theme';
const META_COLOR = { light: '#14B8A6', dark: '#0F1B1A' } as const;

export function getChoice(storage: Pick<Storage, 'getItem'> = localStorage): ThemeChoice {
  const v = storage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolve(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
}

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/** Applies the theme to <html> and <meta name="theme-color">. Mirrors public/theme-init.js. */
export function apply(choice: ThemeChoice, doc: Document = document, prefersDark: boolean = systemDark()): 'light' | 'dark' {
  const t = resolve(choice, prefersDark);
  doc.documentElement.setAttribute('data-theme', t);
  doc.querySelector('meta[name=theme-color]')?.setAttribute('content', META_COLOR[t]);
  return t;
}

export function setChoice(choice: ThemeChoice, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(THEME_KEY, choice);
  apply(choice);
}

/** Re-applies when the OS scheme changes while the choice is "system". Returns an unsubscribe function. */
export function followSystem(): () => void {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const on = () => {
    if (getChoice() === 'system') apply('system');
  };
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}
