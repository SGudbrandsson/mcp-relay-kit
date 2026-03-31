# MCP Proxy & Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP server proxying so any MCP server can be aggregated through the search+execute interface, and rename the project to `mcp-relay-kit`.

**Architecture:** A new `mcp-proxy.ts` module spawns child MCP servers via `StdioClientTransport`, discovers their tools via `client.listTools()`, converts JSON Schema tool definitions into `ServiceAction[]`, and registers them as normal adapters. The existing built-in adapters coexist alongside proxied servers.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (Client + StdioClientTransport), Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/mcp-proxy.ts` | **Create.** Spawn child MCP servers, discover tools, convert schemas, return `ServiceAdapter` |
| `src/types.ts` | **Modify.** Add `McpServerConfig` type, extend `GatewayConfig` with `mcpServers?` |
| `src/server.ts` | **Modify.** Add proxied server registration loop + shutdown hooks |
| `src/config.ts` | **Modify.** Rename log prefix |
| `src/setup.ts` | **Modify.** Add MCP server config section, rename all references |
| `src/services/index.ts` | **Modify.** Rename only |
| `package.json` | **Modify.** Rename package and bin |
| `README.md` | **Modify.** Rename + document mcpServers config |
| `docs/setup-guide.md` | **Modify.** Rename + document mcpServers config |
| `tests/mcp-proxy.test.ts` | **Create.** Unit tests for schema conversion and proxy lifecycle |
| `tests/e2e.test.ts` | **Modify.** Add proxied server E2E test + rename |
| `tests/*.test.ts` | **Modify.** Rename references in all test files |

---

### Task 1: Rename project to mcp-relay-kit

Mechanical rename across all files. No logic changes.

**Files:**
- Modify: `package.json`
- Modify: `src/server.ts`
- Modify: `src/config.ts`
- Modify: `src/setup.ts`
- Modify: `src/services/index.ts`
- Modify: `README.md`
- Modify: `docs/setup-guide.md`
- Modify: `tests/e2e.test.ts`
- Modify: `tests/config.test.ts`
- Modify: `tests/setup.test.ts`
- Modify: `tests/registry.test.ts`
- Modify: `examples/mcp.json`

- [ ] **Step 1: Update package.json**

Change `name` and `bin`:

```json
{
  "name": "mcp-relay-kit",
  "bin": {
    "mcp-relay-kit": "dist/server.js"
  }
}
```

Also update the `description`:

```json
{
  "description": "MCP relay — exposes multiple services and MCP servers through 2 tools: search + execute"
}
```

- [ ] **Step 2: Update src/server.ts**

Replace all `codemode-gateway` references:
- McpServer name: `'mcp-relay-kit'`
- All `console.error` log prefixes: `[mcp-relay-kit]`

- [ ] **Step 3: Update src/config.ts**

Replace log prefix `[codemode-gateway]` with `[mcp-relay-kit]`.

- [ ] **Step 4: Update src/setup.ts**

Replace all `codemode-gateway` references:
- Line 75: `'codemode-gateway'` → `'mcp-relay-kit'` in `mergeIntoMcpConfig`
- Line 306: `'.config', 'codemode-gateway'` → `'.config', 'mcp-relay-kit'`
- Line 430: `'codemode-gateway'` → `'mcp-relay-kit'` in snippet
- Line 485: `'Codemode Gateway Setup'` → `'MCP Relay Kit Setup'`
- Line 486: update description text
- Line 508: `'npx codemode-gateway --setup'` → `'npx mcp-relay-kit --setup'`

- [ ] **Step 5: Update README.md**

Replace all `codemode-gateway` with `mcp-relay-kit`:
- Title, description, config paths, command examples, server name
- Replace `Codemode Gateway` with `MCP Relay Kit` in prose

- [ ] **Step 6: Update docs/setup-guide.md**

Replace all `codemode-gateway` with `mcp-relay-kit`.

- [ ] **Step 7: Update examples/mcp.json**

Replace gateway name reference if present.

- [ ] **Step 8: Update test files**

In each of these files, replace `codemode-gateway` and `Codemode Gateway` with `mcp-relay-kit` / `MCP Relay Kit`:
- `tests/e2e.test.ts`: describe name, temp file names
- `tests/config.test.ts`: temp dir name
- `tests/setup.test.ts`: `'codemode-gateway'` string in mergeIntoMcpConfig assertions
- `tests/registry.test.ts`: describe name if applicable

- [ ] **Step 9: Regenerate package-lock.json**

```bash
npm install
```

- [ ] **Step 10: Run all tests to verify rename**

```bash
npx vitest run tests/setup.test.ts tests/config.test.ts tests/registry.test.ts tests/e2e.test.ts
```

Expected: all pass.

- [ ] **Step 11: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/ tests/ README.md docs/ examples/
git commit -m "chore: rename project to mcp-relay-kit"
```

---

### Task 2: Add McpServerConfig type and extend GatewayConfig

**Files:**
- Modify: `src/types.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/config.test.ts`:

```typescript
it('loads mcpServers config alongside services', () => {
  writeFileSync(configPath, JSON.stringify({
    services: {
      asana: { token: 'my-token' },
    },
    mcpServers: {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '${TEST_TOKEN}' },
      },
    },
  }));
  process.env.GATEWAY_CONFIG = configPath;
  process.env.TEST_TOKEN = 'ghp_test123';
  const config = loadConfig();
  expect(config.services.asana).toEqual({ token: 'my-token' });
  expect(config.mcpServers).toBeDefined();
  expect(config.mcpServers!.github.command).toBe('npx');
  expect(config.mcpServers!.github.env!.GITHUB_TOKEN).toBe('ghp_test123');
});

it('returns empty mcpServers when not present in config', () => {
  writeFileSync(configPath, JSON.stringify({
    services: { asana: { token: 'tok' } },
  }));
  process.env.GATEWAY_CONFIG = configPath;
  const config = loadConfig();
  expect(config.mcpServers).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config.test.ts -t "loads mcpServers"
```

Expected: FAIL — `mcpServers` property doesn't exist on `GatewayConfig` type.

- [ ] **Step 3: Update types.ts**

Add to `src/types.ts`:

```typescript
/** Configuration for a proxied MCP server */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
```

Extend `GatewayConfig`:

```typescript
export interface GatewayConfig {
  services: Record<string, ServiceConfig>;
  mcpServers?: Record<string, McpServerConfig>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config.test.ts
```

Expected: all pass. The `loadConfig()` function already parses the full JSON and does env var interpolation on all string values, so `mcpServers` flows through automatically.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/config.test.ts
git commit -m "feat: add McpServerConfig type and extend GatewayConfig"
```

---

### Task 3: Implement mcp-proxy module

**Files:**
- Create: `src/mcp-proxy.ts`
- Create: `tests/mcp-proxy.test.ts`

- [ ] **Step 1: Write schema conversion tests**

Create `tests/mcp-proxy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { convertJsonSchemaToParams } from '../src/mcp-proxy.js';

describe('convertJsonSchemaToParams', () => {
  it('converts simple string, number, boolean properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'The name' },
        count: { type: 'number', description: 'How many' },
        verbose: { type: 'boolean', description: 'Enable verbose' },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.name).toEqual({ type: 'string', description: 'The name', required: false });
    expect(result.count).toEqual({ type: 'number', description: 'How many', required: false });
    expect(result.verbose).toEqual({ type: 'boolean', description: 'Enable verbose', required: false });
  });

  it('marks required properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Resource ID' },
        label: { type: 'string', description: 'Optional label' },
      },
      required: ['id'],
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.id.required).toBe(true);
    expect(result.label.required).toBe(false);
  });

  it('carries over enum arrays', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Status', enum: ['open', 'closed'] },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.status.enum).toEqual(['open', 'closed']);
  });

  it('handles complex types by falling back to string with schema in description', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        tags: { type: 'array', description: 'Tag list', items: { type: 'string' } },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.tags.type).toBe('string');
    expect(result.tags.description).toContain('Tag list');
    expect(result.tags.description).toContain('array');
  });

  it('returns empty params for schema with no properties', () => {
    const schema = { type: 'object' as const };
    const result = convertJsonSchemaToParams(schema);
    expect(result).toEqual({});
  });

  it('handles missing description gracefully', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string' },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.id.description).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/mcp-proxy.test.ts
```

Expected: FAIL — module `../src/mcp-proxy.js` does not exist.

- [ ] **Step 3: Implement mcp-proxy.ts**

Create `src/mcp-proxy.ts`:

```typescript
/**
 * @fileoverview MCP proxy — spawns child MCP servers and wraps their tools as ServiceAdapters.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ServiceAdapter, ServiceAction, ParamSchema, McpServerConfig } from './types.js';

/** JSON Schema property (subset we handle) */
interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  [key: string]: unknown;
}

/** JSON Schema object (subset we handle) */
interface JsonSchemaObject {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Convert a JSON Schema object definition to our ParamSchema format.
 * Exported for testing.
 */
export function convertJsonSchemaToParams(
  schema: JsonSchemaObject
): Record<string, ParamSchema> {
  const params: Record<string, ParamSchema> = {};
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [name, prop] of Object.entries(properties)) {
    const simpleType = prop.type === 'string' || prop.type === 'number' || prop.type === 'boolean';

    let type: ParamSchema['type'];
    let description = prop.description ?? '';

    if (simpleType) {
      type = prop.type as ParamSchema['type'];
    } else {
      // Complex type — fall back to string, include schema info in description
      type = 'string';
      if (prop.type) {
        description = description
          ? `${description} (JSON ${prop.type})`
          : `JSON ${prop.type}`;
      }
    }

    const paramSchema: ParamSchema = {
      type,
      description,
      required: required.has(name),
    };

    if (prop.enum && Array.isArray(prop.enum)) {
      paramSchema.enum = prop.enum as string[];
    }

    params[name] = paramSchema;
  }

  return params;
}

/**
 * Start a proxied MCP server and return a ServiceAdapter wrapping its tools.
 */
export async function startMcpProxy(
  name: string,
  config: McpServerConfig
): Promise<{ adapter: ServiceAdapter; shutdown: () => void }> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: {
      ...process.env as Record<string, string>,
      ...(config.env ?? {}),
    },
  });

  const client = new Client({ name: `mcp-relay-kit-proxy-${name}`, version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();

  const actions: ServiceAction[] = tools.map((tool) => {
    const inputSchema = (tool.inputSchema ?? { type: 'object' }) as JsonSchemaObject;
    const params = convertJsonSchemaToParams(inputSchema);

    return {
      name: tool.name,
      description: tool.description ?? '',
      params,
      execute: async (actionParams: Record<string, unknown>) => {
        const result = await client.callTool({
          name: tool.name,
          arguments: actionParams,
        });
        // Extract text content from MCP response
        const texts = (result.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!);
        if (texts.length === 1) {
          // Try to parse as JSON for cleaner output
          try { return JSON.parse(texts[0]); } catch { return texts[0]; }
        }
        return texts.length > 0 ? texts.join('\n') : result.content;
      },
    };
  });

  const adapter: ServiceAdapter = {
    name,
    description: `Proxied MCP server: ${name}`,
    actions,
  };

  const shutdown = () => {
    client.close().catch(() => {});
  };

  return { adapter, shutdown };
}
```

- [ ] **Step 4: Run schema conversion tests**

```bash
npx vitest run tests/mcp-proxy.test.ts
```

Expected: all pass.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/mcp-proxy.ts tests/mcp-proxy.test.ts
git commit -m "feat: add MCP proxy module with schema conversion"
```

---

### Task 4: Integrate proxy into server startup

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add proxied server registration and shutdown hooks**

In `src/server.ts`, after the existing adapter registration loop (around line 44), add:

```typescript
const { startMcpProxy } = await import('./mcp-proxy.js');

// Register proxied MCP servers from config.mcpServers
const shutdowns: Array<() => void> = [];
for (const [name, serverConfig] of Object.entries(config.mcpServers ?? {})) {
  if (registry.has(name)) {
    console.error(`[mcp-relay-kit] Warning: "${name}" in mcpServers collides with a built-in service, skipping`);
    continue;
  }
  try {
    const { adapter, shutdown } = await startMcpProxy(name, serverConfig);
    registry.register(adapter, {}, name);
    shutdowns.push(shutdown);
    console.error(`[mcp-relay-kit] Registered proxied MCP server: ${name} (${adapter.actions.length} tools)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mcp-relay-kit] Failed to start proxied MCP server "${name}": ${msg}`);
  }
}

// Clean up child processes on exit
const cleanupAndExit = () => {
  shutdowns.forEach((fn) => fn());
  process.exit(0);
};
process.on('SIGTERM', cleanupAndExit);
process.on('SIGINT', cleanupAndExit);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Create a temporary config with no mcpServers and verify the server starts normally:

```bash
GATEWAY_CONFIG=/home/siggi/.config/mcp-gateway/keeps.json timeout 3 node dist/server.js 2>&1 || true
```

Expected: all existing services register, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: integrate MCP proxy into server startup with shutdown hooks"
```

---

### Task 5: E2E test with a proxied MCP server

**Files:**
- Create: `tests/fixtures/echo-mcp-server.ts`
- Modify: `tests/e2e.test.ts`

- [ ] **Step 1: Create a minimal echo MCP server for testing**

Create `tests/fixtures/echo-mcp-server.ts`:

```typescript
#!/usr/bin/env node
/**
 * Minimal MCP server for testing MCP proxying.
 * Exposes one tool: echo(message) → returns the message.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-test-server', version: '1.0.0' });

server.tool(
  'echo',
  'Echo back the input message',
  { message: z.string().describe('Message to echo back') },
  async ({ message }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ echoed: message }) }],
  })
);

server.tool(
  'add',
  'Add two numbers',
  {
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
  },
  async ({ a, b }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ result: a + b }) }],
  })
);

const transport = new StdioServerTransport();
server.connect(transport);
```

- [ ] **Step 2: Add E2E tests for proxied server**

Add a new describe block in `tests/e2e.test.ts`:

```typescript
describe('MCP Relay Kit E2E — proxied MCP server', () => {
  let client: Client;
  let transport: StdioClientTransport;
  const configPath = join(tmpdir(), 'mcp-relay-kit-e2e-proxy-config.json');

  beforeAll(async () => {
    mkdirSync(join(tmpdir()), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        services: {},
        mcpServers: {
          echo: {
            command: 'npx',
            args: ['tsx', join(import.meta.dirname, 'fixtures', 'echo-mcp-server.ts')],
          },
        },
      })
    );

    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/server.ts'],
      cwd: join(import.meta.dirname, '..'),
      env: {
        ...process.env,
        GATEWAY_CONFIG: configPath,
      },
    });

    client = new Client({ name: 'e2e-proxy-test', version: '1.0.0' });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client.close();
    try { unlinkSync(configPath); } catch {}
  });

  it('proxied echo server appears in search results', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'echo' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].service).toBe('echo');
    expect(actions[0].action).toBe('echo');
  });

  it('can execute a proxied tool', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'echo',
        action: 'echo',
        params: JSON.stringify({ message: 'hello from proxy' }),
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ echoed: 'hello from proxy' });
  });

  it('proxied server exposes correct param schemas', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'add numbers' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    const addAction = actions.find((a: any) => a.action === 'add');
    expect(addAction).toBeDefined();
    expect(addAction.params.a.type).toBe('number');
    expect(addAction.params.b.type).toBe('number');
    expect(addAction.params.a.required).toBe(true);
  });

  it('returns error for unknown action on proxied server', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'echo',
        action: 'nonexistent',
        params: '{}',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unknown action');
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
npx vitest run tests/e2e.test.ts
```

Expected: all tests pass (both existing built-in adapter tests and new proxy tests).

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/echo-mcp-server.ts tests/e2e.test.ts
git commit -m "test: add E2E tests for proxied MCP server"
```

---

### Task 6: Add MCP server configuration to setup wizard

**Files:**
- Modify: `src/setup.ts`
- Modify: `tests/setup.test.ts`

- [ ] **Step 1: Write test for buildGatewayConfig with mcpServers**

Add to `tests/setup.test.ts`. First, update the import to include `buildGatewayConfig` (it needs to be exported from setup.ts — do this in step 3):

```typescript
import { resolveValue, generateBackupPath, mergeIntoMcpConfig, writeFileWithBackup, buildGatewayConfig } from '../src/setup.js';
```

Add test:

```typescript
describe('buildGatewayConfig', () => {
  it('includes mcpServers when mcp instances are present', () => {
    const result = buildGatewayConfig(
      [{ configKey: 'asana', config: { token: 'tok' } }],
      [{ name: 'github', command: 'npx', args: ['-y', '@mcp/github'], env: { TOKEN: 'ghp' } }]
    );
    expect(result.services.asana).toEqual({ token: 'tok' });
    expect(result.mcpServers).toBeDefined();
    expect(result.mcpServers!.github).toEqual({
      command: 'npx',
      args: ['-y', '@mcp/github'],
      env: { TOKEN: 'ghp' },
    });
  });

  it('omits mcpServers key when no mcp instances', () => {
    const result = buildGatewayConfig(
      [{ configKey: 'asana', config: { token: 'tok' } }],
      []
    );
    expect(result.mcpServers).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/setup.test.ts -t "buildGatewayConfig"
```

Expected: FAIL — `buildGatewayConfig` not exported or wrong signature.

- [ ] **Step 3: Update setup.ts — export buildGatewayConfig and add mcpServers support**

Find `buildGatewayConfig` in `src/setup.ts` and update it:
- Export the function
- Add a second parameter for MCP server instances
- Include `mcpServers` in the output config when non-empty

```typescript
interface McpInstance {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function buildGatewayConfig(
  instances: ServiceInstance[],
  mcpInstances: McpInstance[] = []
): { services: Record<string, Record<string, string>>; mcpServers?: Record<string, { command: string; args: string[]; env: Record<string, string> }> } {
  const services: Record<string, Record<string, string>> = {};
  for (const inst of instances) {
    services[inst.configKey] = inst.config;
  }
  const config: { services: typeof services; mcpServers?: Record<string, { command: string; args: string[]; env: Record<string, string> }> } = { services };
  if (mcpInstances.length > 0) {
    config.mcpServers = {};
    for (const mcp of mcpInstances) {
      config.mcpServers[mcp.name] = {
        command: mcp.command,
        args: mcp.args,
        env: mcp.env,
      };
    }
  }
  return config;
}
```

- [ ] **Step 4: Add interactive MCP server configuration flow**

Add to `src/setup.ts`, a new function `configureMcpServers`:

```typescript
async function configureMcpServers(
  ask: (q: string) => Promise<string>
): Promise<McpInstance[]> {
  printHeader('Add MCP Servers');
  console.log('You can proxy any MCP server through the relay.\n');

  const instances: McpInstance[] = [];

  while (true) {
    const addMore = instances.length === 0
      ? await ask('Would you like to add an MCP server? (y/N): ')
      : await ask('Add another MCP server? (y/N): ');
    if (addMore.toLowerCase() !== 'y') break;

    const name = await ask('  Server name (e.g., "github"): ');
    if (!name.trim()) {
      console.log('  Name is required, skipping.');
      continue;
    }

    const command = await ask('  Command (e.g., "npx"): ');
    if (!command.trim()) {
      console.log('  Command is required, skipping.');
      continue;
    }

    const argsRaw = await ask('  Args (space-separated, e.g., "-y @modelcontextprotocol/server-github"): ');
    const args = argsRaw.trim() ? argsRaw.trim().split(/\s+/) : [];

    const env: Record<string, string> = {};
    console.log('  Environment variables (empty name to finish):');
    while (true) {
      const envName = await ask('    Var name: ');
      if (!envName.trim()) break;
      const envValue = await ask(`    Value for ${envName}: `);
      env[envName.trim()] = resolveValue(envValue.trim());
    }

    instances.push({ name: name.trim(), command: command.trim(), args, env });
    console.log(`  Added MCP server: ${name.trim()}\n`);
  }

  return instances;
}
```

- [ ] **Step 5: Wire it into runSetup**

Update `runSetup()` in `src/setup.ts` to call `configureMcpServers` and pass the results to `buildGatewayConfig` and `writeConfigFile`:

```typescript
export async function runSetup(): Promise<void> {
  console.log('\n=== MCP Relay Kit Setup ===\n');
  console.log('This wizard will help you configure services and MCP servers.\n');

  const { ask, close } = createPrompt();

  try {
    // Select and configure built-in services
    const selectedNames = await selectServices(ask);
    console.log(`\nSelected: ${selectedNames.join(', ')}`);
    const instances = await configureAllServices(selectedNames, ask);

    // Configure proxied MCP servers
    const mcpInstances = await configureMcpServers(ask);

    // Write gateway config
    const configPath = await writeConfigFile(instances, mcpInstances, ask);

    // Optionally configure AI tool
    const setupAi = await ask('\nConfigure an AI tool now? (Y/n): ');
    if (setupAi.toLowerCase() !== 'n') {
      await configureAiTool(configPath, ask);
    }

    printHeader('Setup Complete');
    console.log('You can re-run this wizard anytime with: npx mcp-relay-kit --setup\n');
  } finally {
    close();
  }
}
```

Update `writeConfigFile` to accept `mcpInstances`:

```typescript
async function writeConfigFile(
  instances: ServiceInstance[],
  mcpInstances: McpInstance[],
  ask: (q: string) => Promise<string>,
): Promise<string> {
  printHeader('Write Config');

  const defaultPath = path.join(os.homedir(), '.config', 'mcp-relay-kit', 'config.json');
  const rawPath = await ask(`Config file path [${defaultPath}]: `);
  const configPath = (rawPath || defaultPath).replace(/^~(?=\/|$)/, os.homedir());

  const gatewayConfig = buildGatewayConfig(instances, mcpInstances);
  const content = JSON.stringify(gatewayConfig, null, 2) + '\n';

  console.log('\nPreview:');
  console.log(content);

  const confirm = await ask('Write this config? (Y/n): ');
  if (confirm.toLowerCase() === 'n') {
    console.log('Skipped writing config.');
    return configPath;
  }

  const backup = writeFileWithBackup(configPath, content);
  if (backup) {
    console.log(`Backed up existing config to: ${backup}`);
  }
  console.log(`Config written to: ${configPath}`);
  return configPath;
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/setup.test.ts
```

Expected: all pass.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/setup.ts tests/setup.test.ts
git commit -m "feat: add MCP server configuration to setup wizard"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/setup-guide.md`

- [ ] **Step 1: Update README.md**

Add a new section after "Quick Start" that documents the `mcpServers` config:

```markdown
## Proxying MCP Servers

You can proxy any MCP server through the relay, collapsing its tools into the same search+execute interface:

\`\`\`json
{
  "services": {
    "asana": { "token": "..." }
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
\`\`\`

The relay spawns each MCP server as a child process, discovers its tools, and exposes them through `search` and `execute`. A server with 20+ tools still costs only ~2,000 tokens of context.

- `command`, `args`, `env` use the standard MCP server config format
- `env` values support `${VAR}` interpolation
- Built-in adapters (in `services`) and proxied servers (in `mcpServers`) coexist
- If a name in `mcpServers` collides with one in `services`, the built-in adapter wins
```

Also update the Architecture diagram to mention proxied servers.

- [ ] **Step 2: Update docs/setup-guide.md**

Add a section documenting the `mcpServers` config format and how to add MCP servers via the setup wizard.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/setup-guide.md
git commit -m "docs: document MCP server proxying"
```
