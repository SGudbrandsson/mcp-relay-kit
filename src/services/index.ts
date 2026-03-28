/**
 * @fileoverview Service adapter registry.
 * Add new adapters here — they're auto-registered when their name appears in config.
 */

import type { ServiceAdapter } from '../types.js';
import { asanaAdapter } from './asana.js';
import { sentryAdapter } from './sentry.js';
import { linearAdapter } from './linear.js';
import { posthogAdapter } from './posthog.js';

/** All available adapters, keyed by service name */
export const availableAdapters: Record<string, ServiceAdapter> = {
  asana: asanaAdapter,
  sentry: sentryAdapter,
  linear: linearAdapter,
  posthog: posthogAdapter,
};
