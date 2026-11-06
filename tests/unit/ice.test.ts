import { describe, expect, it } from 'vitest';
import { explainReach, summarizeSdp } from '../../ui/src/lib/ice';

const cand = (addr: string, typ = 'host') => `a=candidate:1 1 udp 2113937151 ${addr} 54321 typ ${typ} generation 0`;
const sdp = (...c: string[]) => ['v=0', ...c].join('\r\n');

describe('direct connection hints', () => {
  it('counts hidden names, real addresses and server addresses', () => {
    const s = summarizeSdp(sdp(cand('a1b2.local'), cand('192.168.1.20'), cand('fe80::1'), cand('203.0.113.5', 'srflx')));
    expect(s).toEqual({ v4: ['192.168.1.20'], v6: 1, hidden: 1, server: 1 });
  });
  it('blames name lookups when a device only offers hidden names', () => {
    const notes = explainReach(summarizeSdp(sdp(cand('x.local'))), summarizeSdp(sdp(cand('192.168.1.9'))));
    expect(notes.join(' ')).toMatch(/mDNS/);
  });
  it('spots two different networks', () => {
    const notes = explainReach(summarizeSdp(sdp(cand('192.168.1.20'))), summarizeSdp(sdp(cand('10.0.0.7'))));
    expect(notes.join(' ')).toMatch(/different networks/);
  });
  it('falls back to client isolation when everything looks fine', () => {
    const notes = explainReach(summarizeSdp(sdp(cand('192.168.1.20'))), summarizeSdp(sdp(cand('192.168.1.31'))));
    expect(notes.join(' ')).toMatch(/isolation/);
  });
});
