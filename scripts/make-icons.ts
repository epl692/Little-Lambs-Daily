// One-off: writes original placeholder icons (a cream cloud-lamb on teal). Run: npm run icons
import { writeFileSync } from 'node:fs';
import { encodePng } from '../framework/packages/app-build/src/png';

type Px = [number, number, number, number];
const teal: Px = [0x14, 0xb8, 0xa6, 255];
const cream: Px = [0xff, 0xf8, 0xe7, 255];
const ink: Px = [0x0f, 0x1b, 0x1a, 255];

const disc = (u: number, v: number, cx: number, cy: number, r: number) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;

/** Fluffy cloud body with two eyes. `safe` shrinks the art so a maskable icon survives cropping. */
function icon(size: number, safe: boolean) {
  const s = safe ? 0.6 : 0.82;
  const off = (1 - s) / 2;
  return encodePng(size, size, (x, y) => {
    const u = (x / size - off) / s;
    const v = (y / size - off) / s;
    const body = disc(u, v, 0.3, 0.55, 0.2) || disc(u, v, 0.5, 0.42, 0.24) || disc(u, v, 0.7, 0.55, 0.2) || disc(u, v, 0.5, 0.62, 0.22);
    const eye = disc(u, v, 0.42, 0.55, 0.025) || disc(u, v, 0.58, 0.55, 0.025);
    return eye ? ink : body ? cream : teal;
  });
}

writeFileSync('public/icons/icon-192.png', icon(192, false));
writeFileSync('public/icons/icon-512.png', icon(512, false));
writeFileSync('public/icons/maskable-512.png', icon(512, true));
console.log('icons written');
