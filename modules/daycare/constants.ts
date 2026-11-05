/** Editable in Provider Settings later (stored in the Staff Space); these are the first-launch defaults. */
export const APP_NAME = 'Little Lambs Daily';
export const DAYCARE_NAME = "Bri's Little Lambs";
export const APP_VERSION = '0.10.0';
export const ACCENT = '#14B8A6';

/**
 * The relay every device syncs through. Baked into the build because the page's Content Security Policy
 * (`connect-src`) must list it. Edit this before building for production (see README), e.g. 'wss://relay.example.com'.
 */
export const RELAY_URL = 'ws://localhost:8787';
