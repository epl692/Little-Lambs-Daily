import type { ObjectTypeDef } from '@sync/modules';
import { EMOJI } from './enums';

/** One object per (target, user, emoji); toggling off deletes it. Deterministic IDs are added with the UI in phase 6. */
export const reaction: ObjectTypeDef = {
  name: 'reaction',
  label: 'Reaction',
  // The id is deterministic, so tapping the same emoji again after removing it re-creates the same object: that write
  // has to bring it back from the tombstone.
  merge: { editResurrects: true },
  versions: [
    {
      version: 1,
      fields: {
        target: { type: 'ref', to: 'daycare.entry', required: true },
        emoji: { type: 'enum', values: EMOJI, required: true },
        createdBy: { type: 'string', required: true },
      },
    },
  ],
};
