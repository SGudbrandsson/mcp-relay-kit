/**
 * @fileoverview Config loader — reads GATEWAY_CONFIG JSON, resolves env vars.
 */

import { readFileSync } from 'node:fs';
import type { GatewayConfig } from './types.js';

/**
 * Load gateway config from the path in GATEWAY_CONFIG env var.
 * Supports ${ENV_VAR} interpolation in string values.
 */
export function loadConfig(): GatewayConfig {
  const configPath = process.env.GATEWAY_CONFIG;
  if (!configPath) {
    return { services: {} };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const interpolated = raw.replace(/\$\{(\w+)\}/g, (_, varName) => {
      return process.env[varName] ?? '';
    });
    return JSON.parse(interpolated) as GatewayConfig;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[codemode-gateway] Failed to load config from ${configPath}: ${msg}`);
    return { services: {} };
  }
}
