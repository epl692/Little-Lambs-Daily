import { describe, expect, it } from 'vitest';
import { WIDTH, layoutSummary, wrap } from '../../ui/src/lib/summaryImage';

// one pixel per character keeps the arithmetic obvious
const measure = (s: string) => s.length;

describe('wrapping text for the picture', () => {
  it('breaks at spaces and never exceeds the width', () => {
    expect(wrap('one two three four', 9, measure)).toEqual(['one two', 'three', 'four']);
    for (const l of wrap('a quick brown fox jumps over the lazy dog', 12, measure)) expect(l.length).toBeLessThanOrEqual(12);
  });
  it('splits a word that is longer than a line, without losing letters', () => {
    const out = wrap('supercalifragilistic ok', 8, measure);
    expect(out.every((l) => l.length <= 8)).toBe(true);
    expect(out.join('').replace(/ /g, '')).toBe('supercalifragilisticok');
  });
  it('empty text still has a line, and extra spaces collapse', () => {
    expect(wrap('', 10, measure)).toEqual(['']);
    expect(wrap('  a   b  ', 10, measure)).toEqual(['a b']);
  });
});

describe('laying out the daily summary picture', () => {
  const lines = ['Arrived 8:02 AM (dropped off by Mom)', 'Naps: 2h 5m total', '  12:30 PM – 2:05 PM · 1h 35m', 'Notes:', '  Great day!'];
  const l = layoutSummary('Ada’s day', 'Wednesday, November 4', lines, measure);

  it('is a fixed-width picture whose height fits everything', () => {
    expect(l.width).toBe(WIDTH);
    const bottom = Math.max(...l.items.map((i) => i.y));
    expect(l.height).toBeGreaterThan(bottom);
  });
  it('keeps order, and indents what belongs under a heading', () => {
    const texts = l.items.map((i) => i.text);
    expect(texts.slice(0, 2)).toEqual(['Ada’s day', 'Wednesday, November 4']);
    expect(texts.indexOf('Naps: 2h 5m total')).toBeLessThan(texts.indexOf('12:30 PM – 2:05 PM · 1h 35m'));
    const head = l.items.find((i) => i.text.startsWith('Naps'))!;
    const nested = l.items.find((i) => i.text.startsWith('12:30'))!;
    expect(nested.x).toBeGreaterThan(head.x);
    for (let i = 1; i < l.items.length; i++) expect(l.items[i]!.y).toBeGreaterThan(l.items[i - 1]!.y);
  });
  it('a long note wraps onto several lines instead of running off the edge', () => {
    const long = layoutSummary('t', 's', ['Notes:', `  ${'word '.repeat(400)}`], (s) => s.length * 20);
    const wrapped = long.items.filter((i) => i.text.startsWith('word'));
    expect(wrapped.length).toBeGreaterThan(5);
    expect(wrapped.every((i) => i.text.length * 20 <= WIDTH - 128 - 36)).toBe(true);
  });
  it('ends with the app name', () => {
    expect(l.items[l.items.length - 1]!.text).toBe('Little Lambs Daily');
  });
});
