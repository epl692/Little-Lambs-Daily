// Infrastructure module: supplies the invite/QR identity provider. Unlike app modules it may import framework
// packages, because creating the provider is its whole job.
import { createInviteProvider } from '@sync/identity-invite';
import type { ModuleDefinition } from '@sync/modules';

export default {
  id: 'identity',
  version: '1.0.0',
  provides: { identityProviders: [{ id: 'invite', create: () => createInviteProvider() }] },
} satisfies ModuleDefinition;
