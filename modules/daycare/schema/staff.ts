import type { ObjectTypeDef } from '@sync/modules';

/** Staff Space types (SPEC 5.5). Providers only: parents are never members of the Staff Space. */
export const settings: ObjectTypeDef = {
  name: 'settings',
  label: 'Daycare settings',
  versions: [
    {
      version: 1,
      fields: {
        daycareName: { type: 'string', maxLength: 80 },
        appName: { type: 'string', maxLength: 40 },
        requireApproval: { type: 'boolean', default: true },
        defaultInviteHours: { type: 'integer', min: 1, max: 720, default: 24 },
        /** "Since last bottle/diaper" chip turns amber after this many minutes (SPEC 6.3, default 3h). */
        sinceThresholdMinutes: { type: 'integer', min: 15, max: 1440, default: 180 },
      },
    },
  ],
};

export const familyIndex: ObjectTypeDef = {
  name: 'familyIndex',
  label: 'Family',
  versions: [
    {
      version: 1,
      fields: {
        spaceId: { type: 'string', required: true },
        familyName: { type: 'string', required: true, maxLength: 80 },
        archived: { type: 'boolean', default: false },
      },
    },
  ],
};

/** Handoff of a single-use family-Space invite to a newly added provider's device (SPEC 4.4). */
export const staffInvite: ObjectTypeDef = {
  name: 'staffInvite',
  label: 'Staff invite handoff',
  versions: [
    {
      version: 1,
      fields: {
        forUser: { type: 'string', required: true },
        spaceId: { type: 'string', required: true },
        artifact: { type: 'string', required: true },
        /** When the invite inside `artifact` stops working, so a provider device knows to issue a fresh one. */
        expiresAt: { type: 'timestamp' },
        consumed: { type: 'boolean', default: false },
      },
    },
  ],
};
