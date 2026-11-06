<script lang="ts">
  import { resetThisDevice } from '../lib/reset';

  let busy = $state(false);
  async function reset() {
    busy = true;
    await resetThisDevice();
  }
</script>

<main class="page stack center" style="padding-top: 48px">
  <div aria-hidden="true" style="font-size: 56px">🔒</div>
  <h1>This device was signed out</h1>
  <p class="muted">Another device removed it from the account, so it can no longer see anything. Reset it to connect again as a new device.</p>
  <button type="button" class="btn primary big" data-testid="reset-revoked" disabled={busy} onclick={reset}>{busy ? 'Resetting…' : 'Reset and reconnect'}</button>
</main>
