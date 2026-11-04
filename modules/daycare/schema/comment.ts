import type { ObjectTypeDef } from '@sync/modules';
import { ROLES } from './enums';

/** Thread replies are separate objects so concurrent replies never collide under field-level LWW. */
export const comment: ObjectTypeDef = {
  name: 'comment',
  label: 'Reply',
  versions: [
    {
      version: 1,
      fields: {
        target: { type: 'ref', to: 'daycare.entry', required: true },
        text: { type: 'string', required: true, maxLength: 2000, check: (v) => (v.trim() ? undefined : 'must not be blank') },
        createdBy: { type: 'string', required: true },
        createdByName: { type: 'string', required: true, maxLength: 80 },
        createdByRole: { type: 'enum', values: ROLES, required: true },
        editedAt: { type: 'timestamp' },
      },
    },
  ],
};
