/**
 * @fileoverview Core types for the MCP gateway.
 */

/** Schema for a single action parameter */
export interface ParamSchema {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: string | number | boolean;
}

/** A single action exposed by a service adapter */
export interface ServiceAction {
  name: string;
  description: string;
  params: Record<string, ParamSchema>;
  execute: (params: Record<string, unknown>, config: Record<string, unknown>) => Promise<unknown>;
}

/** A service adapter (e.g., Asana, Slack, Sentry) */
export interface ServiceAdapter {
  name: string;
  description: string;
  actions: ServiceAction[];
}

/** Per-project configuration for a single service */
export interface ServiceConfig {
  [key: string]: unknown;
}

/** Configuration for a proxied MCP server */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Top-level gateway configuration loaded from GATEWAY_CONFIG */
export interface GatewayConfig {
  services: Record<string, ServiceConfig>;
  mcpServers?: Record<string, McpServerConfig>;
}
