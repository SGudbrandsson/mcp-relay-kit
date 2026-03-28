# Cloudflare, Coolify, Vercel, Supabase Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new service adapters (Cloudflare, Coolify, Vercel, Supabase) to the MCP gateway with full test coverage, register them, update the example config, and create two documentation guides.

**Architecture:** Each adapter is a single TypeScript file exporting a `ServiceAdapter` with a fetch helper and inline `ServiceAction[]`. Adapters are independent — no shared code between them. Each has its own test file mocking `fetch` with `vi.stubGlobal`. All four get registered in `src/services/index.ts`.

**Tech Stack:** TypeScript (ES2022, Node16 modules), Vitest for testing, native `fetch` for HTTP.

**Spec:** `docs/superpowers/specs/2026-03-28-cloudflare-coolify-vercel-supabase-design.md`

**Parallelism:** Tasks 1–4 (the four adapters) are fully independent and can be executed in parallel. Task 5 (registration + config) depends on all four. Task 6 (docs) is independent.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/services/cloudflare.ts` | **Create.** Cloudflare adapter — 18 actions (DNS, Zero Trust, Tunnels) |
| `src/services/coolify.ts` | **Create.** Coolify adapter — 23 actions (apps, servers, databases, projects, environments) |
| `src/services/vercel.ts` | **Create.** Vercel adapter — 18 actions (deployments, projects, env vars, domains) |
| `src/services/supabase.ts` | **Create.** Supabase adapter — 20 actions (projects, SQL, auth, storage, edge functions) |
| `tests/cloudflare.test.ts` | **Create.** Tests for Cloudflare adapter |
| `tests/coolify.test.ts` | **Create.** Tests for Coolify adapter |
| `tests/vercel.test.ts` | **Create.** Tests for Vercel adapter |
| `tests/supabase.test.ts` | **Create.** Tests for Supabase adapter |
| `src/services/index.ts` | **Modify.** Add 4 imports and registrations |
| `examples/keeps.json` | **Modify.** Add config examples for 4 new services |
| `docs/adding-a-connector.md` | **Create.** Connector development guide |
| `docs/setup-guide.md` | **Create.** Gateway setup guide for Claude/Gemini/Codex/IDEs |

---

## Task 1: Cloudflare Adapter

**Files:**
- Create: `src/services/cloudflare.ts`
- Create: `tests/cloudflare.test.ts`

### Context for implementer

This adapter talks to the Cloudflare API v4 (`https://api.cloudflare.com/client/v4`). Cloudflare wraps all responses in `{ success: boolean, result: T, errors: [] }` — the fetch helper must extract `.result`.

The adapter has 18 actions across three groups:
- **DNS** (5 actions) — zone-scoped, requires `zone_id` in config
- **Zero Trust Access** (7 actions) — account-scoped, requires `account_id` in config
- **Tunnels** (6 actions) — account-scoped, requires `account_id` in config

**Imports and types** — the file uses the same pattern as all other adapters:
```typescript
import type { ServiceAdapter, ServiceAction } from '../types.js';
```

**Security:** All user-supplied values interpolated into URL paths must go through `validatePathSegment()` which rejects `/`, `?`, `#`, `..` and applies `encodeURIComponent`. This is the same helper used in sentry.ts and posthog.ts — copy it into this file (each adapter has its own copy since there's no shared utils file).

---

- [ ] **Step 1: Write tests for the Cloudflare adapter**

Create `tests/cloudflare.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cloudflareAdapter } from '../src/services/cloudflare.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockCloudflareResponse(result: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, result, errors: [] }),
    text: async () => JSON.stringify({ success: true, result, errors: [] }),
  };
}

function mockCloudflareError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ success: false, errors: [{ message }] }),
  };
}

const config = {
  token: 'test-token',
  account_id: 'acct-123',
  zone_id: 'zone-456',
};

describe('Cloudflare adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = cloudflareAdapter.actions.map((a) => a.name);
    // DNS
    expect(names).toContain('list_dns_records');
    expect(names).toContain('get_dns_record');
    expect(names).toContain('create_dns_record');
    expect(names).toContain('update_dns_record');
    expect(names).toContain('delete_dns_record');
    // Zero Trust
    expect(names).toContain('list_access_apps');
    expect(names).toContain('get_access_app');
    expect(names).toContain('create_access_app');
    expect(names).toContain('delete_access_app');
    expect(names).toContain('list_access_policies');
    expect(names).toContain('create_access_policy');
    expect(names).toContain('delete_access_policy');
    // Tunnels
    expect(names).toContain('list_tunnels');
    expect(names).toContain('get_tunnel');
    expect(names).toContain('create_tunnel');
    expect(names).toContain('delete_tunnel');
    expect(names).toContain('get_tunnel_config');
    expect(names).toContain('update_tunnel_config');
    expect(names.length).toBe(18);
  });

  // --- DNS ---

  describe('list_dns_records', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_dns_records')!;

    it('lists DNS records for a zone', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([{ id: 'rec-1', type: 'A' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'rec-1', type: 'A' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/zones/zone-456/dns_records');
    });

    it('passes type and name filters', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({ type: 'A', name: 'example.com' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('type=A');
      expect(url).toContain('name=example.com');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({}, { zone_id: 'z' })).rejects.toThrow('Cloudflare token not configured');
    });

    it('throws on missing zone_id', async () => {
      await expect(action.execute({}, { token: 'test-token' })).rejects.toThrow('Cloudflare zone_id not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareError(403, 'Forbidden'));
      await expect(action.execute({}, config)).rejects.toThrow('Cloudflare API 403');
    });
  });

  describe('get_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'get_dns_record')!;

    it('fetches a DNS record by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-1', type: 'A', content: '1.2.3.4' }));
      const result = await action.execute({ record_id: 'rec-1' }, config);
      expect(result).toEqual({ id: 'rec-1', type: 'A', content: '1.2.3.4' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/zones/zone-456/dns_records/rec-1');
    });

    it('rejects record_id containing ../', async () => {
      await expect(action.execute({ record_id: '../secret' }, config)).rejects.toThrow('Invalid record_id');
    });
  });

  describe('create_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_dns_record')!;

    it('creates a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-new' }));
      await action.execute({ type: 'A', name: 'test.example.com', content: '1.2.3.4', proxied: 'true' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-456/dns_records'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"type":"A"'),
        })
      );
    });
  });

  describe('update_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'update_dns_record')!;

    it('updates a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-1' }));
      await action.execute({ record_id: 'rec-1', content: '5.6.7.8' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-456/dns_records/rec-1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('delete_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_dns_record')!;

    it('deletes a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-1' }));
      await action.execute({ record_id: 'rec-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-456/dns_records/rec-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // --- Zero Trust ---

  describe('list_access_apps', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_access_apps')!;

    it('lists access applications', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([{ id: 'app-1' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'app-1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/access/apps');
    });

    it('throws on missing account_id', async () => {
      await expect(action.execute({}, { token: 'test-token' })).rejects.toThrow('Cloudflare account_id not configured');
    });
  });

  describe('get_access_app', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'get_access_app')!;

    it('fetches an access app by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'app-1', name: 'My App' }));
      await action.execute({ app_id: 'app-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/access/apps/app-1');
    });

    it('rejects app_id containing path separators', async () => {
      await expect(action.execute({ app_id: 'app/bad' }, config)).rejects.toThrow('Invalid app_id');
    });
  });

  describe('create_access_app', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_access_app')!;

    it('creates an access application', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'app-new' }));
      await action.execute({ name: 'Test App', domain: 'app.example.com', type: 'self_hosted' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/access/apps'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Test App"'),
        })
      );
    });
  });

  describe('delete_access_app', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_access_app')!;

    it('deletes an access application', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'app-1' }));
      await action.execute({ app_id: 'app-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/access/apps/app-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('create_access_policy', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_access_policy')!;

    it('creates an access policy with JSON include', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'pol-new' }));
      const include = JSON.stringify([{ email: { email: 'user@example.com' } }]);
      await action.execute({ app_id: 'app-1', name: 'Allow user', decision: 'allow', include }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/accounts/acct-123/access/apps/app-1/policies');
      const body = JSON.parse(opts.body as string);
      expect(body.include).toEqual([{ email: { email: 'user@example.com' } }]);
    });
  });

  describe('delete_access_policy', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_access_policy')!;

    it('deletes an access policy', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'pol-1' }));
      await action.execute({ app_id: 'app-1', policy_id: 'pol-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/access/apps/app-1/policies/pol-1');
    });

    it('rejects policy_id with path traversal', async () => {
      await expect(action.execute({ app_id: 'app-1', policy_id: '../bad' }, config)).rejects.toThrow('Invalid policy_id');
    });
  });

  // --- Tunnels ---

  describe('list_tunnels', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_tunnels')!;

    it('lists tunnels', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([{ id: 'tun-1' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'tun-1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/cfd_tunnel');
    });

    it('passes name filter', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({ name: 'my-tunnel' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('name=my-tunnel');
    });
  });

  describe('get_tunnel', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'get_tunnel')!;

    it('fetches a tunnel by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'tun-1' }));
      await action.execute({ tunnel_id: 'tun-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/cfd_tunnel/tun-1');
    });
  });

  describe('create_tunnel', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_tunnel')!;

    it('creates a tunnel', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'tun-new' }));
      await action.execute({ name: 'my-tunnel', tunnel_secret: 'base64secret' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/cfd_tunnel'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"my-tunnel"'),
        })
      );
    });
  });

  describe('delete_tunnel', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_tunnel')!;

    it('deletes a tunnel', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'tun-1' }));
      await action.execute({ tunnel_id: 'tun-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/cfd_tunnel/tun-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('update_tunnel_config', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'update_tunnel_config')!;

    it('updates tunnel config with ingress rules', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ tunnel_id: 'tun-1' }));
      const ingressConfig = JSON.stringify({ ingress: [{ hostname: 'app.example.com', service: 'http://localhost:3000' }] });
      await action.execute({ tunnel_id: 'tun-1', config: ingressConfig }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/accounts/acct-123/cfd_tunnel/tun-1/configurations');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body as string);
      expect(body.config.ingress).toBeDefined();
    });
  });

  describe('auth headers', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_dns_records')!;

    it('sends Bearer token', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({}, config);
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe('Bearer test-token');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cloudflare.test.ts`
Expected: FAIL — `cloudflare.ts` does not exist yet.

- [ ] **Step 3: Implement the Cloudflare adapter**

Create `src/services/cloudflare.ts`:

```typescript
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

  const res = await fetch(`${DEFAULT_BASE_URL}${path}`, {
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
  return zoneId;
}

function requireAccountId(config: Record<string, unknown>): string {
  const accountId = config.account_id as string | undefined;
  if (!accountId) throw new Error('Cloudflare account_id not configured');
  return accountId;
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
      if (params.ttl) body.ttl = parseInt(params.ttl as string, 10);
      if (params.priority) body.priority = parseInt(params.priority as string, 10);
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
      if (rest.ttl) body.ttl = parseInt(rest.ttl as string, 10);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cloudflare.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/cloudflare.ts tests/cloudflare.test.ts
git commit -m "feat: add Cloudflare adapter with DNS, Zero Trust, and Tunnel management"
```

---

## Task 2: Coolify Adapter

**Files:**
- Create: `src/services/coolify.ts`
- Create: `tests/coolify.test.ts`

### Context for implementer

This adapter talks to the Coolify API v1. Coolify is self-hosted, so `baseUrl` is **required** (no default). The API prefix is `/api/v1`. Bearer token auth.

The adapter has 23 actions across five groups:
- **Applications** (6 actions) — deploy, restart, stop, logs
- **Servers** (4 actions) — list, get, validate, resources
- **Databases** (5 actions) — CRUD + start/stop
- **Projects** (4 actions) — CRUD
- **Environments** (4 actions) — CRUD within a project

Note: Several Coolify "actions" use GET for side effects (deploy, restart, stop, start). This is how the Coolify API works — don't change it to POST.

---

- [ ] **Step 1: Write tests for the Coolify adapter**

Create `tests/coolify.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coolifyAdapter } from '../src/services/coolify.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockCoolifyResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockCoolifyError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ message }),
  };
}

const config = { token: 'test-token', baseUrl: 'http://coolify.local:8000' };

describe('Coolify adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = coolifyAdapter.actions.map((a) => a.name);
    expect(names).toContain('list_applications');
    expect(names).toContain('get_application');
    expect(names).toContain('deploy_application');
    expect(names).toContain('restart_application');
    expect(names).toContain('stop_application');
    expect(names).toContain('get_application_logs');
    expect(names).toContain('list_servers');
    expect(names).toContain('get_server');
    expect(names).toContain('validate_server');
    expect(names).toContain('get_server_resources');
    expect(names).toContain('list_databases');
    expect(names).toContain('get_database');
    expect(names).toContain('create_database');
    expect(names).toContain('start_database');
    expect(names).toContain('stop_database');
    expect(names).toContain('list_projects');
    expect(names).toContain('get_project');
    expect(names).toContain('create_project');
    expect(names).toContain('delete_project');
    expect(names).toContain('list_environments');
    expect(names).toContain('get_environment');
    expect(names).toContain('create_environment');
    expect(names).toContain('delete_environment');
    expect(names.length).toBe(23);
  });

  describe('list_applications', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'list_applications')!;

    it('lists applications', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse([{ uuid: 'app-1' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ uuid: 'app-1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('http://coolify.local:8000/api/v1/applications');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({}, { baseUrl: 'http://x' })).rejects.toThrow('Coolify token not configured');
    });

    it('throws on missing baseUrl', async () => {
      await expect(action.execute({}, { token: 'test-token' })).rejects.toThrow('Coolify baseUrl not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyError(500, 'Server Error'));
      await expect(action.execute({}, config)).rejects.toThrow('Coolify API 500');
    });
  });

  describe('deploy_application', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'deploy_application')!;

    it('deploys an application by uuid', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ message: 'Deployment started' }));
      await action.execute({ uuid: 'app-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/deploy?uuid=app-1');
    });

    it('passes force parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ message: 'ok' }));
      await action.execute({ uuid: 'app-1', force: 'true' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('force=true');
    });
  });

  describe('get_application_logs', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'get_application_logs')!;

    it('fetches application logs', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ logs: ['line1', 'line2'] }));
      await action.execute({ uuid: 'app-1', lines: '50' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/applications/app-1/logs');
      expect(url).toContain('lines=50');
    });

    it('rejects uuid with path traversal', async () => {
      await expect(action.execute({ uuid: '../secret' }, config)).rejects.toThrow('Invalid uuid');
    });
  });

  describe('create_database', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'create_database')!;

    it('creates a database', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ uuid: 'db-new' }));
      await action.execute({
        type: 'postgresql',
        server_uuid: 'srv-1',
        project_uuid: 'proj-1',
        environment_name: 'production',
      }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/databases/postgresql');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.server_uuid).toBe('srv-1');
    });

    it('validates database type enum', async () => {
      await expect(action.execute({ type: 'invalid_db', server_uuid: 's', project_uuid: 'p', environment_name: 'e' }, config)).rejects.toThrow('Invalid database type');
    });
  });

  describe('create_project', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'create_project')!;

    it('creates a project', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ uuid: 'proj-new' }));
      await action.execute({ name: 'My Project', description: 'A test project' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/projects');
      expect(opts.method).toBe('POST');
    });
  });

  describe('delete_project', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'delete_project')!;

    it('deletes a project', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ message: 'deleted' }));
      await action.execute({ uuid: 'proj-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/projects/proj-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('list_environments', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'list_environments')!;

    it('lists environments for a project', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse([{ name: 'production' }]));
      await action.execute({ project_uuid: 'proj-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/projects/proj-1/environments');
    });
  });

  describe('create_environment', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'create_environment')!;

    it('creates an environment', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ name: 'staging' }));
      await action.execute({ project_uuid: 'proj-1', name: 'staging' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/v1/projects/proj-1/environments');
      expect(opts.method).toBe('POST');
    });
  });

  describe('delete_environment', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'delete_environment')!;

    it('deletes an environment', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse({ message: 'deleted' }));
      await action.execute({ project_uuid: 'proj-1', environment_name: 'staging' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/projects/proj-1/staging');
    });

    it('rejects environment_name with path traversal', async () => {
      await expect(action.execute({ project_uuid: 'proj-1', environment_name: '../etc' }, config)).rejects.toThrow('Invalid environment_name');
    });
  });

  describe('auth headers', () => {
    const action = coolifyAdapter.actions.find((a) => a.name === 'list_servers')!;

    it('sends Bearer token', async () => {
      mockFetch.mockResolvedValueOnce(mockCoolifyResponse([]));
      await action.execute({}, config);
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe('Bearer test-token');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/coolify.test.ts`
Expected: FAIL — `coolify.ts` does not exist yet.

- [ ] **Step 3: Implement the Coolify adapter**

Create `src/services/coolify.ts`:

```typescript
/**
 * @fileoverview Coolify service adapter.
 *
 * Config keys:
 *   - token: Coolify API Token (required)
 *   - baseUrl: Coolify instance URL (required, e.g., "http://coolify.local:8000")
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const VALID_DB_TYPES = ['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'clickhouse', 'dragonfly', 'keydb'];

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function coolifyFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Coolify token not configured');

  const baseUrl = config.baseUrl as string | undefined;
  if (!baseUrl) throw new Error('Coolify baseUrl not configured');

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coolify API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  // --- Applications ---
  {
    name: 'list_applications',
    description: 'List all Coolify applications',
    params: {
      tag: { type: 'string', description: 'Filter by tag', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.tag) searchParams.set('tag', params.tag as string);
      const qs = searchParams.toString();
      return coolifyFetch(`/applications${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_application',
    description: 'Get details of a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'deploy_application',
    description: 'Deploy a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
      force: { type: 'string', description: 'Force rebuild (true/false)', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      searchParams.set('uuid', params.uuid as string);
      if (params.force) searchParams.set('force', params.force as string);
      return coolifyFetch(`/deploy?${searchParams}`, config);
    },
  },
  {
    name: 'restart_application',
    description: 'Restart a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}/restart`, config);
    },
  },
  {
    name: 'stop_application',
    description: 'Stop a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}/stop`, config);
    },
  },
  {
    name: 'get_application_logs',
    description: 'Get logs for a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
      lines: { type: 'string', description: 'Number of log lines to return', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.lines) searchParams.set('lines', params.lines as string);
      const qs = searchParams.toString();
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}/logs${qs ? `?${qs}` : ''}`, config);
    },
  },

  // --- Servers ---
  {
    name: 'list_servers',
    description: 'List all Coolify servers',
    params: {},
    execute: async (_params, config) => {
      return coolifyFetch('/servers', config);
    },
  },
  {
    name: 'get_server',
    description: 'Get details of a Coolify server',
    params: {
      uuid: { type: 'string', description: 'Server UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/servers/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'validate_server',
    description: 'Validate a Coolify server connection',
    params: {
      uuid: { type: 'string', description: 'Server UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/servers/${validatePathSegment(params.uuid, 'uuid')}/validate`, config);
    },
  },
  {
    name: 'get_server_resources',
    description: 'Get resources deployed on a Coolify server',
    params: {
      uuid: { type: 'string', description: 'Server UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/servers/${validatePathSegment(params.uuid, 'uuid')}/resources`, config);
    },
  },

  // --- Databases ---
  {
    name: 'list_databases',
    description: 'List all Coolify databases',
    params: {},
    execute: async (_params, config) => {
      return coolifyFetch('/databases', config);
    },
  },
  {
    name: 'get_database',
    description: 'Get details of a Coolify database',
    params: {
      uuid: { type: 'string', description: 'Database UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/databases/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'create_database',
    description: 'Create a new database in Coolify',
    params: {
      type: { type: 'string', description: 'Database type', required: true, enum: ['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'clickhouse', 'dragonfly', 'keydb'] },
      server_uuid: { type: 'string', description: 'Server UUID to create the database on', required: true },
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      environment_name: { type: 'string', description: 'Environment name', required: true },
      name: { type: 'string', description: 'Database name', required: false },
      image: { type: 'string', description: 'Docker image to use', required: false },
    },
    execute: async (params, config) => {
      const dbType = params.type as string;
      if (!VALID_DB_TYPES.includes(dbType)) {
        throw new Error(`Invalid database type: ${dbType}. Must be one of: ${VALID_DB_TYPES.join(', ')}`);
      }
      const body: Record<string, unknown> = {
        server_uuid: params.server_uuid,
        project_uuid: params.project_uuid,
        environment_name: params.environment_name,
      };
      if (params.name) body.name = params.name;
      if (params.image) body.image = params.image;
      return coolifyFetch(`/databases/${validatePathSegment(dbType, 'type')}`, config, { method: 'POST', body });
    },
  },
  {
    name: 'start_database',
    description: 'Start a Coolify database',
    params: {
      uuid: { type: 'string', description: 'Database UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/databases/${validatePathSegment(params.uuid, 'uuid')}/start`, config);
    },
  },
  {
    name: 'stop_database',
    description: 'Stop a Coolify database',
    params: {
      uuid: { type: 'string', description: 'Database UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/databases/${validatePathSegment(params.uuid, 'uuid')}/stop`, config);
    },
  },

  // --- Projects ---
  {
    name: 'list_projects',
    description: 'List all Coolify projects',
    params: {},
    execute: async (_params, config) => {
      return coolifyFetch('/projects', config);
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a Coolify project',
    params: {
      uuid: { type: 'string', description: 'Project UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/projects/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'create_project',
    description: 'Create a new Coolify project',
    params: {
      name: { type: 'string', description: 'Project name', required: true },
      description: { type: 'string', description: 'Project description', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { name: params.name };
      if (params.description) body.description = params.description;
      return coolifyFetch('/projects', config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a Coolify project',
    params: {
      uuid: { type: 'string', description: 'Project UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/projects/${validatePathSegment(params.uuid, 'uuid')}`, config, { method: 'DELETE' });
    },
  },

  // --- Environments ---
  {
    name: 'list_environments',
    description: 'List environments for a Coolify project',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/environments`, config);
    },
  },
  {
    name: 'get_environment',
    description: 'Get details of a Coolify environment',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      environment_name: { type: 'string', description: 'Environment name', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(
        `/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/${validatePathSegment(params.environment_name, 'environment_name')}`,
        config
      );
    },
  },
  {
    name: 'create_environment',
    description: 'Create a new environment in a Coolify project',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      name: { type: 'string', description: 'Environment name', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(
        `/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/environments`,
        config,
        { method: 'POST', body: { name: params.name } }
      );
    },
  },
  {
    name: 'delete_environment',
    description: 'Delete an environment from a Coolify project',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      environment_name: { type: 'string', description: 'Environment name', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(
        `/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/${validatePathSegment(params.environment_name, 'environment_name')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },
];

export const coolifyAdapter: ServiceAdapter = {
  name: 'coolify',
  description: 'Coolify — manage applications, servers, databases, projects, and environments',
  actions,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/coolify.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/coolify.ts tests/coolify.test.ts
git commit -m "feat: add Coolify adapter with app, server, database, project, and environment management"
```

---

## Task 3: Vercel Adapter

**Files:**
- Create: `src/services/vercel.ts`
- Create: `tests/vercel.test.ts`

### Context for implementer

This adapter talks to the Vercel REST API (`https://api.vercel.com`). Bearer token auth. The `team_id` config value is optional — when present, it gets appended as `?teamId={team_id}` to every request.

The adapter has 18 actions across four groups:
- **Deployments** (6 actions) — list, get, create, cancel, promote, rollback
- **Projects** (5 actions) — CRUD + update
- **Environment Variables** (4 actions) — CRUD
- **Domains** (3 actions) — list, add, remove

Vercel uses versioned endpoints (e.g., `/v6/deployments`, `/v13/deployments/{id}`). Each action uses the specific API version from the spec.

---

- [ ] **Step 1: Write tests for the Vercel adapter**

Create `tests/vercel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vercelAdapter } from '../src/services/vercel.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockVercelResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockVercelError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ error: { message } }),
  };
}

const config = { token: 'test-token', team_id: 'team-abc' };

describe('Vercel adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = vercelAdapter.actions.map((a) => a.name);
    expect(names).toContain('list_deployments');
    expect(names).toContain('get_deployment');
    expect(names).toContain('create_deployment');
    expect(names).toContain('cancel_deployment');
    expect(names).toContain('promote_deployment');
    expect(names).toContain('rollback_deployment');
    expect(names).toContain('list_projects');
    expect(names).toContain('get_project');
    expect(names).toContain('create_project');
    expect(names).toContain('update_project');
    expect(names).toContain('delete_project');
    expect(names).toContain('list_env_vars');
    expect(names).toContain('create_env_var');
    expect(names).toContain('update_env_var');
    expect(names).toContain('delete_env_var');
    expect(names).toContain('list_domains');
    expect(names).toContain('add_domain');
    expect(names).toContain('remove_domain');
    expect(names.length).toBe(18);
  });

  describe('list_deployments', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'list_deployments')!;

    it('lists deployments with teamId', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ deployments: [{ uid: 'd1' }] }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ deployments: [{ uid: 'd1' }] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v6/deployments');
      expect(url).toContain('teamId=team-abc');
    });

    it('works without team_id', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ deployments: [] }));
      await action.execute({}, { token: 'test-token' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('teamId');
    });

    it('passes filter params', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ deployments: [] }));
      await action.execute({ projectId: 'proj-1', state: 'READY', limit: '5' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('projectId=proj-1');
      expect(url).toContain('state=READY');
      expect(url).toContain('limit=5');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({}, {})).rejects.toThrow('Vercel token not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelError(401, 'Unauthorized'));
      await expect(action.execute({}, config)).rejects.toThrow('Vercel API 401');
    });
  });

  describe('get_deployment', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'get_deployment')!;

    it('fetches a deployment by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ uid: 'd1', state: 'READY' }));
      await action.execute({ deployment_id: 'd1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v13/deployments/d1');
    });

    it('rejects deployment_id with path traversal', async () => {
      await expect(action.execute({ deployment_id: '../bad' }, config)).rejects.toThrow('Invalid deployment_id');
    });
  });

  describe('create_deployment', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'create_deployment')!;

    it('creates a deployment', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ uid: 'd-new' }));
      await action.execute({ name: 'my-app', project: 'proj-1', target: 'production' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v13/deployments');
      expect(opts.method).toBe('POST');
    });
  });

  describe('cancel_deployment', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'cancel_deployment')!;

    it('cancels a deployment', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ uid: 'd1' }));
      await action.execute({ deployment_id: 'd1' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v12/deployments/d1/cancel');
      expect(opts.method).toBe('PATCH');
    });
  });

  describe('promote_deployment', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'promote_deployment')!;

    it('promotes a deployment', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ uid: 'd1' }));
      await action.execute({ project_id: 'proj-1', deployment_id: 'd1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v10/projects/proj-1/promote/d1');
    });
  });

  describe('get_project', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'get_project')!;

    it('fetches a project by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ id: 'proj-1', name: 'my-app' }));
      await action.execute({ project_id: 'proj-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/v9/projects/proj-1');
    });
  });

  describe('create_env_var', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'create_env_var')!;

    it('creates an environment variable', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ key: 'API_KEY' }));
      await action.execute({ project_id: 'proj-1', key: 'API_KEY', value: 'secret', target: 'production' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v10/projects/proj-1/env');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.key).toBe('API_KEY');
      expect(body.target).toBe('production');
    });
  });

  describe('add_domain', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'add_domain')!;

    it('adds a domain to a project', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ name: 'example.com' }));
      await action.execute({ project_id: 'proj-1', name: 'example.com' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v10/projects/proj-1/domains');
      expect(opts.method).toBe('POST');
    });
  });

  describe('remove_domain', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'remove_domain')!;

    it('removes a domain from a project', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({}));
      await action.execute({ project_id: 'proj-1', domain: 'example.com' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v9/projects/proj-1/domains/example.com');
      expect(opts.method).toBe('DELETE');
    });

    it('rejects domain with path traversal', async () => {
      await expect(action.execute({ project_id: 'proj-1', domain: '../bad' }, config)).rejects.toThrow('Invalid domain');
    });
  });

  describe('auth headers', () => {
    const action = vercelAdapter.actions.find((a) => a.name === 'list_projects')!;

    it('sends Bearer token', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ projects: [] }));
      await action.execute({}, config);
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe('Bearer test-token');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/vercel.test.ts`
Expected: FAIL — `vercel.ts` does not exist yet.

- [ ] **Step 3: Implement the Vercel adapter**

Create `src/services/vercel.ts`:

```typescript
/**
 * @fileoverview Vercel service adapter.
 *
 * Config keys:
 *   - token: Vercel API Token (required)
 *   - team_id: Vercel team ID (optional, appended as ?teamId= to requests)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.vercel.com';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function vercelFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown; extraParams?: URLSearchParams } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Vercel token not configured');

  const teamId = config.team_id as string | undefined;
  const url = new URL(`${DEFAULT_BASE_URL}${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  if (options.extraParams) {
    options.extraParams.forEach((value, key) => url.searchParams.set(key, value));
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  // --- Deployments ---
  {
    name: 'list_deployments',
    description: 'List Vercel deployments, optionally filtered by project, state, or target',
    params: {
      projectId: { type: 'string', description: 'Filter by project ID', required: false },
      state: { type: 'string', description: 'Filter by state (BUILDING, READY, ERROR, etc.)', required: false },
      target: { type: 'string', description: 'Filter by target (production, preview)', required: false },
      limit: { type: 'string', description: 'Max results to return', required: false },
    },
    execute: async (params, config) => {
      const extraParams = new URLSearchParams();
      if (params.projectId) extraParams.set('projectId', params.projectId as string);
      if (params.state) extraParams.set('state', params.state as string);
      if (params.target) extraParams.set('target', params.target as string);
      if (params.limit) extraParams.set('limit', params.limit as string);
      return vercelFetch('/v6/deployments', config, { extraParams });
    },
  },
  {
    name: 'get_deployment',
    description: 'Get details of a Vercel deployment',
    params: {
      deployment_id: { type: 'string', description: 'Deployment ID or URL', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v13/deployments/${validatePathSegment(params.deployment_id, 'deployment_id')}`, config);
    },
  },
  {
    name: 'create_deployment',
    description: 'Create a new Vercel deployment',
    params: {
      name: { type: 'string', description: 'Deployment name', required: true },
      project: { type: 'string', description: 'Project ID or name', required: false },
      target: { type: 'string', description: 'Deployment target (production, preview)', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { name: params.name };
      if (params.project) body.project = params.project;
      if (params.target) body.target = params.target;
      return vercelFetch('/v13/deployments', config, { method: 'POST', body });
    },
  },
  {
    name: 'cancel_deployment',
    description: 'Cancel a Vercel deployment',
    params: {
      deployment_id: { type: 'string', description: 'Deployment ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v12/deployments/${validatePathSegment(params.deployment_id, 'deployment_id')}/cancel`, config, { method: 'PATCH' });
    },
  },
  {
    name: 'promote_deployment',
    description: 'Promote a deployment to production',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      deployment_id: { type: 'string', description: 'Deployment ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/promote/${validatePathSegment(params.deployment_id, 'deployment_id')}`,
        config,
        { method: 'POST' }
      );
    },
  },
  {
    name: 'rollback_deployment',
    description: 'Rollback to a previous deployment',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      deployment_id: { type: 'string', description: 'Deployment ID to rollback to', required: true },
      description: { type: 'string', description: 'Reason for rollback', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.description) body.description = params.description;
      return vercelFetch(
        `/v1/projects/${validatePathSegment(params.project_id, 'project_id')}/rollback/${validatePathSegment(params.deployment_id, 'deployment_id')}`,
        config,
        { method: 'POST', body }
      );
    },
  },

  // --- Projects ---
  {
    name: 'list_projects',
    description: 'List Vercel projects',
    params: {
      search: { type: 'string', description: 'Search projects by name', required: false },
    },
    execute: async (params, config) => {
      const extraParams = new URLSearchParams();
      if (params.search) extraParams.set('search', params.search as string);
      return vercelFetch('/v10/projects', config, { extraParams });
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID or name', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v9/projects/${validatePathSegment(params.project_id, 'project_id')}`, config);
    },
  },
  {
    name: 'create_project',
    description: 'Create a new Vercel project',
    params: {
      name: { type: 'string', description: 'Project name', required: true },
      framework: { type: 'string', description: 'Framework preset (nextjs, nuxtjs, gatsby, etc.)', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { name: params.name };
      if (params.framework) body.framework = params.framework;
      return vercelFetch('/v11/projects', config, { method: 'POST', body });
    },
  },
  {
    name: 'update_project',
    description: 'Update a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      name: { type: 'string', description: 'New project name', required: false },
      framework: { type: 'string', description: 'Framework preset', required: false },
      buildCommand: { type: 'string', description: 'Custom build command', required: false },
    },
    execute: async (params, config) => {
      const { project_id, ...rest } = params;
      const body: Record<string, unknown> = {};
      if (rest.name) body.name = rest.name;
      if (rest.framework) body.framework = rest.framework;
      if (rest.buildCommand) body.buildCommand = rest.buildCommand;
      return vercelFetch(`/v9/projects/${validatePathSegment(project_id, 'project_id')}`, config, { method: 'PATCH', body });
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v9/projects/${validatePathSegment(params.project_id, 'project_id')}`, config, { method: 'DELETE' });
    },
  },

  // --- Environment Variables ---
  {
    name: 'list_env_vars',
    description: 'List environment variables for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/env`, config);
    },
  },
  {
    name: 'create_env_var',
    description: 'Create an environment variable for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      key: { type: 'string', description: 'Variable name', required: true },
      value: { type: 'string', description: 'Variable value', required: true },
      target: { type: 'string', description: 'Target environment (production, preview, development, or comma-separated)', required: true },
      type: { type: 'string', description: 'Variable type (plain, secret, encrypted)', required: false, enum: ['plain', 'secret', 'encrypted'] },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {
        key: params.key,
        value: params.value,
        target: params.target,
      };
      if (params.type) body.type = params.type;
      return vercelFetch(`/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/env`, config, { method: 'POST', body });
    },
  },
  {
    name: 'update_env_var',
    description: 'Update an environment variable for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      env_id: { type: 'string', description: 'Environment variable ID', required: true },
      value: { type: 'string', description: 'New value', required: false },
      target: { type: 'string', description: 'New target environment', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.value) body.value = params.value;
      if (params.target) body.target = params.target;
      return vercelFetch(
        `/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/env/${validatePathSegment(params.env_id, 'env_id')}`,
        config,
        { method: 'PATCH', body }
      );
    },
  },
  {
    name: 'delete_env_var',
    description: 'Delete an environment variable from a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      env_id: { type: 'string', description: 'Environment variable ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/env/${validatePathSegment(params.env_id, 'env_id')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },

  // --- Domains ---
  {
    name: 'list_domains',
    description: 'List domains for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/domains`, config);
    },
  },
  {
    name: 'add_domain',
    description: 'Add a domain to a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      name: { type: 'string', description: 'Domain name (e.g., "example.com")', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/domains`,
        config,
        { method: 'POST', body: { name: params.name } }
      );
    },
  },
  {
    name: 'remove_domain',
    description: 'Remove a domain from a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      domain: { type: 'string', description: 'Domain name to remove', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/domains/${validatePathSegment(params.domain, 'domain')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },
];

export const vercelAdapter: ServiceAdapter = {
  name: 'vercel',
  description: 'Vercel — manage deployments, projects, environment variables, and domains',
  actions,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/vercel.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/vercel.ts tests/vercel.test.ts
git commit -m "feat: add Vercel adapter with deployment, project, env var, and domain management"
```

---

## Task 4: Supabase Adapter

**Files:**
- Create: `src/services/supabase.ts`
- Create: `tests/supabase.test.ts`

### Context for implementer

This adapter talks to **two different Supabase APIs**:

1. **Management API** (`https://api.supabase.com`) — uses `token` (management token) for Bearer auth. Used for: projects, SQL queries, edge function lifecycle.
2. **Project API** (`https://{project_ref}.supabase.co`) — uses `service_role_key` as both `apikey` header and Bearer token. Used for: auth/users, storage, function invocation. The `baseUrl` defaults to `supabase.co` but is configurable for self-hosted.

This means the adapter needs **two fetch helpers**: `supabaseManagementFetch` and `supabaseProjectFetch`.

The adapter has 20 actions across five groups:
- **Projects** (2 actions, Management API) — list, get
- **Database** (1 action, Management API) — run_sql
- **Auth/Users** (5 actions, Project API) — CRUD
- **Storage** (8 actions, Project API) — buckets, files, signed URLs, upload
- **Edge Functions** (4 actions, mixed) — list/get/delete on Management API, invoke on Project API

The `upload_file` action takes `content` as base64-encoded data and decodes it before sending.

---

- [ ] **Step 1: Write tests for the Supabase adapter**

Create `tests/supabase.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabaseAdapter } from '../src/services/supabase.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockSupabaseResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockSupabaseError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ message }),
  };
}

const config = {
  token: 'mgmt-token',
  service_role_key: 'srv-role-key',
  project_ref: 'abcdefghij',
  baseUrl: 'supabase.co',
};

describe('Supabase adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = supabaseAdapter.actions.map((a) => a.name);
    expect(names).toContain('list_projects');
    expect(names).toContain('get_project');
    expect(names).toContain('run_sql');
    expect(names).toContain('list_users');
    expect(names).toContain('get_user');
    expect(names).toContain('create_user');
    expect(names).toContain('update_user');
    expect(names).toContain('delete_user');
    expect(names).toContain('list_buckets');
    expect(names).toContain('get_bucket');
    expect(names).toContain('create_bucket');
    expect(names).toContain('delete_bucket');
    expect(names).toContain('list_files');
    expect(names).toContain('delete_files');
    expect(names).toContain('get_signed_url');
    expect(names).toContain('upload_file');
    expect(names).toContain('list_functions');
    expect(names).toContain('get_function');
    expect(names).toContain('delete_function');
    expect(names).toContain('invoke_function');
    expect(names.length).toBe(20);
  });

  // --- Management API actions ---

  describe('list_projects', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'list_projects')!;

    it('lists projects via Management API', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([{ id: 'proj-1' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'proj-1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://api.supabase.com/v1/projects');
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe('Bearer mgmt-token');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({}, { service_role_key: 'k', project_ref: 'p' })).rejects.toThrow('Supabase management token not configured');
    });
  });

  describe('run_sql', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'run_sql')!;

    it('executes SQL via Management API', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([{ id: 1 }]));
      await action.execute({ query: 'SELECT 1' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/projects/abcdefghij/database/query');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.query).toBe('SELECT 1');
    });

    it('passes read_only flag', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([]));
      await action.execute({ query: 'SELECT 1', read_only: 'true' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.read_only).toBe(true);
    });

    it('throws on missing project_ref', async () => {
      await expect(action.execute({ query: 'SELECT 1' }, { token: 'tk' })).rejects.toThrow('Supabase project_ref not configured');
    });
  });

  // --- Project API actions ---

  describe('list_users', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'list_users')!;

    it('lists users via Project API', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ users: [{ id: 'u1' }] }));
      await action.execute({ page: '1', per_page: '10' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://abcdefghij.supabase.co')).toBe(true);
      expect(url).toContain('/auth/v1/admin/users');
      expect(url).toContain('page=1');
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.apikey).toBe('srv-role-key');
      expect(opts.headers.Authorization).toBe('Bearer srv-role-key');
    });

    it('throws on missing service_role_key', async () => {
      await expect(action.execute({}, { token: 'tk', project_ref: 'p' })).rejects.toThrow('Supabase service_role_key not configured');
    });
  });

  describe('get_user', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'get_user')!;

    it('fetches a user by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ id: 'u1', email: 'a@b.com' }));
      await action.execute({ user_id: 'u1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/auth/v1/admin/users/u1');
    });

    it('rejects user_id with path traversal', async () => {
      await expect(action.execute({ user_id: '../bad' }, config)).rejects.toThrow('Invalid user_id');
    });
  });

  describe('create_user', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'create_user')!;

    it('creates a user', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ id: 'u-new' }));
      await action.execute({ email: 'new@example.com', password: 'secret', email_confirm: 'true' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/auth/v1/admin/users');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.email).toBe('new@example.com');
      expect(body.email_confirm).toBe(true);
    });
  });

  describe('update_user', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'update_user')!;

    it('updates a user', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ id: 'u1' }));
      await action.execute({ user_id: 'u1', email: 'updated@example.com' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/auth/v1/admin/users/u1');
      expect(opts.method).toBe('PUT');
    });
  });

  // --- Storage ---

  describe('list_buckets', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'list_buckets')!;

    it('lists storage buckets', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([{ id: 'avatars' }]));
      await action.execute({}, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/storage/v1/bucket');
    });
  });

  describe('create_bucket', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'create_bucket')!;

    it('creates a bucket', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ name: 'photos' }));
      await action.execute({ id: 'photos', name: 'photos', public: 'true' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.id).toBe('photos');
      expect(body.public).toBe(true);
    });
  });

  describe('list_files', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'list_files')!;

    it('lists files in a bucket', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([{ name: 'photo.jpg' }]));
      await action.execute({ bucket_id: 'photos', prefix: 'uploads/', limit: '10' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/storage/v1/object/list/photos');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.prefix).toBe('uploads/');
      expect(body.limit).toBe(10);
    });
  });

  describe('get_signed_url', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'get_signed_url')!;

    it('generates a signed URL', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ signedURL: 'https://...' }));
      await action.execute({ bucket_id: 'photos', path: 'uploads/photo.jpg', expires_in: '3600' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/storage/v1/object/sign/photos/uploads/photo.jpg');
    });
  });

  describe('upload_file', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'upload_file')!;

    it('uploads a file from base64 content', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ Key: 'photos/test.txt' }));
      const content = Buffer.from('hello world').toString('base64');
      await action.execute({ bucket_id: 'photos', path: 'test.txt', content, content_type: 'text/plain' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/storage/v1/object/photos/test.txt');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('text/plain');
    });
  });

  // --- Edge Functions ---

  describe('list_functions', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'list_functions')!;

    it('lists edge functions via Management API', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([{ slug: 'hello' }]));
      await action.execute({}, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('api.supabase.com/v1/projects/abcdefghij/functions');
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe('Bearer mgmt-token');
    });
  });

  describe('invoke_function', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'invoke_function')!;

    it('invokes an edge function via Project API', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({ result: 'ok' }));
      await action.execute({ function_slug: 'hello', body: '{"name":"world"}' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('abcdefghij.supabase.co/functions/v1/hello');
      expect(opts.headers.Authorization).toBe('Bearer srv-role-key');
      expect(opts.method).toBe('POST');
    });

    it('rejects function_slug with path traversal', async () => {
      await expect(action.execute({ function_slug: '../bad' }, config)).rejects.toThrow('Invalid function_slug');
    });
  });

  describe('delete_function', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'delete_function')!;

    it('deletes an edge function via Management API', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse({}));
      await action.execute({ function_slug: 'hello' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('api.supabase.com/v1/projects/abcdefghij/functions/hello');
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('Management API error', () => {
    const action = supabaseAdapter.actions.find((a) => a.name === 'list_projects')!;

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseError(401, 'Unauthorized'));
      await expect(action.execute({}, config)).rejects.toThrow('Supabase API 401');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/supabase.test.ts`
Expected: FAIL — `supabase.ts` does not exist yet.

- [ ] **Step 3: Implement the Supabase adapter**

Create `src/services/supabase.ts`:

```typescript
/**
 * @fileoverview Supabase service adapter.
 *
 * Config keys:
 *   - token: Supabase Management API token (required for management actions)
 *   - service_role_key: Supabase service role key (required for project API actions)
 *   - project_ref: Supabase project reference ID (required)
 *   - baseUrl: Base URL domain (optional, defaults to "supabase.co", configurable for self-hosted)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'supabase.co';
const MANAGEMENT_API_URL = 'https://api.supabase.com';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

function requireProjectRef(config: Record<string, unknown>): string {
  const ref = config.project_ref as string | undefined;
  if (!ref) throw new Error('Supabase project_ref not configured');
  return ref;
}

async function supabaseManagementFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Supabase management token not configured');

  const res = await fetch(`${MANAGEMENT_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API ${res.status}: ${text}`);
  }

  return res.json();
}

async function supabaseProjectFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown; rawBody?: Buffer; contentType?: string } = {}
): Promise<unknown> {
  const serviceRoleKey = config.service_role_key as string | undefined;
  if (!serviceRoleKey) throw new Error('Supabase service_role_key not configured');

  const projectRef = requireProjectRef(config);
  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  let fetchBody: string | Buffer | undefined;
  if (options.rawBody) {
    headers['Content-Type'] = options.contentType || 'application/octet-stream';
    fetchBody = options.rawBody;
  } else if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`https://${projectRef}.${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(fetchBody ? { body: fetchBody } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  // --- Projects (Management API) ---
  {
    name: 'list_projects',
    description: 'List all Supabase projects',
    params: {},
    execute: async (_params, config) => {
      return supabaseManagementFetch('/v1/projects', config);
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a Supabase project',
    params: {
      project_ref: { type: 'string', description: 'Project reference ID (defaults to config value)', required: false },
    },
    execute: async (params, config) => {
      const ref = (params.project_ref as string) || requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${validatePathSegment(ref, 'project_ref')}`, config);
    },
  },

  // --- Database (Management API) ---
  {
    name: 'run_sql',
    description: 'Run a SQL query against the Supabase database',
    params: {
      query: { type: 'string', description: 'SQL query to execute', required: true },
      read_only: { type: 'string', description: 'Run as read-only query (true/false)', required: false },
    },
    execute: async (params, config) => {
      const ref = requireProjectRef(config);
      const body: Record<string, unknown> = { query: params.query };
      if (params.read_only) body.read_only = params.read_only === 'true';
      return supabaseManagementFetch(`/v1/projects/${ref}/database/query`, config, { method: 'POST', body });
    },
  },

  // --- Auth / Users (Project API) ---
  {
    name: 'list_users',
    description: 'List Supabase auth users',
    params: {
      page: { type: 'string', description: 'Page number', required: false },
      per_page: { type: 'string', description: 'Users per page', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page as string);
      if (params.per_page) searchParams.set('per_page', params.per_page as string);
      const qs = searchParams.toString();
      return supabaseProjectFetch(`/auth/v1/admin/users${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_user',
    description: 'Get a Supabase auth user by ID',
    params: {
      user_id: { type: 'string', description: 'User ID (UUID)', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/auth/v1/admin/users/${validatePathSegment(params.user_id, 'user_id')}`, config);
    },
  },
  {
    name: 'create_user',
    description: 'Create a new Supabase auth user',
    params: {
      email: { type: 'string', description: 'User email', required: false },
      phone: { type: 'string', description: 'User phone number', required: false },
      password: { type: 'string', description: 'User password', required: false },
      email_confirm: { type: 'string', description: 'Auto-confirm email (true/false)', required: false },
      user_metadata: { type: 'string', description: 'User metadata as JSON string', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.email) body.email = params.email;
      if (params.phone) body.phone = params.phone;
      if (params.password) body.password = params.password;
      if (params.email_confirm) body.email_confirm = params.email_confirm === 'true';
      if (params.user_metadata) {
        try {
          body.user_metadata = JSON.parse(params.user_metadata as string);
        } catch {
          throw new Error('user_metadata must be valid JSON');
        }
      }
      return supabaseProjectFetch('/auth/v1/admin/users', config, { method: 'POST', body });
    },
  },
  {
    name: 'update_user',
    description: 'Update a Supabase auth user',
    params: {
      user_id: { type: 'string', description: 'User ID (UUID)', required: true },
      email: { type: 'string', description: 'New email', required: false },
      password: { type: 'string', description: 'New password', required: false },
      user_metadata: { type: 'string', description: 'User metadata as JSON string', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.email) body.email = params.email;
      if (params.password) body.password = params.password;
      if (params.user_metadata) {
        try {
          body.user_metadata = JSON.parse(params.user_metadata as string);
        } catch {
          throw new Error('user_metadata must be valid JSON');
        }
      }
      return supabaseProjectFetch(`/auth/v1/admin/users/${validatePathSegment(params.user_id, 'user_id')}`, config, { method: 'PUT', body });
    },
  },
  {
    name: 'delete_user',
    description: 'Delete a Supabase auth user',
    params: {
      user_id: { type: 'string', description: 'User ID (UUID)', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/auth/v1/admin/users/${validatePathSegment(params.user_id, 'user_id')}`, config, { method: 'DELETE' });
    },
  },

  // --- Storage (Project API) ---
  {
    name: 'list_buckets',
    description: 'List all Supabase storage buckets',
    params: {},
    execute: async (_params, config) => {
      return supabaseProjectFetch('/storage/v1/bucket', config);
    },
  },
  {
    name: 'get_bucket',
    description: 'Get details of a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/storage/v1/bucket/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config);
    },
  },
  {
    name: 'create_bucket',
    description: 'Create a new Supabase storage bucket',
    params: {
      id: { type: 'string', description: 'Bucket ID', required: true },
      name: { type: 'string', description: 'Bucket name', required: true },
      public: { type: 'string', description: 'Make bucket public (true/false)', required: false },
      file_size_limit: { type: 'string', description: 'Max file size in bytes', required: false },
      allowed_mime_types: { type: 'string', description: 'Comma-separated allowed MIME types', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { id: params.id, name: params.name };
      if (params.public) body.public = params.public === 'true';
      if (params.file_size_limit) body.file_size_limit = parseInt(params.file_size_limit as string, 10);
      if (params.allowed_mime_types) body.allowed_mime_types = (params.allowed_mime_types as string).split(',').map((s) => s.trim());
      return supabaseProjectFetch('/storage/v1/bucket', config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_bucket',
    description: 'Delete a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/storage/v1/bucket/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config, { method: 'DELETE' });
    },
  },
  {
    name: 'list_files',
    description: 'List files in a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      prefix: { type: 'string', description: 'Path prefix to filter by', required: false },
      limit: { type: 'string', description: 'Max files to return', required: false },
      search: { type: 'string', description: 'Search string', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.prefix) body.prefix = params.prefix;
      if (params.limit) body.limit = parseInt(params.limit as string, 10);
      if (params.search) body.search = params.search;
      return supabaseProjectFetch(`/storage/v1/object/list/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_files',
    description: 'Delete files from a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      prefixes: { type: 'string', description: 'Comma-separated file paths to delete', required: true },
    },
    execute: async (params, config) => {
      const prefixes = (params.prefixes as string).split(',').map((s) => s.trim());
      return supabaseProjectFetch(`/storage/v1/object/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config, {
        method: 'DELETE',
        body: { prefixes },
      });
    },
  },
  {
    name: 'get_signed_url',
    description: 'Generate a signed URL for a file in Supabase storage',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      path: { type: 'string', description: 'File path within the bucket', required: true },
      expires_in: { type: 'string', description: 'URL expiration time in seconds', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(
        `/storage/v1/object/sign/${validatePathSegment(params.bucket_id, 'bucket_id')}/${params.path}`,
        config,
        { method: 'POST', body: { expiresIn: parseInt(params.expires_in as string, 10) } }
      );
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a file to Supabase storage (content must be base64-encoded)',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      path: { type: 'string', description: 'Destination file path within the bucket', required: true },
      content: { type: 'string', description: 'File content as base64-encoded string', required: true },
      content_type: { type: 'string', description: 'MIME type (e.g., "image/png")', required: false },
    },
    execute: async (params, config) => {
      const rawBody = Buffer.from(params.content as string, 'base64');
      const contentType = (params.content_type as string) || 'application/octet-stream';
      return supabaseProjectFetch(
        `/storage/v1/object/${validatePathSegment(params.bucket_id, 'bucket_id')}/${params.path}`,
        config,
        { method: 'POST', rawBody, contentType }
      );
    },
  },

  // --- Edge Functions ---
  {
    name: 'list_functions',
    description: 'List all Supabase Edge Functions',
    params: {},
    execute: async (_params, config) => {
      const ref = requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${ref}/functions`, config);
    },
  },
  {
    name: 'get_function',
    description: 'Get details of a Supabase Edge Function',
    params: {
      function_slug: { type: 'string', description: 'Function slug', required: true },
    },
    execute: async (params, config) => {
      const ref = requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${ref}/functions/${validatePathSegment(params.function_slug, 'function_slug')}`, config);
    },
  },
  {
    name: 'delete_function',
    description: 'Delete a Supabase Edge Function',
    params: {
      function_slug: { type: 'string', description: 'Function slug', required: true },
    },
    execute: async (params, config) => {
      const ref = requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${ref}/functions/${validatePathSegment(params.function_slug, 'function_slug')}`, config, { method: 'DELETE' });
    },
  },
  {
    name: 'invoke_function',
    description: 'Invoke a Supabase Edge Function',
    params: {
      function_slug: { type: 'string', description: 'Function slug', required: true },
      body: { type: 'string', description: 'Request body as JSON string', required: false },
    },
    execute: async (params, config) => {
      let parsedBody: unknown;
      if (params.body) {
        try {
          parsedBody = JSON.parse(params.body as string);
        } catch {
          throw new Error('body must be valid JSON');
        }
      }
      return supabaseProjectFetch(
        `/functions/v1/${validatePathSegment(params.function_slug, 'function_slug')}`,
        config,
        { method: 'POST', ...(parsedBody ? { body: parsedBody } : {}) }
      );
    },
  },
];

export const supabaseAdapter: ServiceAdapter = {
  name: 'supabase',
  description: 'Supabase — manage database (SQL), auth users, storage, and edge functions',
  actions,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/supabase.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase.ts tests/supabase.test.ts
git commit -m "feat: add Supabase adapter with database, auth, storage, and edge function management"
```

---

## Task 5: Registration and Example Config

**Files:**
- Modify: `src/services/index.ts`
- Modify: `examples/keeps.json`

**Depends on:** Tasks 1–4 (all four adapters must exist)

---

- [ ] **Step 1: Update `src/services/index.ts`**

Add the 4 new imports and registrations. The file currently looks like:

```typescript
import type { ServiceAdapter } from '../types.js';
import { asanaAdapter } from './asana.js';
import { sentryAdapter } from './sentry.js';
import { linearAdapter } from './linear.js';
import { posthogAdapter } from './posthog.js';

export const availableAdapters: Record<string, ServiceAdapter> = {
  asana: asanaAdapter,
  sentry: sentryAdapter,
  linear: linearAdapter,
  posthog: posthogAdapter,
};
```

Add after the existing imports:

```typescript
import { cloudflareAdapter } from './cloudflare.js';
import { coolifyAdapter } from './coolify.js';
import { vercelAdapter } from './vercel.js';
import { supabaseAdapter } from './supabase.js';
```

Add to the `availableAdapters` object:

```typescript
  cloudflare: cloudflareAdapter,
  coolify: coolifyAdapter,
  vercel: vercelAdapter,
  supabase: supabaseAdapter,
```

- [ ] **Step 2: Update `examples/keeps.json`**

Add the 4 new service configs. The file currently has asana, sentry, linear, posthog. Add:

```json
    "cloudflare": {
      "token": "${CLOUDFLARE_API_TOKEN}",
      "account_id": "YOUR_ACCOUNT_ID",
      "zone_id": "YOUR_ZONE_ID"
    },
    "coolify": {
      "token": "${COOLIFY_API_TOKEN}",
      "baseUrl": "http://your-coolify-host:8000"
    },
    "vercel": {
      "token": "${VERCEL_TOKEN}",
      "team_id": "team_xxxx"
    },
    "supabase": {
      "token": "${SUPABASE_MANAGEMENT_TOKEN}",
      "service_role_key": "${SUPABASE_SERVICE_ROLE_KEY}",
      "project_ref": "YOUR_PROJECT_REF",
      "baseUrl": "supabase.co"
    }
```

- [ ] **Step 3: Run the full test suite to verify nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/index.ts examples/keeps.json
git commit -m "feat: register Cloudflare, Coolify, Vercel, Supabase adapters and update example config"
```

---

## Task 6: Documentation

**Files:**
- Create: `docs/adding-a-connector.md`
- Create: `docs/setup-guide.md`

**Independent** — can be done in parallel with Tasks 1–5.

---

- [ ] **Step 1: Create the connector development guide**

Create `docs/adding-a-connector.md`:

```markdown
# Adding a New Connector

This guide walks through adding a new service adapter to the MCP gateway.

## Overview

Each adapter is a single TypeScript file that:
1. Defines a fetch helper for the service's API
2. Lists actions as a `ServiceAction[]` array
3. Exports a `ServiceAdapter` constant

## Step 1: Create the Adapter File

Create `src/services/<name>.ts`:

```typescript
import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.example.com';

// Security: validate all user-supplied path segments
function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

// Each adapter has its own fetch helper — don't share across adapters
async function exampleFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Example token not configured');

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
    throw new Error(`Example API ${res.status}: ${text}`);
  }

  // Adjust based on the API's response format:
  // - Most APIs: return res.json()
  // - Asana: extracts .data from response
  // - Cloudflare: extracts .result from response
  return res.json();
}

const actions: ServiceAction[] = [
  {
    name: 'list_items',
    description: 'List all items',
    params: {
      query: { type: 'string', description: 'Search query', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.query) searchParams.set('query', params.query as string);
      const qs = searchParams.toString();
      return exampleFetch(`/items${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_item',
    description: 'Get a specific item by ID',
    params: {
      item_id: { type: 'string', description: 'Item ID', required: true },
    },
    execute: async (params, config) => {
      // Always validate path segments!
      return exampleFetch(`/items/${validatePathSegment(params.item_id, 'item_id')}`, config);
    },
  },
];

export const exampleAdapter: ServiceAdapter = {
  name: 'example',
  description: 'Example service — list and manage items',
  actions,
};
```

## Step 2: Register the Adapter

In `src/services/index.ts`, add:

```typescript
import { exampleAdapter } from './example.js';

export const availableAdapters: Record<string, ServiceAdapter> = {
  // ... existing adapters
  example: exampleAdapter,
};
```

The server auto-registers adapters when their name appears in the gateway config.

## Step 3: Add Configuration

Add a section to your gateway config JSON:

```json
{
  "services": {
    "example": {
      "token": "${EXAMPLE_API_TOKEN}",
      "baseUrl": "https://api.example.com"
    }
  }
}
```

Config values support `${ENV_VAR}` interpolation — the gateway resolves these from environment variables at startup.

## Security Requirements

These are mandatory, not optional:

1. **`validatePathSegment()`** — Every user-supplied value interpolated into a URL path must go through this function. It rejects `/`, `?`, `#`, and `..` to prevent path traversal attacks.

2. **GraphQL variables** — If your service uses GraphQL, always use `$variables` in queries. Never string-interpolate user values into GraphQL query strings.

3. **Config validation** — Validate required config fields (token, project ID, etc.) in your fetch helper with clear error messages.

4. **Query parameters** — Use `URLSearchParams` or `encodeURIComponent()` for query string values. Don't manually concatenate.

## Testing

Create `tests/<name>.test.ts` following this pattern:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exampleAdapter } from '../src/services/example.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockExampleResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockExampleError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ error: message }),
  };
}

const config = { token: 'test-token' };

describe('Example adapter', () => {
  beforeEach(() => { mockFetch.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('has expected actions', () => {
    const names = exampleAdapter.actions.map((a) => a.name);
    expect(names).toContain('list_items');
    expect(names).toContain('get_item');
  });

  // Test each action:
  // 1. Happy path — correct URL, headers, response
  // 2. Missing token — throws descriptive error
  // 3. API error — throws with status code
  // 4. Path traversal — validatePathSegment rejects bad input
  // 5. Custom baseUrl — if supported
});
```

### What to Cover

- **Every action**: correct URL construction, auth headers, request body
- **Missing token/config**: throws with service-specific error message
- **API errors**: throws with status code
- **Path traversal**: `validatePathSegment` rejects `../`, `/`, `?`, `#`
- **Custom baseUrl**: if the adapter supports it

Run tests: `npx vitest run tests/<name>.test.ts`
```

- [ ] **Step 2: Create the setup guide**

Create `docs/setup-guide.md`:

```markdown
# MCP Gateway Setup Guide

This guide explains how to configure and connect the MCP gateway to your AI coding tool.

## 1. Create a Gateway Config

Create a JSON file with your service credentials:

```json
{
  "services": {
    "sentry": {
      "token": "${SENTRY_AUTH_TOKEN}",
      "organization": "my-org",
      "project": "my-project"
    },
    "linear": {
      "token": "${LINEAR_API_KEY}"
    }
  }
}
```

Save this as `~/.config/mcp-gateway/config.json` (or any path you prefer).

**Environment variable interpolation:** Values like `${SENTRY_AUTH_TOKEN}` are resolved from your shell environment at startup. Set them in your shell profile:

```bash
export SENTRY_AUTH_TOKEN="sntrys_..."
export LINEAR_API_KEY="lin_api_..."
```

Only include services you use — the gateway ignores unconfigured adapters.

## 2. Configure Your AI Tool

### Claude Code

Add to your project's `.mcp.json` (or `~/.claude/mcp.json` for global):

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

Or use `npx` to avoid local installation:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "npx",
      "args": ["-y", "mcp-gateway"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### OpenAI Codex

Add to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Cursor

Go to **Settings → MCP Servers → Add Server** and configure:

- **Name:** `gateway`
- **Command:** `node /path/to/mcp-gateway/dist/server.js`
- **Environment:** `GATEWAY_CONFIG=/path/to/config.json`

Or add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP settings (`.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Other MCP-Compatible Tools

The gateway uses the standard MCP stdio transport. Any tool that supports MCP servers can connect with:

- **Command:** `node /path/to/mcp-gateway/dist/server.js`
- **Environment:** `GATEWAY_CONFIG=/path/to/config.json`

## 3. Build First

Before running, compile the TypeScript:

```bash
cd /path/to/mcp-gateway
npm install
npm run build
```

## 4. Verify the Setup

Once configured, your AI tool should have access to two MCP tools:

- **`search`** — Find available actions: try `search("list issues")`
- **`execute`** — Call an action: try `execute("sentry", "list_issues", "{}")`

If the tools aren't appearing, check:
1. The `GATEWAY_CONFIG` path is correct and the file exists
2. Environment variables referenced in config are set
3. The gateway is built (`dist/server.js` exists)
4. Your AI tool's MCP configuration syntax is correct

## Available Services

| Service | Config Keys | Actions |
|---------|------------|---------|
| Asana | `token`, `workspace` | Task, project, and comment management |
| Sentry | `token`, `organization`, `project` | Issue tracking and event inspection |
| Linear | `token` | Issue CRUD, teams, projects, labels |
| PostHog | `token`, `project_id` | Events, persons, session recordings, insights |
| Cloudflare | `token`, `account_id`, `zone_id` | DNS, Zero Trust Access, Tunnels |
| Coolify | `token`, `baseUrl` | Applications, servers, databases, projects |
| Vercel | `token`, `team_id` | Deployments, projects, env vars, domains |
| Supabase | `token`, `service_role_key`, `project_ref` | Database SQL, auth, storage, edge functions |

See `examples/keeps.json` for a full config example with all services.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adding-a-connector.md docs/setup-guide.md
git commit -m "docs: add connector development guide and gateway setup guide"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Cloudflare: 18 actions (5 DNS + 7 Zero Trust + 6 Tunnels)
- ✅ Coolify: 23 actions (6 apps + 4 servers + 5 databases + 4 projects + 4 environments)
- ✅ Vercel: 18 actions (6 deployments + 5 projects + 4 env vars + 3 domains)
- ✅ Supabase: 20 actions (2 projects + 1 SQL + 5 auth + 8 storage + 4 functions)
- ✅ Registration in `src/services/index.ts`
- ✅ Example config update
- ✅ Connector development guide
- ✅ Setup guide for Claude/Gemini/Codex/Cursor/Windsurf
- ✅ Tests for all 4 adapters

**2. Placeholder scan:** No TBDs, TODOs, or vague instructions. All code is complete.

**3. Type consistency:**
- All adapters use `ServiceAdapter`, `ServiceAction` from `../types.js`
- All export `<name>Adapter: ServiceAdapter`
- All use `validatePathSegment()` with consistent signature
- All fetch helpers follow `(path, config, options?)` pattern
- `supabaseProjectFetch` has additional `rawBody`/`contentType` options for file upload
