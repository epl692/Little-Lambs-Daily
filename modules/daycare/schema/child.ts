import type { ObjectTypeDef } from '@sync/modules';
import { COLORS, MB } from './enums';

export const child: ObjectTypeDef = {
  name: 'child',
  label: 'Child',
  versions: [
    {
      version: 1,
      fields: {
        firstName: { type: 'string', required: true, maxLength: 40, check: (v) => (v.trim() ? undefined : 'must not be blank') },
        lastName: { type: 'string', maxLength: 40 },
        nickname: { type: 'string', maxLength: 40 },
        birthDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        avatar: { type: 'blob', accept: ['image/*'], maxBytes: 5 * MB },
        color: { type: 'enum', values: COLORS },
        allergies: { type: 'string', maxLength: 500 },
        careNotes: { type: 'string', maxLength: 1000 },
        familyNotes: { type: 'string', maxLength: 1000 },
        active: { type: 'boolean', default: true },
      },
    },
  ],
};
