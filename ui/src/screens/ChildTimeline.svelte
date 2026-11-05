<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { age } from '../lib/time';
  import Avatar from '../components/Avatar.svelte';
  import AddFab from '../components/AddFab.svelte';
  import StatusCard from '../components/StatusCard.svelte';
  import Timeline from '../components/Timeline.svelte';

  // A provider's view of one child's day.
  let { ctx, child }: { ctx: App; child: string } = $props();
  const kid = $derived(ctx.app.children.find((c) => c.id === child));
</script>

<main class="page stack">
  <header class="row">
    <button type="button" class="btn ghost" aria-label="Back" onclick={() => ctx.back()}>← Back</button>
    {#if kid}
      <Avatar id={kid.id} name={kid.name} color={kid.color} />
      <div class="grow">
        <h1 data-testid="timeline-title">{kid.name}</h1>
        {#if age(kid.birthDate, ctx.app.now)}<p class="muted small">{age(kid.birthDate, ctx.app.now)}</p>{/if}
      </div>
    {/if}
    {#if kid}<button type="button" class="btn ghost" data-testid="open-profile" onclick={() => ctx.go({ name: 'profile', child })}>Profile</button>{/if}
  </header>
  {#if kid?.allergies}<p class="card err" role="note" data-testid="allergy-banner">⚠ Allergies: {kid.allergies}</p>{/if}
  <StatusCard {ctx} childId={child} />
  <Timeline {ctx} childId={child} />
</main>
<AddFab {ctx} preset={[child]} />
