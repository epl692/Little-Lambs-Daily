<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import type { Entry } from '../lib/format';
  import { saveFile } from '../lib/download';
  import { familyNameOf } from '../lib/service';
  import { attendanceCsv, attendanceRows, buildExport, byWeek, EXPORT_TYPES, fmtHhmm, type ExportObject } from '../lib/reports';
  import { dayRange, fmtDateLong, fromDateInput, shiftDay, toDateInput } from '../lib/time';
  import { canvasReencode, THUMB_MAX, THUMB_QUALITY } from '../lib/photos';
  import { BackupError, parseBackup, planRestore, runRestore, type Backup, type Plan, type RestoreReport } from '../lib/restore';
  import { loadZip } from '../lib/zip';
  import Top from '../components/Top.svelte';

  // Reports and exports (SPEC 7.2, 7.3). Everything is built on this device from local data, so it works offline.
  let { ctx }: { ctx: App } = $props();
  const provider = $derived(ctx.app.st?.mode === 'provider');
  const families = $derived(ctx.app.st?.families ?? []);

  // ---- attendance (provider) ----
  // svelte-ignore state_referenced_locally
  let from = $state(toDateInput(shiftDay(ctx.app.now, -6)));
  // svelte-ignore state_referenced_locally
  let to = $state(toDateInput(ctx.app.now));
  let who = $state('all'); // 'all' | 'fam:<space>' | 'kid:<id>'
  let entries = $state<Entry[]>([]);
  const fromMs = $derived(fromDateInput(from));
  const toMs = $derived(fromDateInput(to));
  const rangeError = $derived(fromMs === undefined || toMs === undefined ? 'Choose both dates.' : fromMs > toMs ? 'The start date is after the end date.' : '');

  $effect(() => {
    if (!provider || fromMs === undefined || toMs === undefined || fromMs > toMs) return void (entries = []);
    const lo = dayRange(fromMs)[0];
    const hi = dayRange(toMs)[1];
    return ctx.api.data
      .query({ type: 'daycare.entry', where: (o) => (o.fields.kind === 'checkin' || o.fields.kind === 'checkout') && Number(o.fields.at) >= lo && Number(o.fields.at) < hi })
      .subscribe((r) => (entries = r));
  });

  const chosen = $derived(
    ctx.app.children.filter((c) => who === 'all' || (who.startsWith('fam:') ? c.space === who.slice(4) : c.id === who.slice(4))),
  );
  const rows = $derived(rangeError ? [] : attendanceRows(entries, new Map(chosen.map((c) => [c.id, c.name])), fromMs!, toMs!));
  const weeks = $derived(byWeek(rows));
  const flagged = $derived(rows.filter((r) => r.flag).length);
  const rangeLabel = $derived(rangeError ? '' : `${fmtDateLong(fromMs!)} to ${fmtDateLong(toMs!)}`);

  const downloadCsv = () => saveFile(`attendance_${from}_to_${to}.csv`, '﻿' + attendanceCsv(rows), 'text/csv;charset=utf-8'); // BOM so Excel reads accents
  const weekLabel = (monday: string) => `Week of ${fmtDateLong(fromDateInput(monday)!)}`;

  // ---- full export ----
  let withPhotos = $state(false);
  let busy = $state(false);
  let progress = $state('');
  let message = $state('');
  let exportError = $state('');

  async function exportAll() {
    if (busy) return;
    busy = true;
    message = exportError = '';
    progress = 'Gathering…';
    try {
      const mine = new Set(families.map((f) => f.id)); // only families this device still belongs to (never the Staff Space)
      const objects: ExportObject[] = [];
      for (const type of EXPORT_TYPES) {
        for (const o of await ctx.api.data.query({ type }).once()) if (mine.has(o.space)) objects.push({ id: o.id, type: o.type, space: o.space, fields: o.fields });
      }
      const blobs = ctx.api.blobs;
      const res = await buildExport({
        objects,
        spaces: families.map((f) => ({ id: f.id, name: f.name })),
        now: Date.now(),
        fetchPhoto: withPhotos && blobs ? (ref) => blobs.toBlob(ref) : undefined,
        onProgress: (d, t) => (progress = t ? `Photos ${d} of ${t}…` : ''),
      });
      saveFile(`${provider ? 'daycare' : 'family'}-export_${toDateInput(Date.now())}.zip`, res.zip as BlobPart, 'application/zip');
      message = withPhotos ? `Saved ${objects.length} records and ${res.photos} photos.${res.missing.length ? ` ${res.missing.length} photos could not be downloaded (listed in data.json). Connect and try again to include them.` : ''}` : `Saved ${objects.length} records.`;
    } catch (e) {
      exportError = e instanceof Error ? e.message : 'The export failed.';
    } finally {
      busy = false;
      progress = '';
    }
  }

  // ---- restore from a backup (provider) ----
  let backup = $state.raw<{ b: Backup; files: Record<string, Uint8Array>; plan: Plan; name: string } | undefined>();
  let restoring = $state(false);
  let restoreProgress = $state('');
  let restoreError = $state('');
  let report = $state<RestoreReport | undefined>();

  async function chooseBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    backup = report = undefined;
    restoreError = '';
    if (!file) return;
    try {
      const z = await loadZip();
      const files = z.unzipSync(new Uint8Array(await file.arrayBuffer()));
      const b = parseBackup(files, z.strFromU8);
      const have = new Set<string>();
      for (const type of EXPORT_TYPES) for (const o of await ctx.api.data.query({ type }).once()) have.add(o.id);
      const local = families.map((f) => ({ id: f.id, name: f.name ?? '' }));
      backup = { b, files, plan: planRestore(b, local, have, files), name: file.name };
    } catch (err) {
      restoreError = err instanceof BackupError ? err.message : 'That file could not be opened as a backup. Is it a ZIP made by this app?';
    }
  }

  async function restore() {
    if (!backup || restoring) return;
    restoring = true;
    restoreError = '';
    try {
      const blobs = ctx.api.blobs;
      report = await runRestore(backup.b, backup.files, backup.plan, {
        data: ctx.api.data,
        createFamily: async (name) => (await ctx.svc.createFamilySpace(name)).id,
        attach: blobs ? (file, o) => blobs.attach(file, o) : undefined,
        thumb: (file) => canvasReencode(file, THUMB_MAX, THUMB_QUALITY),
        me: { user: ctx.me() },
        onProgress: (d, t) => (restoreProgress = `Restoring ${d} of ${t}…`),
      });
      backup = undefined;
      await ctx.refresh();
    } catch (err) {
      restoreError = err instanceof Error ? err.message : 'The restore failed.';
    } finally {
      restoring = false;
      restoreProgress = '';
    }
  }
</script>

<main class="page stack">
  <div class="noprint"><Top {ctx} title="Reports and exports" /></div>

  {#if provider}
    <section class="card stack noprint" aria-labelledby="att-h">
      <h2 id="att-h">Attendance</h2>
      <div class="row wrap">
        <label class="field grow">From <input type="date" bind:value={from} data-testid="att-from" /></label>
        <label class="field grow">To <input type="date" bind:value={to} data-testid="att-to" /></label>
      </div>
      <label class="field">Who
        <select bind:value={who} data-testid="att-who">
          <option value="all">Everyone</option>
          {#each families as f (f.id)}
            <optgroup label="{familyNameOf(f)} family">
              <option value="fam:{f.id}">Whole {familyNameOf(f)} family</option>
              {#each ctx.app.children.filter((c) => c.space === f.id) as c (c.id)}<option value="kid:{c.id}">{c.name}</option>{/each}
            </optgroup>
          {/each}
        </select>
      </label>
      {#if rangeError}
        <p class="err" role="alert">{rangeError}</p>
      {:else}
        <p class="muted" role="status" data-testid="att-count">{rows.length} {rows.length === 1 ? 'day' : 'days'}{flagged ? ` · ${flagged} flagged (check-in without check-out, or the reverse)` : ''}</p>
      {/if}
      <div class="row wrap">
        <button type="button" class="btn primary" data-testid="att-csv" disabled={rows.length === 0} onclick={downloadCsv}>Download CSV</button>
        <button type="button" class="btn" data-testid="att-print" disabled={rows.length === 0} onclick={() => window.print()}>Print / PDF</button>
      </div>
    </section>

    <!-- what prints: one page per week, a signature line at the end of each -->
    <div data-testid="att-print-area">
      {#each weeks as w (w.monday)}
        <section class="week stack" data-testid="att-week">
          <h2 class="print-head">{ctx.app.daycareName || ctx.app.appName} · Attendance</h2>
          <p class="muted small print-head">{rangeLabel}</p>
          <h3>{weekLabel(w.monday)}</h3>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (a sideways-scrolling table must be reachable by keyboard) -->
          <div class="scroll" role="region" tabindex="0" aria-label="Attendance for {weekLabel(w.monday)}. Scrolls sideways."><table>
            <thead><tr><th>Date</th><th>Child</th><th>In</th><th>By</th><th>Out</th><th>By</th><th>Hours</th></tr></thead>
            <tbody>
              {#each w.rows as r (r.date + r.child)}
                <tr class:flag={!!r.flag} data-testid="att-row">
                  <td>{r.date}</td><td>{r.child}{#if r.flag}<br /><strong class="flagtext">⚠ {r.flag}</strong>{/if}</td><td>{fmtHhmm(r.checkIn)}</td><td>{r.checkedInBy}</td><td>{fmtHhmm(r.checkOut)}</td><td>{r.pickedUpBy}</td><td>{r.hours ?? ''}</td>
                </tr>
              {/each}
            </tbody>
          </table></div>
          <p class="sign">Provider signature: ______________________________ Date: ______________</p>
        </section>
      {/each}
    </div>
  {/if}

  {#if provider}
    <section class="card stack noprint" aria-labelledby="rs-h">
      <h2 id="rs-h">Restore from a backup</h2>
      <p class="muted">Choose a ZIP made by this app. Anything already here is left alone, so it is safe to run twice. Families that are not on this device are created (invite their parents again).</p>
      <label class="btn" style="cursor: pointer">Choose a backup file<input type="file" accept=".zip,application/zip" hidden data-testid="restore-file" onchange={chooseBackup} /></label>
      {#if backup}
        <div class="stack" data-testid="restore-plan">
          <strong>{backup.name}</strong>
          {#each backup.plan.families as f (f.from.id)}
            <p data-testid="restore-family"><strong>{f.from.name}</strong> {f.to ? '(already here)' : '(will be created)'}: {f.children.add} of {f.children.total} children, {f.entries.add} of {f.entries.total} entries, {f.replies.add} of {f.replies.total} replies to add{f.skippedNoPhotos ? `. ${f.skippedNoPhotos} photo entries have no photos in the file and will be skipped` : ''}</p>
          {/each}
          {#if backup.plan.reactionsSkipped}<p class="muted small">{backup.plan.reactionsSkipped} reactions are not restored. Entries and replies come back under your name as the person restoring, with the original author’s name kept.</p>{/if}
          <div class="row">
            <button type="button" class="btn primary" data-testid="restore-go" disabled={restoring} onclick={restore}>{restoring ? 'Restoring…' : 'Restore'}</button>
            <span class="muted" role="status">{restoreProgress}</span>
          </div>
        </div>
      {/if}
      {#if report}
        <p role="status" data-testid="restore-done">Restored {report.children} children, {report.entries} entries, {report.replies} replies and {report.photos} photos{report.skipped ? `; ${report.skipped} were already here` : ''}{report.createdFamilies.length ? `; created ${report.createdFamilies.join(', ')}` : ''}.{report.failed.length ? ` ${report.failed.length} could not be restored: ${[...new Set(report.failed.map((x) => x.why))].join('; ')}.` : ''}</p>
      {/if}
      {#if restoreError}<p class="err" role="alert" data-testid="restore-error">{restoreError}</p>{/if}
    </section>
  {/if}

  <section class="card stack noprint" aria-labelledby="ex-h">
    <h2 id="ex-h">{provider ? 'Back up everything' : 'Download your family’s records'}</h2>
    <p class="muted">A ZIP file with <code>data.json</code> (every child, entry, reply and reaction{provider ? ' for all families' : ''}){ctx.api.blobs ? ', and the photos if you choose' : ''}. A provider can restore from it on the same or a new device (Restore, above).</p>
    {#if ctx.api.blobs}
      <label class="row"><input type="checkbox" bind:checked={withPhotos} data-testid="export-photos" /> <span>Include photos (photos not on this device are downloaded first)</span></label>
    {/if}
    <div class="row">
      <button type="button" class="btn primary" data-testid="export-all" disabled={busy} onclick={exportAll}>{busy ? 'Working…' : 'Download ZIP'}</button>
      <span class="muted" role="status" data-testid="export-progress">{progress}</span>
    </div>
    {#if message}<p role="status" data-testid="export-done">{message}</p>{/if}
    {#if exportError}<p class="err" role="alert">{exportError}</p>{/if}
  </section>
</main>

<style>
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  td:first-child { white-space: nowrap; }
  .flagtext { color: var(--danger); font-size: 0.8125rem; }
  tr.flag td { background: color-mix(in srgb, var(--danger) 10%, transparent); }
  h3 { margin: 8px 0 0; font-size: 1rem; }
  .scroll { overflow-x: auto; }
  .sign { margin-top: 28px; display: none; }
  .print-head { display: none; }
  @media print {
    .print-head, .sign { display: block; }
    table { font-size: 11pt; }
    tr.flag td { background: none; font-weight: 700; }
  }
</style>
