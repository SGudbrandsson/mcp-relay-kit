/**
 * @fileoverview Cloudflare service adapter.
 *
 * Config keys:
 *   - token: Cloudflare API Token (required)
 *   - account_id: Cloudflare account ID (required for Zero Trust and Tunnels)
 *   - zone_id: Cloudflare zone ID (required for DNS)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function cloudflareFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Cloudflare token not configured');

  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

function requireZoneId(config: Record<string, unknown>): string {
  const zoneId = config.zone_id as string | undefined;
  if (!zoneId) throw new Error('Cloudflare zone_id not configured');
  return validatePathSegment(zoneId, 'zone_id');
}

function requireAccountId(config: Record<string, unknown>): string {
  const accountId = config.account_id as string | undefined;
  if (!accountId) throw new Error('Cloudflare account_id not configured');
  return validatePathSegment(accountId, 'account_id');
}

const actions: ServiceAction[] = [
  // --- DNS ---
  {
    name: 'list_dns_records',
    description: 'List DNS records for the configured zone. Supports filtering by type, name, or search text.',
    params: {
      type: { type: 'string', description: 'DNS record type (A, AAAA, CNAME, MX, TXT, etc.)', required: false },
      name: { type: 'string', description: 'DNS record name (e.g., "example.com")', required: false },
      search: { type: 'string', description: 'Search text across name and content', required: false },
    },
    execute: async (params, config) => {
      const zoneId = requireZoneId(config);
      const searchParams = new URLSearchParams();
      if (params.type) searchParams.set('type', params.type as string);
      if (params.name) searchParams.set('name', params.name as string);
      if (params.search) searchParams.set('search', params.search as string);
      const qs = searchParams.toString();
      return cloudflareFetch(`/zones/${zoneId}/dns_records${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_dns_record',
    description: 'Get a specific DNS record by ID',
    params: {
      record_id: { type: 'string', description: 'DNS record ID', required: true },
    },
    execute: async (params, config) => {
      const zoneId = requireZoneId(config);
      return cloudflareFetch(`/zones/${zoneId}/dns_records/${validatePathSegment(params.record_id, 'record_id')}`, config);
    },
  },
  {
    name: 'create_dns_record',
    description: 'Create a new DNS record in the configured zone',
    params: {
      type: { type: 'string', description: 'DNS record type (A, AAAA, CNAME, MX, TXT, etc.)', required: true },
      name: { type: 'string', description: 'DNS record name (e.g., "sub.example.com")', required: true },
      content: { type: 'string', description: 'DNS record content (IP address, hostname, text, etc.)', required: true },
      proxied: { type: 'string', description: 'Whether to proxy through Cloudflare (true/false)', required: false },
      ttl: { type: 'string', description: 'TTL in seconds (1 = automatic)', required: false },
      priority: { type: 'string', description: 'Priority (required for MX records)', required: false },
    },
    execute: async (params, config) => {
      const zoneId = requireZoneId(config);
      const body: Record<string, unknown> = {
        type: params.type,
        name: params.name,
        content: params.content,
      };
      if (params.proxied !== undefined) body.proxied = params.proxied === 'true';
      if (params.ttl) {
        const ttl = parseInt(params.ttl as string, 10);
        if (isNaN(ttl)) throw new Error('ttl must be a number');
        body.ttl = ttl;
      }
      if (params.priority) {
        const priority = parseInt(params.priority as string, 10);
        if (isNaN(priority)) throw new Error('priority must be a number');
        body.priority = priority;
      }
      return cloudflareFetch(`/zones/${zoneId}/dns_records`, config, { method: 'POST', body });
    },
  },
  {
    name: 'update_dns_record',
    description: 'Update an existing DNS record (partial update)',
    params: {
      record_id: { type: 'string', description: 'DNS record ID', required: true },
      type: { type: 'string', description: 'DNS record type', required: false },
      name: { type: 'string', description: 'DNS record name', required: false },
      content: { type: 'string', description: 'DNS record content', required: false },
      proxied: { type: 'string', description: 'Whether to proxy through Cloudflare (true/false)', required: false },
      ttl: { type: 'string', description: 'TTL in seconds', required: false },
    },
    execute: async (params, config) => {
      const zoneId = requireZoneId(config);
      const { record_id, ...rest } = params;
      const body: Record<string, unknown> = {};
      if (rest.type) body.type = rest.type;
      if (rest.name) body.name = rest.name;
      if (rest.content) body.content = rest.content;
      if (rest.proxied !== undefined) body.proxied = rest.proxied === 'true';
      if (rest.ttl) {
        const ttl = parseInt(rest.ttl as string, 10);
        if (isNaN(ttl)) throw new Error('ttl must be a number');
        body.ttl = ttl;
      }
      return cloudflareFetch(`/zones/${zoneId}/dns_records/${validatePathSegment(record_id, 'record_id')}`, config, { method: 'PATCH', body });
    },
  },
  {
    name: 'delete_dns_record',
    description: 'Delete a DNS record',
    params: {
      record_id: { type: 'string', description: 'DNS record ID', required: true },
    },
    execute: async (params, config) => {
      const zoneId = requireZoneId(config);
      return cloudflareFetch(`/zones/${zoneId}/dns_records/${validatePathSegment(params.record_id, 'record_id')}`, config, { method: 'DELETE' });
    },
  },

  // --- Zero Trust Access ---
  {
    name: 'list_access_apps',
    description: 'List all Cloudflare Access applications',
    params: {},
    execute: async (_params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/access/apps`, config);
    },
  },
  {
    name: 'get_access_app',
    description: 'Get details of a Cloudflare Access application',
    params: {
      app_id: { type: 'string', description: 'Access application ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/access/apps/${validatePathSegment(params.app_id, 'app_id')}`, config);
    },
  },
  {
    name: 'create_access_app',
    description: 'Create a new Cloudflare Access application',
    params: {
      name: { type: 'string', description: 'Application name', required: true },
      domain: { type: 'string', description: 'Application domain (e.g., "app.example.com")', required: true },
      type: { type: 'string', description: 'Application type (self_hosted, saas, ssh, vnc, etc.)', required: false },
      session_duration: { type: 'string', description: 'Session duration (e.g., "24h", "720h")', required: false },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      const body: Record<string, unknown> = { name: params.name, domain: params.domain };
      if (params.type) body.type = params.type;
      if (params.session_duration) body.session_duration = params.session_duration;
      return cloudflareFetch(`/accounts/${accountId}/access/apps`, config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_access_app',
    description: 'Delete a Cloudflare Access application',
    params: {
      app_id: { type: 'string', description: 'Access application ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/access/apps/${validatePathSegment(params.app_id, 'app_id')}`, config, { method: 'DELETE' });
    },
  },
  {
    name: 'list_access_policies',
    description: 'List access policies for a Cloudflare Access application',
    params: {
      app_id: { type: 'string', description: 'Access application ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/access/apps/${validatePathSegment(params.app_id, 'app_id')}/policies`, config);
    },
  },
  {
    name: 'create_access_policy',
    description: 'Create an access policy for a Cloudflare Access application',
    params: {
      app_id: { type: 'string', description: 'Access application ID', required: true },
      name: { type: 'string', description: 'Policy name', required: true },
      decision: { type: 'string', description: 'Policy decision (allow, deny, non_identity, bypass)', required: true, enum: ['allow', 'deny', 'non_identity', 'bypass'] },
      include: { type: 'string', description: 'Include rules as JSON array (e.g., [{"email":{"email":"user@example.com"}}])', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      let includeRules: unknown;
      try {
        includeRules = JSON.parse(params.include as string);
      } catch {
        throw new Error('include must be valid JSON');
      }
      const body = { name: params.name, decision: params.decision, include: includeRules };
      return cloudflareFetch(`/accounts/${accountId}/access/apps/${validatePathSegment(params.app_id, 'app_id')}/policies`, config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_access_policy',
    description: 'Delete an access policy from a Cloudflare Access application',
    params: {
      app_id: { type: 'string', description: 'Access application ID', required: true },
      policy_id: { type: 'string', description: 'Policy ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(
        `/accounts/${accountId}/access/apps/${validatePathSegment(params.app_id, 'app_id')}/policies/${validatePathSegment(params.policy_id, 'policy_id')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },

  // --- Tunnels ---
  {
    name: 'list_tunnels',
    description: 'List Cloudflare Tunnels, optionally filtered by name',
    params: {
      name: { type: 'string', description: 'Filter by tunnel name', required: false },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      const searchParams = new URLSearchParams();
      if (params.name) searchParams.set('name', params.name as string);
      const qs = searchParams.toString();
      return cloudflareFetch(`/accounts/${accountId}/cfd_tunnel${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_tunnel',
    description: 'Get details of a Cloudflare Tunnel',
    params: {
      tunnel_id: { type: 'string', description: 'Tunnel ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/cfd_tunnel/${validatePathSegment(params.tunnel_id, 'tunnel_id')}`, config);
    },
  },
  {
    name: 'create_tunnel',
    description: 'Create a new Cloudflare Tunnel',
    params: {
      name: { type: 'string', description: 'Tunnel name', required: true },
      tunnel_secret: { type: 'string', description: 'Base64-encoded tunnel secret', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/cfd_tunnel`, config, {
        method: 'POST',
        body: { name: params.name, tunnel_secret: params.tunnel_secret },
      });
    },
  },
  {
    name: 'delete_tunnel',
    description: 'Delete a Cloudflare Tunnel',
    params: {
      tunnel_id: { type: 'string', description: 'Tunnel ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/cfd_tunnel/${validatePathSegment(params.tunnel_id, 'tunnel_id')}`, config, { method: 'DELETE' });
    },
  },
  {
    name: 'get_tunnel_config',
    description: 'Get the configuration for a Cloudflare Tunnel',
    params: {
      tunnel_id: { type: 'string', description: 'Tunnel ID', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      return cloudflareFetch(`/accounts/${accountId}/cfd_tunnel/${validatePathSegment(params.tunnel_id, 'tunnel_id')}/configurations`, config);
    },
  },
  {
    name: 'update_tunnel_config',
    description: 'Update the configuration for a Cloudflare Tunnel (ingress rules, etc.)',
    params: {
      tunnel_id: { type: 'string', description: 'Tunnel ID', required: true },
      config: { type: 'string', description: 'Tunnel configuration as JSON string (must include ingress rules)', required: true },
    },
    execute: async (params, config) => {
      const accountId = requireAccountId(config);
      let tunnelConfig: unknown;
      try {
        tunnelConfig = JSON.parse(params.config as string);
      } catch {
        throw new Error('config must be valid JSON');
      }
      return cloudflareFetch(
        `/accounts/${accountId}/cfd_tunnel/${validatePathSegment(params.tunnel_id, 'tunnel_id')}/configurations`,
        config,
        { method: 'PUT', body: { config: tunnelConfig } }
      );
    },
  },
];

export const cloudflareAdapter: ServiceAdapter = {
  name: 'cloudflare',
  description: 'Cloudflare — manage DNS records, Zero Trust Access apps/policies, and Tunnels',
  actions,
};
