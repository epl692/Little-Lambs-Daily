<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { App, Sheet } from '../lib/app.svelte';
  import { KIND_META, kindOf, type Kind } from '../lib/format';
  import { guessMealPeriod, kindsFor, noteKindFor } from '../lib/log';
  import { familyCount, preparePhoto, type Prepared } from '../lib/photos';
  import { byChild, childStatus } from '../lib/timeline';
  import { dayRange, fmtTime, fromDateTimeInput, isSameDay, toDateTimeInput } from '../lib/time';
  import Avatar from './Avatar.svelte';
  import Stepper from './Stepper.svelte';

  // The add flow (SPEC 6.5): What? -> Who? -> Details + Save. Defaults do the heavy lifting; Who is skipped when it is obvious.
  let { ctx, sheet }: { ctx: App; sheet: Sheet } = $props();

  // svelte-ignore state_referenced_locally
  const logger = ctx.logger;
  // svelte-ignore state_referenced_locally
  const role = ctx.role();
  // svelte-ignore state_referenced_locally
  const edit = sheet.edit;
  const editKind: Kind | undefined = edit ? kindOf(edit) : undefined;
  const kids = $derived(ctx.app.children);
  const limit = edit && role === 'parent' ? dayRange(Number(edit.fields.at)) : undefined;

  /** Note is one tile; its kind depends on who is writing. */
  type Tile = Kind | 'note';
  const tileKinds: Tile[] = role === 'provider' ? ['checkin', 'checkout', 'nap', 'bottle', 'snack', 'meal', 'diaper', 'photo', 'note'] : ['checkin', 'checkout', 'home', 'note'];
  const realKind = (t: Tile): Kind => (t === 'note' ? noteKindFor(role) : t);
  const allowed = kindsFor(role);

  const CONTENTS = [['breastMilk', 'Breast milk'], ['formula', 'Formula'], ['milk', 'Milk'], ['water', 'Water'], ['other', 'Other']] as const;
  const PERIODS = [['breakfast', 'Breakfast'], ['amSnack', 'AM snack'], ['lunch', 'Lunch'], ['pmSnack', 'PM snack'], ['dinner', 'Dinner'], ['other', 'Other']] as const;
  const AMOUNTS = [['all', 'All'], ['most', 'Most'], ['some', 'Some'], ['none', 'None']] as const;
  const DIAPERS = [['wet', '💧 Wet'], ['soiled', '💩 Soiled'], ['both', '💧💩 Both'], ['dry', '✨ Dry']] as const;
  const DIAPER_NOTES = [['rash', 'Rash'], ['creamApplied', 'Cream applied'], ['potty', 'Potty']] as const;
  const HOME_KINDS = [['slept', 'Slept'], ['ate', 'Ate'], ['bottle', 'Bottle'], ['diaper', 'Diaper'], ['medicine', 'Medicine'], ['mood', 'Mood'], ['other', 'Other']] as const;
  const MOODS = [['great', '😄 Great'], ['ok', '🙂 OK'], ['fussy', '😣 Fussy'], ['sick', '🤒 Sick']] as const;

  // ---- state ----
  const f = edit?.fields ?? {};
  let step = $state<'what' | 'who' | 'details'>(edit ? 'details' : 'what');
  let kind = $state<Kind | undefined>(editKind);
  // svelte-ignore state_referenced_locally
  let selected = $state<string[]>(edit ? [String(f.child)] : [...(sheet.preset ?? [])]);
  // svelte-ignore state_referenced_locally
  const presetGiven = (sheet.preset?.length ?? 0) > 0;
  let atMs = $state<number | undefined>(edit ? Number(f.at) : undefined); // undefined means "now"
  let timeOpen = $state(false);
  let by = $state(String(f.by ?? ''));
  let text = $state(String(f.text ?? ''));
  let bottleContents = $state(String(f.bottleContents ?? 'formula'));
  let ozOffered = $state(Number(f.ozOffered ?? 4));
  let ozFinished = $state(Number(f.ozFinished ?? f.ozOffered ?? 4));
  let finishedTouched = $state(f.ozFinished !== undefined);
  let mealPeriod = $state(String(f.mealPeriod ?? 'lunch'));
  let served = $state(String(f.served ?? ''));
  let amounts = $state<Record<string, string>>(edit && f.amount ? { [String(f.child)]: String(f.amount) } : {});
  let diaperNotes = $state<string[]>(Array.isArray(f.diaperNote) ? [...f.diaperNote] : []);
  // svelte-ignore state_referenced_locally
  let moreOpen = $state(diaperNotes.length > 0);
  let napMode = $state<'start' | 'past'>(edit ? 'past' : 'start');
  let endMs = $state<number | undefined>(typeof f.endAt === 'number' ? f.endAt : undefined);
  let homeKind = $state(String(f.homeKind ?? 'slept'));
  let mood = $state(String(f.mood ?? ''));
  let busy = $state(false);
  // photos: picked first, shrunk on this device, then tagged to children
  let files = $state<Array<Prepared & { url: string }>>([]);
  let preparing = $state(false);
  let progress = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state('');
  let dialog: HTMLDivElement | undefined = $state();

  const label = (k: Kind | Tile) => (k === 'note' ? 'Note' : KIND_META[k as Kind].label);
  const icon = (k: Kind | Tile) => (k === 'note' ? KIND_META[noteKindFor(role)].icon : KIND_META[k as Kind].icon);
  // Finished starts equal to offered and follows it until it is set by hand; it can never exceed what was offered.
  const finishedNow = $derived(Math.min(finishedTouched ? ozFinished : ozOffered, ozOffered));
  const nameOf = (id: string) => kids.find((c) => c.id === id)?.name ?? '';

  // Status per child decides the order in "Who": for check-in, those not here yet come first.
  const states = $derived.by(() => {
    const by = byChild(ctx.app.todayEntries);
    return new Map(kids.map((c) => [c.id, childStatus(by.get(c.id) ?? [], ctx.app.now).state] as const));
  });
  const here = (id: string) => ['here', 'napping'].includes(states.get(id) ?? 'notHere');
  const ordered = $derived.by(() => {
    const wantHere = kind === 'checkout' || (kind !== 'checkin' && kind !== undefined);
    return [...kids].sort((a, b) => Number(wantHere ? here(b.id) : here(a.id)) - Number(wantHere ? here(a.id) : here(b.id)) || a.name.localeCompare(b.name));
  });
  const hereIds = $derived(kids.filter((c) => here(c.id)).map((c) => c.id));

  function defaultBy(): string {
    const s = ctx.api.spaces.admin?.session()?.displayName ?? '';
    return /\(([^)]+)\)\s*$/.exec(s)?.[1] ?? localStorage.getItem('lld.relationship') ?? s.split(' ')[0] ?? '';
  }
  const byChips = $derived([...new Set([...logger.recent('by'), defaultBy()].filter(Boolean))]);

  async function picked(list: FileList | null) {
    if (!list || list.length === 0) return;
    error = '';
    preparing = true;
    try {
      const room = 12 - files.length;
      const next: Array<Prepared & { url: string }> = [];
      for (const file of [...list].slice(0, room)) {
        progress = `Preparing photo ${files.length + next.length + 1}…`;
        const p = await preparePhoto(file);
        next.push({ ...p, url: URL.createObjectURL(p.thumb) });
      }
      files = [...files, ...next];
      if (kind !== 'photo') pickTile('photo', true);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not read that photo';
    } finally {
      preparing = false;
      progress = '';
      if (fileInput) fileInput.value = '';
    }
  }
  const removeFile = (i: number) => {
    URL.revokeObjectURL(files[i]!.url);
    files = files.filter((_, j) => j !== i);
  };
  onDestroy(() => files.forEach((f) => URL.revokeObjectURL(f.url)));

  function pickTile(t: Tile, haveFiles = false) {
    const k = realKind(t);
    if (k === 'photo' && !haveFiles) return void fileInput?.click(); // the picker opens first (SPEC 6.5)
    kind = k;
    const last = logger.last(k);
    if (k === 'bottle') {
      bottleContents = last.bottleContents ?? 'formula';
      ozOffered = Number(last.ozOffered ?? 4);
      ozFinished = ozOffered;
      finishedTouched = false;
    }
    if (k === 'snack' || k === 'meal') mealPeriod = guessMealPeriod(k, Date.now());
    if (k === 'checkin' || k === 'checkout') by = String(last.by ?? defaultBy());
    if (selected.length === 0 && kids.length === 1) selected = [kids[0]!.id]; // a parent with one child never sees "who"
    step = selected.length > 0 ? 'details' : 'who';
  }
  const toggle = (id: string) => (selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  function back() {
    error = '';
    step = step === 'details' && !presetGiven && kids.length > 1 ? 'who' : 'what';
  }
  const close = () => ctx.closeAdd();

  // ---- saving ----
  function fieldsFor(k: Kind, extra: Record<string, unknown>): { fields: Record<string, unknown>; perChild?: Record<string, Record<string, unknown>> } {
    switch (k) {
      case 'checkin':
      case 'checkout':
        return { fields: { by, text } };
      case 'nap':
        return { fields: napMode === 'past' ? { endAt: endMs } : {} };
      case 'bottle':
        return { fields: { bottleContents, ozOffered, ozFinished: finishedNow } };
      case 'snack':
      case 'meal':
        return { fields: { mealPeriod, served }, perChild: Object.fromEntries(selected.map((id) => [id, { amount: amounts[id] ?? 'all' }])) };
      case 'diaper':
        return { fields: { diaper: extra.diaper, diaperNote: diaperNotes } };
      case 'home':
        return { fields: { homeKind, mood, text } };
      default:
        return { fields: { text } };
    }
  }
  const summaryOf = (k: Kind, n: number, extra: Record<string, unknown>) =>
    n > 1 ? `Logged for ${n} kids` : k === 'nap' && napMode === 'start' ? `${nameOf(selected[0]!)} is asleep` : `Logged ${label(k).toLowerCase()} for ${nameOf(selected[0]!)}${k === 'diaper' ? ` (${String(extra.diaper)})` : ''}`;

  async function save(extra: Record<string, unknown> = {}) {
    if (busy || !kind) return;
    error = '';
    const at = atMs ?? Date.now();
    if (kind === 'nap' && napMode === 'past' && !(edit && typeof f.endAt !== 'number')) {
      if (endMs === undefined) return void (error = 'Choose when the nap ended');
      if (endMs < at) return void (error = 'The nap cannot end before it started');
    }
    // parents may move their own entry's time, but only within the day it was logged (SPEC 13.3)
    if (edit && role === 'parent' && !isSameDay(at, Number(f.at))) return void (error = 'You can only change the time within the same day.');
    if ((kind === 'providerNote' || kind === 'familyNote') && !text.trim()) return void (error = 'Write a note first');
    busy = true;
    try {
      const { fields, perChild } = fieldsFor(kind, extra);
      if (edit) {
        await logger.edit(edit.id, { ...fields, ...(perChild?.[String(f.child)] ?? {}), at });
        ctx.buzz();
        close();
        ctx.showToast('Saved changes');
        return;
      }
      const targets = targetsNow;
      if (kind === 'photo') {
        const { ids } = await ctx.photos.post({ targets, photos: files, text, at, onProgress: (d, t) => (progress = `Saving ${d} of ${t}…`) });
        ctx.buzz();
        close();
        ctx.showToast(targets.length > 1 ? `Posted for ${targets.length} kids` : `Posted ${files.length === 1 ? 'a photo' : `${files.length} photos`} of ${nameOf(selected[0]!)}`, () => logger.undo(ids));
        return;
      }
      const { ids } = await logger.log({ kind, targets, at, fields, perChild });
      // remember for next time
      if (kind === 'bottle') logger.remember('bottle', { bottleContents, ozOffered });
      if (kind === 'checkin' || kind === 'checkout') logger.remember(kind, { by });
      if (kind === 'snack' || kind === 'meal') logger.pushRecent('served', served);
      logger.pushRecent('by', by);
      ctx.buzz();
      close();
      ctx.showToast(summaryOf(kind, targets.length, extra), () => logger.undo(ids));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save. Try again.';
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', key);
    dialog?.querySelector<HTMLElement>('button:not([disabled]), input, textarea')?.focus();
    return () => removeEventListener('keydown', key);
  });
  $effect(() => {
    // move focus into the new step
    void step;
    queueMicrotask(() => dialog?.querySelector<HTMLElement>('[data-autofocus], .tile, .who-chip, .btn.primary')?.focus());
  });

  const canSave = $derived(!!kind && step === 'details' && kind !== 'diaper' && (kind !== 'photo' || !!edit || files.length > 0));
  const targetsNow = $derived(selected.flatMap((id) => kids.filter((c) => c.id === id).map((c) => ({ id: c.id, space: c.space }))));
  const families = $derived(familyCount(targetsNow));
  const title = $derived(edit ? `Edit ${label(kind!).toLowerCase()}` : step === 'what' ? 'Add to the day' : step === 'who' ? `Who? · ${label(kind!)}` : label(kind!));
</script>

<button type="button" class="scrim" aria-label="Close" tabindex="-1" onclick={close}></button>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" bind:this={dialog} data-testid="add-sheet">
  <header class="row hd">
    {#if step !== 'what' && !edit}
      <button type="button" class="btn ghost" aria-label="Back" data-testid="sheet-back" onclick={back}>←</button>
    {/if}
    <h2 id="sh-t" class="grow">{title}</h2>
    <button type="button" class="btn ghost" aria-label="Close" data-testid="sheet-close" onclick={close}>✕</button>
  </header>

  <input type="file" accept="image/*" multiple class="hidden" bind:this={fileInput} data-testid="photo-input" onchange={(e) => picked(e.currentTarget.files)} />
  <div class="body stack">
    {#if preparing}<p class="muted" role="status" data-testid="photo-progress">{progress}</p>{/if}
    {#if step === 'what'}
      <div class="tiles" role="group" aria-label="What happened?">
        {#each tileKinds.filter((t) => allowed.includes(realKind(t))) as t (t)}
          <button type="button" class="tile" data-testid="tile-{t}" onclick={() => pickTile(t)}>
            <span class="ico" aria-hidden="true">{icon(t)}</span>
            <span>{label(t)}</span>
          </button>
        {/each}
      </div>
    {:else if step === 'who'}
      <div class="row wrap" role="group" aria-label="Which children">
        {#if role === 'provider' && kind !== 'checkin' && hereIds.length > 0}
          <button type="button" class="chip" data-testid="who-all-here" aria-pressed={hereIds.length === selected.length && hereIds.every((i) => selected.includes(i))} onclick={() => (selected = [...hereIds])}>All checked in ({hereIds.length})</button>
        {/if}
        {#each ordered as c (c.id)}
          <button type="button" class="chip who-chip row" data-testid="who-{c.name}" aria-pressed={selected.includes(c.id)} onclick={() => toggle(c.id)}>
            <Avatar id={c.id} name={c.name} color={c.color} size={28} />{c.name}{#if here(c.id)}<span class="dotok" title="Here" aria-label="here">●</span>{/if}
          </button>
        {/each}
      </div>
      <p class="muted small">Tap to pick one or several. One entry is made for each child.</p>
    {:else if kind}
      <!-- details -->
      <div class="row wrap who-line">
        {#each selected as id (id)}<span class="mini row"><Avatar {id} name={nameOf(id)} size={22} />{nameOf(id)}</span>{/each}
        {#if presetGiven && !edit && kids.length > 1}
          <button type="button" class="btn ghost small" data-testid="add-more-kids" onclick={() => (step = 'who')}>Add more kids</button>
        {/if}
      </div>

      {#if kind !== 'nap' || napMode === 'start'}
        <div class="row">
          <button type="button" class="pill" data-testid="time-pill" aria-expanded={timeOpen} onclick={() => (timeOpen = !timeOpen)}>🕒 {atMs ? fmtTime(atMs) : 'Now'} ▾</button>
          {#if atMs && !edit}<button type="button" class="btn ghost" onclick={() => ((atMs = undefined), (timeOpen = false))}>Reset to now</button>{/if}
        </div>
        {#if timeOpen}
          <label class="field">{kind === 'nap' ? 'Nap started' : 'Time'}
            <input type="datetime-local" data-testid="time-input" value={toDateTimeInput(atMs ?? Date.now())} min={limit ? toDateTimeInput(limit[0]) : undefined} max={limit ? toDateTimeInput(limit[1] - 60_000) : undefined} onchange={(e) => (atMs = fromDateTimeInput(e.currentTarget.value))} />
          </label>
        {/if}
      {/if}

      {#if kind === 'checkin' || kind === 'checkout'}
        <div class="stack" role="group" aria-label={kind === 'checkin' ? 'Dropped off by' : 'Picked up by'}>
          <span class="field">{kind === 'checkin' ? 'Dropped off by' : 'Picked up by'}</span>
          <div class="row wrap">
            {#each byChips as b (b)}<button type="button" class="chip" aria-pressed={by === b} data-testid="by-{b}" onclick={() => (by = b)}>{b}</button>{/each}
          </div>
          <input type="text" bind:value={by} maxlength="40" placeholder="Someone else?" aria-label="Name" data-testid="by-input" />
        </div>
        <label class="field">Note (optional)<input type="text" bind:value={text} maxlength="200" placeholder="e.g. last bottle 6:45" /></label>
      {:else if kind === 'nap'}
        {#if !edit}
          <div class="row" role="group" aria-label="Nap">
            <button type="button" class="chip grow" aria-pressed={napMode === 'start'} data-testid="nap-mode-start" onclick={() => (napMode = 'start')}>Start nap</button>
            <button type="button" class="chip grow" aria-pressed={napMode === 'past'} data-testid="nap-mode-past" onclick={() => (napMode = 'past')}>Log past nap</button>
          </div>
        {/if}
        {#if napMode === 'past'}
          <label class="field">Fell asleep<input type="datetime-local" data-testid="nap-start-input" value={toDateTimeInput(atMs ?? Date.now() - 3_600_000)} onchange={(e) => (atMs = fromDateTimeInput(e.currentTarget.value))} /></label>
          <label class="field">Woke up<input type="datetime-local" data-testid="nap-end-input" value={endMs ? toDateTimeInput(endMs) : ''} onchange={(e) => (endMs = fromDateTimeInput(e.currentTarget.value))} /></label>
        {:else}
          <p class="muted">The nap starts {atMs ? `at ${fmtTime(atMs)}` : 'now'} and the timer runs until you tap “Woke up”.</p>
        {/if}
      {:else if kind === 'bottle'}
        {#each kids.filter((c) => selected.includes(c.id) && c.allergies) as c (c.id)}<p class="err" role="note">⚠ {c.name}: {c.allergies}</p>{/each}
        <div class="row wrap" role="group" aria-label="Contents">
          {#each CONTENTS as [v, l] (v)}<button type="button" class="chip" aria-pressed={bottleContents === v} data-testid="contents-{v}" onclick={() => (bottleContents = v)}>{l}</button>{/each}
        </div>
        <Stepper label="Offered" value={ozOffered} oninput={(v) => (ozOffered = v)} testid="oz-offered" />
        <Stepper label="Finished" value={finishedNow} max={ozOffered} oninput={(v) => ((ozFinished = v), (finishedTouched = true))} testid="oz-finished" />
      {:else if kind === 'snack' || kind === 'meal'}
        {#each kids.filter((c) => selected.includes(c.id) && c.allergies) as c (c.id)}<p class="err" role="note">⚠ {c.name}: {c.allergies}</p>{/each}
        <div class="row wrap" role="group" aria-label="Meal">
          {#each PERIODS as [v, l] (v)}<button type="button" class="chip" aria-pressed={mealPeriod === v} data-testid="period-{v}" onclick={() => (mealPeriod = v)}>{l}</button>{/each}
        </div>
        <label class="field">What was served<input type="text" bind:value={served} maxlength="200" placeholder="Mac &amp; cheese, peas, pears" data-testid="served-input" /></label>
        {#if logger.recent('served').length}
          <div class="row wrap" aria-label="Recent">
            {#each logger.recent('served') as r (r)}<button type="button" class="chip" onclick={() => (served = r)}>{r}</button>{/each}
          </div>
        {/if}
        <div class="stack" role="group" aria-label="How much was eaten">
          {#each selected as id (id)}
            <div class="row wrap amt">
              {#if selected.length > 1}<span class="grow"><strong>{nameOf(id)}</strong></span>{/if}
              {#each AMOUNTS as [v, l] (v)}
                <button type="button" class="chip" aria-pressed={(amounts[id] ?? 'all') === v} data-testid="amount-{nameOf(id)}-{v}" onclick={() => (amounts[id] = v)}>{l}</button>
              {/each}
            </div>
          {/each}
        </div>
      {:else if kind === 'photo'}
        {#if !edit}
          <div class="thumbs" data-testid="photo-previews">
            {#each files as f, i (f.url)}
              <div class="pv">
                <img src={f.url} alt="Selected photo {i + 1}" />
                <button type="button" class="x" aria-label="Remove photo {i + 1}" data-testid="photo-remove" onclick={() => removeFile(i)}>✕</button>
              </div>
            {/each}
            {#if files.length < 12}
              <button type="button" class="pv addmore" aria-label="Add more photos" data-testid="photo-more" disabled={preparing} onclick={() => fileInput?.click()}>＋</button>
            {/if}
          </div>
          {#if families > 1}<p class="warn" role="note" data-testid="families-warning">Visible to {families} families</p>{/if}
        {/if}
        <label class="field">Caption (optional)
          <textarea bind:value={text} maxlength="2000" data-testid="photo-caption"></textarea>
        </label>
      {:else if kind === 'diaper'}
        <div class="diapers" role="group" aria-label="Diaper">
          {#each DIAPERS as [v, l] (v)}
            <button type="button" class="btn big" disabled={busy} data-testid="diaper-{v}" onclick={() => save({ diaper: v })}>{l}</button>
          {/each}
        </div>
        <button type="button" class="btn ghost" data-testid="diaper-more" aria-expanded={moreOpen} onclick={() => (moreOpen = !moreOpen)}>More… {moreOpen ? '▴' : '▾'}</button>
        {#if moreOpen}
          <div class="row wrap" role="group" aria-label="Extras">
            {#each DIAPER_NOTES as [v, l] (v)}
              <button type="button" class="chip" aria-pressed={diaperNotes.includes(v)} data-testid="diaper-note-{v}" onclick={() => (diaperNotes = diaperNotes.includes(v) ? diaperNotes.filter((x) => x !== v) : [...diaperNotes, v])}>{l}</button>
            {/each}
          </div>
        {/if}
        <p class="muted small">Tap Wet, Soiled, Both or Dry to save.</p>
      {:else if kind === 'home'}
        <div class="row wrap" role="group" aria-label="What happened at home">
          {#each HOME_KINDS as [v, l] (v)}<button type="button" class="chip" aria-pressed={homeKind === v} data-testid="home-{v}" onclick={() => (homeKind = v)}>{l}</button>{/each}
        </div>
        <div class="row wrap" role="group" aria-label="Mood (optional)">
          {#each MOODS as [v, l] (v)}<button type="button" class="chip" aria-pressed={mood === v} onclick={() => (mood = mood === v ? '' : v)}>{l}</button>{/each}
        </div>
        <label class="field">Details (optional)<input type="text" bind:value={text} maxlength="500" placeholder="Slept 10 hours" data-testid="home-text" /></label>
      {:else}
        <label class="field">{kind === 'familyNote' ? 'Note for the daycare' : 'Note for the family'}
          <textarea bind:value={text} maxlength="2000" data-autofocus data-testid="note-text"></textarea>
        </label>
      {/if}
    {/if}

    {#if error}<p class="err" role="alert" data-testid="sheet-error">{error}</p>{/if}
  </div>

  {#if step === 'who'}
    <footer class="foot"><button type="button" class="btn primary big" disabled={selected.length === 0} data-testid="who-next" onclick={() => (step = 'details')}>{selected.length ? `Continue (${selected.length})` : 'Pick a child'}</button></footer>
  {:else if canSave}
    <footer class="foot">
      <button type="button" class="btn primary big" disabled={busy} data-testid="details-save" onclick={() => save()}>
        {busy ? progress || 'Saving…' : edit ? 'Save changes' : kind === 'nap' && napMode === 'start' ? 'Start nap' : 'Save'}
      </button>
    </footer>
  {/if}
</div>

<style>
  .hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .pv { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: var(--bg); padding: 0; border: 1px solid var(--line); }
  .pv img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .x { position: absolute; top: 2px; right: 2px; width: 28px; height: 28px; border: 0; border-radius: 50%; background: rgb(0 0 0 / 60%); color: #fff; cursor: pointer; }
  .addmore { font-size: 1.5rem; color: var(--muted); cursor: pointer; }
  .warn { margin: 0; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--warn); color: var(--warn); font-weight: 600; }
  .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / 50%); border: 0; z-index: 40; cursor: default; }
  .sheet { position: fixed; left: 50%; transform: translateX(-50%); bottom: 0; width: 100%; max-width: 640px; max-height: 88vh; display: flex; flex-direction: column; background: var(--surface); color: var(--text); border-radius: 20px 20px 0 0; box-shadow: 0 -8px 30px rgb(0 0 0 / 25%); z-index: 41; animation: up 0.18s ease-out; }
  @keyframes up { from { transform: translate(-50%, 24px); opacity: 0; } }
  .hd { padding: 12px 12px 4px 16px; }
  .hd h2 { margin: 0; }
  .body { padding: 8px 16px 16px; overflow-y: auto; }
  .foot { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--surface); }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .tile { min-height: 88px; border-radius: 16px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }
  .tile:hover { border-color: var(--accent); }
  .ico { font-size: 1.75rem; }
  .pill { min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; cursor: pointer; }
  .who-chip { padding-left: 6px; }
  .dotok { color: var(--k-checkin); font-size: 0.7rem; }
  .mini { gap: 4px; padding: 2px 8px 2px 2px; border-radius: 999px; background: var(--bg); border: 1px solid var(--line); font-size: 0.875rem; }
  .diapers { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .amt { padding: 4px 0; }
  .who-line { min-height: 28px; }
</style>
