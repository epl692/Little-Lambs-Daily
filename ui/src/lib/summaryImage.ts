/**
 * The daily summary as a picture (SPEC 7.1: "share as image"). A parent can send it to a grandparent in a text message. Drawn on a
 * canvas on this device, always on a light background so it reads the same wherever it is sent. Layout is pure and takes the
 * text-measuring function, so it can be tested without a browser.
 */

export interface DrawItem {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
}
export interface Layout {
  width: number;
  height: number;
  items: DrawItem[];
}

export const WIDTH = 1080;
const PAD = 64;
const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Break `text` into lines no wider than `max`, at spaces; a single word longer than a line is split. */
export function wrap(text: string, max: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  let line = '';
  const push = () => {
    if (line) out.push(line);
    line = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (measure(w) > max && w.length > 1) {
      // split an over-long word where it fits
      let k = w.length - 1;
      while (k > 1 && measure(w.slice(0, k)) > max) k--;
      push();
      out.push(w.slice(0, k));
      w = w.slice(k);
    }
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= max) line = next;
    else {
      push();
      line = w;
    }
  }
  push();
  return out.length ? out : [''];
}

/** `lines` come from `summaryLines`: a line starting with two spaces belongs to the heading above it. */
export function layoutSummary(title: string, subtitle: string, lines: string[], measure: (s: string, font: string) => number, brand = 'Little Lambs Daily'): Layout {
  const items: DrawItem[] = [];
  const inner = WIDTH - PAD * 2;
  let y = PAD;
  const add = (text: string, size: number, weight: number, color: string, indent = 0) => {
    const font = `${weight} ${size}px ${FONT}`;
    for (const l of wrap(text, inner - indent, (s) => measure(s, font))) {
      y += Math.round(size * 1.35);
      items.push({ text: l, x: PAD + indent, y, font, color });
    }
  };
  add(title, 60, 700, '#0f1b1a');
  add(subtitle, 34, 400, '#4b5f5d');
  y += 28;
  for (const raw of lines) {
    const nested = raw.startsWith('  ');
    add(raw.trim(), nested ? 32 : 38, nested ? 400 : 600, nested ? '#33423f' : '#0f1b1a', nested ? 36 : 0);
    y += nested ? 4 : 14;
  }
  y += 36;
  add(brand, 28, 600, '#0b5f57');
  return { width: WIDTH, height: y + PAD, items };
}

/** Draw it. Runs in a browser. */
export async function renderSummaryPng(title: string, subtitle: string, lines: string[]): Promise<Blob> {
  const probe = document.createElement('canvas').getContext('2d')!;
  const layout = layoutSummary(title, subtitle, lines, (s, font) => ((probe.font = font), probe.measureText(s).width));
  const c = document.createElement('canvas');
  c.width = layout.width;
  c.height = layout.height;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#14b8a6';
  g.fillRect(0, 0, c.width, 14); // the accent stripe
  g.textBaseline = 'alphabetic';
  for (const i of layout.items) {
    g.font = i.font;
    g.fillStyle = i.color;
    g.fillText(i.text, i.x, i.y);
  }
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the picture'))), 'image/png'));
}

/** Send the picture with the system share sheet when it can take files, else download it. */
export async function sharePicture(blob: Blob, filename: string, title: string, save: (name: string, data: Blob) => void): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  save(filename, blob);
  return 'saved';
}
