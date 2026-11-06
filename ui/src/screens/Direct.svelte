<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { App } from '../lib/app.svelte';
  import type { DirectPairing } from '../lib/types';
  import CopyShare from '../components/CopyShare.svelte';
  import QrCode from '../components/QrCode.svelte';
  import QrScanner from '../components/QrScanner.svelte';
  import Top from '../components/Top.svelte';
  import { explainReach, summarizeSdp, type CandidateSummary } from '../lib/ice';

  // Connect two devices straight to each other (WebRTC), for when the relay cannot be reached: the same Wi-Fi is enough, no internet.
  // The devices swap two codes by camera or paste: one makes an offer, the other answers, the first accepts the answer.
  let { ctx }: { ctx: App } = $props();
  const direct = $derived<DirectPairing | undefined>(ctx.api.direct?.());

  type Step = 'choose' | 'offering' | 'answering' | 'done';
  let step = $state<Step>('choose');
  let code = $state(''); // the code this device shows
  let incoming = $state(''); // the code typed, pasted or scanned
  let session = '';
  let busy = $state(false);
  let error = $state('');
  let scanning = $state(false);
  let startCount = 0;
  let hints = $state<string[]>([]);
  const summary = async (c: string): Promise<CandidateSummary | undefined> => {
    try {
      return summarizeSdp((await direct?.inspect(c)) ?? '');
    } catch {
      return undefined;
    }
  };
  /** After a failure: read both codes' addresses and say what is probably wrong. */
  async function diagnose() {
    hints = explainReach(code ? await summary(code) : undefined, incoming.trim() ? await summary(incoming.trim()) : undefined);
  }

  const PROBLEMS: Record<string, string> = {
    malformed: 'That does not look like a connection code. Copy it again in full.',
    expired: 'That code has expired. Start again.',
    reused: 'That code was already used. Start again.',
    mismatch: 'That reply belongs to a different connection. Start again.',
    timeout: 'Nothing connected in time. Make sure both devices are on the same Wi-Fi, then start again.',
    unreachable: 'The two devices could not reach each other. They need to be on the same Wi-Fi.',
  };
  const explain = (e: unknown) => PROBLEMS[(e as { code?: string }).code ?? ''] ?? (e instanceof Error && e.message ? e.message : 'The connection failed. Start again.');

  onMount(() => {
    startCount = ctx.api.sync?.get().direct ?? 0;
    return ctx.api.sync?.subscribe((s) => {
      if ((s.direct ?? 0) > startCount && (step === 'offering' || step === 'answering')) step = 'done';
    });
  });
  onDestroy(() => {
    if (session && step !== 'done') direct?.cancel(session);
  });

  async function start() {
    if (!direct || busy) return;
    busy = true;
    error = '';
    try {
      const r = await direct.createOffer();
      code = r.code;
      session = r.sessionId;
      step = 'offering';
    } catch (e) {
      error = explain(e);
    } finally {
      busy = false;
    }
  }
  async function connectWithAnswer() {
    if (!direct || busy) return;
    busy = true;
    error = '';
    try {
      await direct.acceptAnswer(session, incoming.trim());
      step = 'done';
    } catch (e) {
      error = explain(e);
      const c = (e as { code?: string }).code;
      if (c === 'timeout' || c === 'unreachable' || !c) await diagnose();
    } finally {
      busy = false;
    }
  }
  async function answerOffer() {
    if (!direct || busy) return;
    busy = true;
    error = '';
    try {
      const r = await direct.acceptOffer(incoming.trim());
      code = r.code;
      session = r.sessionId;
      step = 'answering';
    } catch (e) {
      error = explain(e);
    } finally {
      busy = false;
    }
  }
  function again() {
    if (session) direct?.cancel(session);
    session = code = incoming = error = '';
    hints = [];
    step = 'choose';
  }
</script>

<main class="page stack">
  <Top {ctx} title="Connect directly" />
  {#if !direct}
    <p class="muted" role="status" data-testid="direct-unavailable">Direct connections are not available in this browser.</p>
  {:else if step === 'choose'}
    <p class="muted">No internet, or the relay is down? Two devices on the same Wi-Fi can still share the day by connecting straight to each other. You swap two codes, once.</p>
    <button type="button" class="btn primary big" data-testid="direct-start" disabled={busy} onclick={start}>{busy ? 'Making a code…' : 'Start a connection on this device'}</button>
    <button type="button" class="btn big" data-testid="direct-join" onclick={() => (step = 'answering')}>The other device gave me a code</button>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
  {:else if step === 'offering'}
    <h2>1. Show this code to the other device</h2>
    <QrCode text={code} label="Connection code" api={ctx.api} />
    <label class="field">Or copy it
      <textarea readonly data-testid="direct-code">{code}</textarea>
    </label>
    <CopyShare text={code} title="Connection code" />
    <h2>2. Enter the reply it shows</h2>
    <button type="button" class="btn" data-testid="scan-qr" onclick={() => (scanning = true)}>📷 Scan the reply</button>
    <label class="field">Reply code
      <textarea bind:value={incoming} data-testid="direct-answer-input"></textarea>
    </label>
    {#if error}<p class="err" role="alert" data-testid="direct-error">{error}</p>{/if}
    {#if hints.length}<ul class="small muted" data-testid="direct-hints">{#each hints as h (h)}<li>{h}</li>{/each}</ul>{/if}
    <button type="button" class="btn primary big" data-testid="direct-connect" disabled={busy || !incoming.trim()} onclick={connectWithAnswer}>{busy ? 'Connecting…' : 'Connect'}</button>
    <button type="button" class="btn ghost" onclick={again}>Start over</button>
  {:else if step === 'answering' && !code}
    <h2>Enter the other device’s code</h2>
    <button type="button" class="btn" data-testid="scan-qr" onclick={() => (scanning = true)}>📷 Scan the code</button>
    <label class="field">Code
      <textarea bind:value={incoming} data-testid="direct-offer-input"></textarea>
    </label>
    {#if error}<p class="err" role="alert" data-testid="direct-error">{error}</p>{/if}
    <button type="button" class="btn primary big" data-testid="direct-reply" disabled={busy || !incoming.trim()} onclick={answerOffer}>{busy ? 'Working…' : 'Make a reply'}</button>
    <button type="button" class="btn ghost" onclick={again}>Start over</button>
  {:else if step === 'answering'}
    <h2>Show this reply to the other device</h2>
    <QrCode text={code} label="Reply code" api={ctx.api} />
    <label class="field">Or copy it
      <textarea readonly data-testid="direct-reply-code">{code}</textarea>
    </label>
    <CopyShare text={code} title="Reply code" />
    <p class="muted" role="status" aria-live="polite">Waiting for the other device to connect…</p>
    <button type="button" class="btn ghost" data-testid="direct-diagnose" onclick={diagnose}>Not connecting? Find out why</button>
    {#if hints.length}<ul class="small muted" data-testid="direct-hints">{#each hints as h (h)}<li>{h}</li>{/each}</ul>{/if}
    <button type="button" class="btn ghost" onclick={again}>Start over</button>
  {:else}
    <div class="card center stack" role="status" data-testid="direct-done">
      <h2>Connected ✓</h2>
      <p class="muted">These two devices now share changes directly while they are near each other. The sync button shows “Synced (direct)”.</p>
      <button type="button" class="btn primary" onclick={() => ctx.back()}>Done</button>
    </div>
  {/if}
</main>
{#if scanning}
  <QrScanner
    expect="pairing"
    onfound={(t) => {
      incoming = t;
      scanning = false;
    }}
    onclose={() => (scanning = false)}
  />
{/if}
