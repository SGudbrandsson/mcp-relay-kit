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

The server auto-registers adapters when their name appears in the gateway config. Multiple instances of the same adapter can be registered using `service:label` config keys (e.g. `"example:production"` and `"example:staging"`) — no adapter code changes needed.

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
