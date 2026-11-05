import type { ObjectTypeDef } from '@sync/modules';
import { ROLES } from './enums';

/**
 * A person's chosen display name, one per person per Space (id `profile:<space>:<user>`). The framework fixes a member's name when they
 * join and has no rename call, so the app keeps its own: a person writes their own profile (a provider may write anyone's); the UI
 * prefers it over the name the framework holds. Past entries keep the name they were written with, but are shown with the new one.
 */
export const profile: ObjectTypeDef = {
  name: 'profile',
  label: 'Display name',
  versions: [
    {
      version: 1,
      fields: {
        user: { type: 'string', required: true, maxLength: 80 },
        displayName: { type: 'string', required: true, maxLength: 80, check: (v) => (v.trim() ? undefined : 'must not be blank') },
        createdBy: { type: 'string', required: true },
        createdByRole: { type: 'enum', values: ROLES, required: true },
      },
    },
  ],
};
