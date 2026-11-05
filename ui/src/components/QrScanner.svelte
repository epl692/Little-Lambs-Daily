<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { trapFocus } from '../lib/focus';
  import { cameraProblem, scan, type Expect, type ScanHandle } from '../lib/qrscan';

  // A full-screen camera view that reads one QR code and hands back its text.
  let { expect, onfound, onclose }: { expect: Expect; onfound: (text: string) => void; onclose: () => void } = $props();
  let video: HTMLVideoElement | undefined = $state();
  let message = $state('Starting the camera…');
  let problem = $state(false);
  let stream: MediaStream | undefined;
  let handle: ScanHandle | undefined;

  const what = $derived(expect === 'link' ? 'the device code' : expect === 'pairing' ? 'the connection code' : 'the invite QR code');

  onMount(async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!video) return stop();
      video.srcObject = stream;
      await video.play();
      message = `Point the camera at ${what}.`;
      handle = scan({
        video,
        expect,
        onFound: (text) => {
          stop();
          onfound(text);
        },
        onWrong: () => (message = `That is not ${what}. Try the one you were sent.`),
      });
    } catch (e) {
      problem = true;
      message = cameraProblem(e);
    }
  });

  function stop() {
    handle?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
  }
  onDestroy(stop);
</script>

<div class="scan" role="dialog" aria-modal="true" aria-label="Scan a QR code" use:trapFocus={{ onEscape: onclose }} data-testid="qr-scanner">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} playsinline muted aria-hidden="true"></video>
  <div class="frame" aria-hidden="true"></div>
  <p class="msg" role="status" data-testid="scan-message" class:problem>{message}</p>
  <button type="button" class="btn" data-testid="scan-cancel" onclick={onclose}>{problem ? 'Close' : 'Cancel'}</button>
</div>

<style>
  .scan { position: fixed; inset: 0; z-index: 70; background: #000; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 16px; padding: 24px 16px calc(24px + env(safe-area-inset-bottom)); }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .frame { position: absolute; top: 50%; left: 50%; width: min(70vw, 320px); aspect-ratio: 1; transform: translate(-50%, -60%); border: 4px solid #5eead4; border-radius: 24px; box-shadow: 0 0 0 100vmax rgb(0 0 0 / 45%); }
  .msg { position: relative; margin: 0; padding: 10px 14px; border-radius: 12px; background: rgb(0 0 0 / 65%); text-align: center; max-width: 520px; }
  .problem { background: #7a1d12; }
  .btn { position: relative; background: #fff; color: #04211e; border-color: transparent; }
</style>
