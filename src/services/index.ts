/**
 * @fileoverview Service adapter registry.
 * Add new adapters here — they're auto-registered when their name appears in config.
 */

import type { ServiceAdapter } from '../types.js';
import { asanaAdapter } from './asana.js';
import { sentryAdapter } from './sentry.js';
import { linearAdapter } from './linear.js';
import { posthogAdapter } from './posthog.js';
import { cloudflareAdapter } from './cloudflare.js';
import { coolifyAdapter } from './coolify.js';
import { vercelAdapter } from './vercel.js';
import { supabaseAdapter } from './supabase.js';

/** All available adapters, keyed by service name */
export const availableAdapters: Record<string, ServiceAdapter> = {
  asana: asanaAdapter,
  sentry: sentryAdapter,
  linear: linearAdapter,
  posthog: posthogAdapter,
  cloudflare: cloudflareAdapter,
  coolify: coolifyAdapter,
  vercel: vercelAdapter,
  supabase: supabaseAdapter,
};
