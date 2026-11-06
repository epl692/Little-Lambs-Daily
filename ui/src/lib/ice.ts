/**
 * Reading the network addresses inside a direct-connection code, to explain why two devices could not find each other.
 * A code carries the sender's candidate addresses (ICE candidates in its session description).
 */

export interface CandidateSummary {
  /** Real IPv4 addresses, e.g. 192.168.1.20. */
  v4: string[];
  /** IPv6 addresses. */
  v6: number;
  /** Addresses the browser replaced with a random `.local` name (looked up by mDNS on the network). */
  hidden: number;
  /** Addresses a server reported (STUN/TURN); there are none unless the app is set up for them. */
  server: number;
}

export function summarizeSdp(sdp: string): CandidateSummary {
  const out: CandidateSummary = { v4: [], v6: 0, hidden: 0, server: 0 };
  for (const line of sdp.split(/\r?\n/)) {
    const m = /^a=candidate:\S+ \d+ (?:udp|tcp) \d+ (\S+) \d+ typ (\w+)/i.exec(line);
    if (!m) continue;
    const [, addr, typ] = m as unknown as [string, string, string];
    if (typ === 'srflx' || typ === 'relay') out.server++;
    else if (addr.endsWith('.local')) out.hidden++;
    else if (addr.includes(':')) out.v6++;
    else if (!out.v4.includes(addr)) out.v4.push(addr);
  }
  return out;
}

const subnet = (ip: string) => ip.split('.').slice(0, 3).join('.');

/** A plain-words reason the connection may have failed, from this device's code and the other device's code. */
export function explainReach(mine: CandidateSummary | undefined, theirs: CandidateSummary | undefined): string[] {
  const notes: string[] = [];
  for (const [who, c] of [
    ['This device', mine],
    ['The other device', theirs],
  ] as const) {
    if (!c) continue;
    if (!c.v4.length && !c.v6 && !c.server && !c.hidden) notes.push(`${who} offered no network address at all. Is it online, with Wi-Fi on?`);
    else if (!c.v4.length && !c.v6 && !c.server) notes.push(`${who} hides its address behind a private name, so the other device can only find it if this Wi-Fi allows name lookups (mDNS). Many routers, mesh systems and guest networks block that.`);
  }
  if (mine?.v4.length && theirs?.v4.length) {
    const mineNets = new Set(mine.v4.map(subnet));
    if (!theirs.v4.some((ip) => mineNets.has(subnet(ip)))) notes.push('The two devices are on different networks (their addresses start differently). Put both on the same Wi-Fi. Cellular data, a VPN or a guest network will not work.');
  }
  if (!notes.length) notes.push('Both devices offered usable addresses, so the Wi-Fi itself may be blocking device-to-device traffic ("client isolation" or a guest network). Try a phone hotspot that both devices join.');
  return notes;
}
