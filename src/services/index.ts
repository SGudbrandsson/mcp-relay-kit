/**
 * @fileoverview Service adapter registry.
 * Add new adapters here — they're auto-registered when their name appears in config.
 */

import type { ServiceAdapter } from '../types.js';
import { asanaAdapter } from './asana.js';

/** All available adapters, keyed by service name */
export const availableAdapters: Record<string, ServiceAdapter> = {
  asana: asanaAdapter,
  // slack: slackAdapter,      ← add here when ready
  // sentry: sentryAdapter,
  // posthog: posthogAdapter,
};
