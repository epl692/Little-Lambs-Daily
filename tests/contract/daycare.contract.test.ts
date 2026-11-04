import { moduleContract } from '@sync/testkit';
import daycare from '../../modules/daycare/index';

// Phase 1: the module has no types yet. Fixtures per kind are added in phase 2.
moduleContract({ name: 'daycare', definition: daycare, fixtures: {} });
