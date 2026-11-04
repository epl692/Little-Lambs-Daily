/** Shared value sets (SPEC 5). Plain data: this file is part of module code and imports nothing. */

export const ENTRY_KINDS = ['checkin', 'checkout', 'nap', 'bottle', 'snack', 'meal', 'diaper', 'photo', 'providerNote', 'familyNote', 'home'] as const;
/** Kinds a parent (Editor) may create. Everything else is provider-only. */
export const PARENT_KINDS = ['checkin', 'checkout', 'home', 'familyNote'] as const;

export const MEAL_PERIODS = ['breakfast', 'amSnack', 'lunch', 'pmSnack', 'dinner', 'other'] as const;
export const AMOUNTS = ['all', 'most', 'some', 'none'] as const;
export const BOTTLE_CONTENTS = ['breastMilk', 'formula', 'milk', 'water', 'other'] as const;
export const DIAPERS = ['wet', 'soiled', 'both', 'dry'] as const;
export const DIAPER_NOTES = ['rash', 'creamApplied', 'potty'] as const;
export const HOME_KINDS = ['slept', 'ate', 'bottle', 'diaper', 'medicine', 'mood', 'other'] as const;
export const MOODS = ['great', 'ok', 'fussy', 'sick'] as const;
export const ROLES = ['provider', 'parent'] as const;
export const EMOJI = ['thumbsUp', 'love', 'laugh', 'wow', 'sad', 'mad', 'poop', 'party'] as const;
export const COLORS = ['rose', 'orange', 'amber', 'lime', 'teal', 'sky', 'indigo', 'violet'] as const;

export const MB = 1024 * 1024;
