import { createRelayServer } from '../framework/packages/relay-server/src/server';
const s = await createRelayServer({ port: 8787, blobs: { dir: './test-results/relay-blobs-dbg' } });
const br: any = s.blobRelay;
const send = br.send.bind(br);
br.send = (peer: string, m: any) => { if (m.type !== 'chunk') console.log('SEND', peer, m.type, m.id?.slice?.(0, 6) ?? '', m.reason ?? '', JSON.stringify(m.ranges ?? '')); return send(peer, m); };
const handle = br.handle.bind(br);
br.handle = (peer: string, bytes: Uint8Array) => handle(peer, bytes);
console.log('debug relay up');
