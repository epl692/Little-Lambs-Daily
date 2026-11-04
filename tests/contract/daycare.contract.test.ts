import { moduleContract } from '@sync/testkit';
import daycare from '../../modules/daycare/index';

const kid = 'child-1';
const by = { createdBy: 'user-1', createdByName: 'Miss Bri', createdByRole: 'provider' };
const at = 1_700_000_000_000;

// One valid fixture per entry kind (photo is covered in schemas.test.ts: it needs a blob reference).
moduleContract({
  name: 'daycare',
  definition: daycare,
  fixtures: {
    'daycare.child': [
      { firstName: 'Ada' },
      { firstName: 'Ben', lastName: 'Lee', nickname: 'Benny', birthDate: '2025-03-09', color: 'sky', allergies: 'peanuts', careNotes: 'pacifier at nap', familyNotes: 'early pickup Fri', active: true },
    ],
    'daycare.entry': [
      { child: kid, kind: 'checkin', at, by: 'Mom', ...by },
      { child: kid, kind: 'checkout', at, by: 'Dad', ...by },
      { child: kid, kind: 'nap', at, ...by },
      { child: kid, kind: 'nap', at, endAt: at + 5_400_000, batchId: 'b1', ...by },
      { child: kid, kind: 'bottle', at, bottleContents: 'formula', ozOffered: 4, ozFinished: 3.5, ...by },
      { child: kid, kind: 'snack', at, mealPeriod: 'amSnack', served: 'Apple slices', amount: 'most', ...by },
      { child: kid, kind: 'meal', at, mealPeriod: 'lunch', served: 'Mac & cheese, peas', amount: 'all', ...by },
      { child: kid, kind: 'diaper', at, diaper: 'wet', diaperNote: ['creamApplied'], ...by },
      { child: kid, kind: 'providerNote', at, text: 'Great morning!', ...by },
      { child: kid, kind: 'familyNote', at, text: 'Teething today', ...by, createdByRole: 'parent' },
      { child: kid, kind: 'home', at, homeKind: 'slept', mood: 'ok', text: 'Slept 10 hours', ...by, createdByRole: 'parent' },
    ],
    'daycare.comment': [{ target: 'entry-1', text: 'Thank you!', at: 1_700_000_000_000, createdBy: 'user-2', createdByName: 'Mom', createdByRole: 'parent' }],
    'daycare.reaction': [{ target: 'entry-1', emoji: 'love', createdBy: 'user-2' }],
    'daycare.settings': [{ daycareName: "Bri's Little Lambs", appName: 'Little Lambs Daily', requireApproval: true, defaultInviteHours: 24, sinceThresholdMinutes: 180 }],
    'daycare.familyIndex': [{ spaceId: 'space-1', familyName: 'Lee' }],
    'daycare.staffInvite': [{ forUser: 'user-3', spaceId: 'space-1', artifact: 'https://example.test/#secret' }],
  },
});
