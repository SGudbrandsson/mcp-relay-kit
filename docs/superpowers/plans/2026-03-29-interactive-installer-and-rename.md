# Interactive Installer & Project Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive CLI installer (`--setup`) and rename the project from `mcp-gateway` to `codemode-gateway`.

**Architecture:** Single new file `src/setup.ts` with the installer logic, small change to `src/server.ts` to delegate on `--setup`. Pure Node built-ins (readline, fs, path, os) — no new dependencies. Project rename touches package.json, server.ts, README, docs, and e2e test.

**Tech Stack:** TypeScript, Node.js readline, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/setup.ts` | Create | Interactive installer — service metadata, prompting, config generation, file writing |
| `src/server.ts` | Modify | Check for `--setup` flag, delegate to setup; rename log prefix and McpServer name |
| `package.json` | Modify | Rename to `codemode-gateway` |
| `README.md` | Modify | Replace all `mcp-gateway` references |
| `docs/setup-guide.md` | Modify | Replace all `mcp-gateway` references |
| `docs/adding-a-connector.md` | Modify | Replace all `mcp-gateway` references |
| `tests/e2e.test.ts` | Modify | Update temp file name and references |
| `tests/setup.test.ts` | Create | Unit tests for setup utility functions |
| `CLAUDE.md` | Modify | Update project name references |

---

### Task 1: Project Rename

**Files:**
- Modify: `package.json`
- Modify: `src/server.ts:30-37,40-42,94,98`
- Modify: `tests/e2e.test.ts:8,11`
- Modify: `README.md`
- Modify: `docs/setup-guide.md`
- Modify: `docs/adding-a-connector.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update package.json**

Change `name` and `bin` key:

```json
{
  "name": "codemode-gateway",
  "version": "0.1.0",
  "description": "Lightweight MCP server — exposes multiple services (Asana, Sentry, Linear, PostHog, etc.) as 2 tools: search + execute",
  "type": "module",
  "main": "dist/server.js",
  "bin": {
    "codemode-gateway": "dist/server.js"
  }
}
```

- [ ] **Step 2: Update src/server.ts log prefix and server name**

Replace all `[mcp-gateway]` log prefixes with `[codemode-gateway]` and change the McpServer name:

```typescript
const server = new McpServer({
  name: 'codemode-gateway',
  version: '0.1.0',
});
```

And all console.error lines:
```typescript
console.error(`[codemode-gateway] Registered service: ${configKey}`);
// ...
console.error(`[codemode-gateway] Unknown service in config: ${configKey} (available: ${Object.keys(availableAdapters).join(', ')})`);
// ...
console.error('[codemode-gateway] Warning: No services registered. Set GATEWAY_CONFIG to a config file path.');
// ...
console.error(`[codemode-gateway] Server running (services: ${registry.serviceNames.join(', ') || 'none'})`);
// ...
console.error('[codemode-gateway] Fatal error:', err);
```

Also update the `@fileoverview` comment:
```typescript
/**
 * @fileoverview Codemode Gateway server.
 *
 * Exposes all registered services through 2 tools:
 *   - search(query) — discover available actions
 *   - execute(service, action, params) — call an action
 *
 * Runs as an MCP stdio server. Configure via GATEWAY_CONFIG env var.
 */
```

- [ ] **Step 3: Update tests/e2e.test.ts**

Change the describe name and temp file path:

```typescript
describe('Codemode Gateway E2E', () => {
  // ...
  const configPath = join(tmpdir(), 'codemode-gateway-e2e-config.json');
```

- [ ] **Step 4: Update README.md**

Replace all occurrences of `mcp-gateway` with `codemode-gateway`. Key locations:
- Title: `# codemode-gateway`
- Architecture section command examples
- Quick Start config paths (e.g. `~/.config/codemode-gateway/keeps.json`)
- `.mcp.json` examples
- `cd ~/sources/codemode-gateway` (or just `cd` to the project)
- Design Decisions section
- Testing section

- [ ] **Step 5: Update docs/setup-guide.md**

Replace all `mcp-gateway` with `codemode-gateway`:
- Config path references
- MCP server config JSON examples
- Build instructions

- [ ] **Step 6: Update docs/adding-a-connector.md**

No occurrences of `mcp-gateway` in this file — skip.

- [ ] **Step 7: Update CLAUDE.md**

Replace `mcp-gateway` references if any exist.

- [ ] **Step 8: Run tests to verify nothing broke**

Run: `npx vitest run tests/e2e.test.ts`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add package.json src/server.ts tests/e2e.test.ts README.md docs/setup-guide.md CLAUDE.md
git commit -m "chore: rename project from mcp-gateway to codemode-gateway"
```

---

### Task 2: Setup Utility Functions (with tests)

**Files:**
- Create: `src/setup.ts`
- Create: `tests/setup.test.ts`

This task builds the pure utility functions used by the installer. These are testable without interactive prompts.

- [ ] **Step 1: Write failing tests for `resolveValue`**

Create `tests/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveValue, generateBackupPath, mergeIntoMcpConfig } from '../src/setup.js';

describe('resolveValue', () => {
  it('wraps ALL_CAPS input as env var reference', () => {
    expect(resolveValue('SENTRY_AUTH_TOKEN')).toBe('${SENTRY_AUTH_TOKEN}');
  });

  it('wraps $-prefixed input as env var reference', () => {
    expect(resolveValue('$my_token')).toBe('${my_token}');
  });

  it('stores normal text as literal', () => {
    expect(resolveValue('my-org-slug')).toBe('my-org-slug');
  });

  it('stores URLs as literals', () => {
    expect(resolveValue('https://sentry.example.com')).toBe('https://sentry.example.com');
  });

  it('treats mixed case as literal', () => {
    expect(resolveValue('MyToken')).toBe('MyToken');
  });

  it('wraps UPPER_123 with digits as env var', () => {
    expect(resolveValue('API_KEY_V2')).toBe('${API_KEY_V2}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/setup.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `resolveValue` in src/setup.ts**

Create `src/setup.ts`:

```typescript
/**
 * @fileoverview Interactive setup wizard for Codemode Gateway.
 *
 * Invoked via `codemode-gateway --setup`. Walks users through:
 * 1. Selecting which services to configure
 * 2. Entering credentials and config for each service
 * 3. Writing the gateway config JSON
 * 4. Configuring their AI tool's MCP settings
 */

import { createInterface, Interface as ReadlineInterface } from 'node:readline';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Determine whether user input is an env var reference or a literal value.
 * - ALL_CAPS_WITH_UNDERSCORES → ${INPUT}
 * - $prefixed → ${rest}
 * - everything else → literal
 */
export function resolveValue(input: string): string {
  if (input.startsWith('$')) {
    return `\${${input.slice(1)}}`;
  }
  if (/^[A-Z][A-Z0-9_]*$/.test(input)) {
    return `\${${input}}`;
  }
  return input;
}
```

- [ ] **Step 4: Run tests to verify `resolveValue` passes**

Run: `npx vitest run tests/setup.test.ts -t "resolveValue"`
Expected: 6 tests pass

- [ ] **Step 5: Write failing tests for `generateBackupPath`**

Add to `tests/setup.test.ts`:

```typescript
describe('generateBackupPath', () => {
  it('appends .bak and timestamp to filename', () => {
    const result = generateBackupPath('/home/user/.config/config.json');
    expect(result).toMatch(/^\/home\/user\/\.config\/config\.json\.bak\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('handles paths without directory', () => {
    const result = generateBackupPath('config.json');
    expect(result).toMatch(/^config\.json\.bak\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 6: Implement `generateBackupPath`**

Add to `src/setup.ts`:

```typescript
/** Generate a backup path by appending .bak.<ISO-timestamp> */
export function generateBackupPath(filePath: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${filePath}.bak.${ts}`;
}
```

- [ ] **Step 7: Run tests to verify `generateBackupPath` passes**

Run: `npx vitest run tests/setup.test.ts -t "generateBackupPath"`
Expected: 2 tests pass

- [ ] **Step 8: Write failing tests for `mergeIntoMcpConfig`**

Add to `tests/setup.test.ts`:

```typescript
describe('mergeIntoMcpConfig', () => {
  it('creates new config when none exists', () => {
    const result = mergeIntoMcpConfig(null, {
      command: 'node',
      args: ['/path/to/server.js'],
      env: { GATEWAY_CONFIG: '/path/to/config.json' },
    });
    expect(result).toEqual({
      mcpServers: {
        'codemode-gateway': {
          command: 'node',
          args: ['/path/to/server.js'],
          env: { GATEWAY_CONFIG: '/path/to/config.json' },
        },
      },
    });
  });

  it('preserves existing MCP servers', () => {
    const existing = {
      mcpServers: {
        'other-server': { command: 'other', args: [] },
      },
    };
    const result = mergeIntoMcpConfig(existing, {
      command: 'node',
      args: ['/path/to/server.js'],
      env: { GATEWAY_CONFIG: '/path/to/config.json' },
    });
    expect(result.mcpServers['other-server']).toEqual({ command: 'other', args: [] });
    expect(result.mcpServers['codemode-gateway']).toBeDefined();
  });

  it('overwrites existing gateway entry', () => {
    const existing = {
      mcpServers: {
        'codemode-gateway': { command: 'old', args: ['/old'] },
      },
    };
    const result = mergeIntoMcpConfig(existing, {
      command: 'node',
      args: ['/new/server.js'],
      env: { GATEWAY_CONFIG: '/new/config.json' },
    });
    expect(result.mcpServers['codemode-gateway'].command).toBe('node');
    expect(result.mcpServers['codemode-gateway'].args).toEqual(['/new/server.js']);
  });
});
```

- [ ] **Step 9: Implement `mergeIntoMcpConfig`**

Add to `src/setup.ts`:

```typescript
interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

/** Merge our gateway entry into an existing MCP config, preserving other servers. */
export function mergeIntoMcpConfig(
  existing: McpConfig | null,
  entry: McpServerEntry
): McpConfig {
  const base = existing ?? { mcpServers: {} };
  return {
    ...base,
    mcpServers: {
      ...base.mcpServers,
      'codemode-gateway': entry,
    },
  };
}
```

- [ ] **Step 10: Run all setup tests**

Run: `npx vitest run tests/setup.test.ts`
Expected: All 11 tests pass

- [ ] **Step 11: Commit**

```bash
git add src/setup.ts tests/setup.test.ts
git commit -m "feat: add setup utility functions with tests (resolveValue, generateBackupPath, mergeIntoMcpConfig)"
```

---

### Task 3: Service Metadata Registry

**Files:**
- Modify: `src/setup.ts`

- [ ] **Step 1: Add the ServiceMeta types and registry**

Add to `src/setup.ts` after the existing utility functions:

```typescript
interface ServiceField {
  name: string;
  description: string;
  envVarHint: string;
  required: boolean;
}

interface ServiceMeta {
  name: string;
  displayName: string;
  description: string;
  fields: ServiceField[];
}

export const SERVICE_REGISTRY: ServiceMeta[] = [
  {
    name: 'asana',
    displayName: 'Asana',
    description: 'Project management',
    fields: [
      { name: 'token', description: 'Personal access token', envVarHint: 'ASANA_TOKEN', required: true },
      { name: 'workspace', description: 'Workspace GID', envVarHint: '', required: false },
    ],
  },
  {
    name: 'sentry',
    displayName: 'Sentry',
    description: 'Error tracking',
    fields: [
      { name: 'token', description: 'Auth token', envVarHint: 'SENTRY_AUTH_TOKEN', required: true },
      { name: 'organization', description: 'Organization slug', envVarHint: '', required: true },
      { name: 'project', description: 'Project slug', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'API base URL (for self-hosted)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'linear',
    displayName: 'Linear',
    description: 'Issue tracking',
    fields: [
      { name: 'token', description: 'API key', envVarHint: 'LINEAR_API_KEY', required: true },
      { name: 'baseUrl', description: 'API base URL (for self-hosted)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'posthog',
    displayName: 'PostHog',
    description: 'Product analytics',
    fields: [
      { name: 'token', description: 'Personal API key', envVarHint: 'POSTHOG_PERSONAL_API_KEY', required: true },
      { name: 'project_id', description: 'Project ID', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'API base URL (for self-hosted)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'cloudflare',
    displayName: 'Cloudflare',
    description: 'DNS, Zero Trust, Tunnels',
    fields: [
      { name: 'token', description: 'API token', envVarHint: 'CLOUDFLARE_API_TOKEN', required: true },
      { name: 'account_id', description: 'Account ID', envVarHint: '', required: true },
      { name: 'zone_id', description: 'Zone ID', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'API base URL', envVarHint: '', required: false },
    ],
  },
  {
    name: 'coolify',
    displayName: 'Coolify',
    description: 'Self-hosted PaaS',
    fields: [
      { name: 'token', description: 'API token', envVarHint: 'COOLIFY_API_TOKEN', required: true },
      { name: 'baseUrl', description: 'Coolify instance URL (e.g. http://coolify:8000)', envVarHint: '', required: true },
    ],
  },
  {
    name: 'vercel',
    displayName: 'Vercel',
    description: 'Deployments and hosting',
    fields: [
      { name: 'token', description: 'API token', envVarHint: 'VERCEL_TOKEN', required: true },
      { name: 'team_id', description: 'Team ID (e.g. team_xxxx)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'supabase',
    displayName: 'Supabase',
    description: 'Database, auth, storage, edge functions',
    fields: [
      { name: 'token', description: 'Management API token', envVarHint: 'SUPABASE_MANAGEMENT_TOKEN', required: true },
      { name: 'service_role_key', description: 'Service role key', envVarHint: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
      { name: 'project_ref', description: 'Project reference ID', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'Base URL domain (default: supabase.co)', envVarHint: '', required: false },
    ],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/setup.ts
git commit -m "feat: add service metadata registry for setup wizard"
```

---

### Task 4: Interactive Prompting Helpers

**Files:**
- Modify: `src/setup.ts`

- [ ] **Step 1: Add readline prompt helpers**

Add to `src/setup.ts`:

```typescript
function createPrompt(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string) => new Promise<string>((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    }),
    close: () => rl.close(),
  };
}

function printHeader(text: string): void {
  console.log(`\n── ${text} ──\n`);
}
```

- [ ] **Step 2: Add the service selection prompt**

Add to `src/setup.ts`:

```typescript
async function selectServices(
  ask: (q: string) => Promise<string>
): Promise<string[]> {
  const selected = new Set<number>();

  const renderList = () => {
    console.log('\nAvailable services:');
    SERVICE_REGISTRY.forEach((s, i) => {
      const check = selected.has(i) ? 'x' : ' ';
      console.log(`  ${i + 1}. [${check}] ${s.displayName} — ${s.description}`);
    });
  };

  renderList();

  while (true) {
    const input = await ask("\nEnter numbers to toggle (e.g. \"1 3 5\"), 'a' for all, Enter to continue: ");

    if (input === '') {
      if (selected.size === 0) {
        console.log('Please select at least one service.');
        continue;
      }
      break;
    }

    if (input.toLowerCase() === 'a') {
      if (selected.size === SERVICE_REGISTRY.length) {
        selected.clear();
      } else {
        SERVICE_REGISTRY.forEach((_, i) => selected.add(i));
      }
      renderList();
      continue;
    }

    const nums = input.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    for (const n of nums) {
      if (n >= 1 && n <= SERVICE_REGISTRY.length) {
        if (selected.has(n - 1)) {
          selected.delete(n - 1);
        } else {
          selected.add(n - 1);
        }
      }
    }
    renderList();
  }

  return [...selected].sort().map((i) => SERVICE_REGISTRY[i].name);
}
```

- [ ] **Step 3: Add the service configuration prompt**

Add to `src/setup.ts`:

```typescript
interface ServiceInstance {
  configKey: string;
  config: Record<string, string>;
}

async function configureService(
  meta: ServiceMeta,
  ask: (q: string) => Promise<string>,
  label?: string
): Promise<Record<string, string>> {
  const configKey = label ? `${meta.name}:${label}` : meta.name;
  printHeader(`Configuring ${label ? `${meta.displayName}:${label}` : meta.displayName}`);

  const config: Record<string, string> = {};

  for (const field of meta.fields) {
    const requiredTag = field.required ? '' : ' (optional, press Enter to skip)';
    const hint = field.envVarHint ? ` [e.g. ${field.envVarHint}]` : '';
    const prompt = `${field.name} — ${field.description}${hint}${requiredTag}: `;

    while (true) {
      const value = await ask(prompt);

      if (!value && field.required) {
        console.log(`  ${field.name} is required.`);
        continue;
      }

      if (value) {
        const resolved = resolveValue(value);
        const isEnvVar = resolved.startsWith('${');
        console.log(`  → ${isEnvVar ? `Will use ${resolved}` : `Stored "${resolved}" directly`}`);
        config[field.name] = resolved;
      }
      break;
    }
  }

  return config;
}

async function configureAllServices(
  selectedNames: string[],
  ask: (q: string) => Promise<string>
): Promise<ServiceInstance[]> {
  const instances: ServiceInstance[] = [];

  for (const name of selectedNames) {
    const meta = SERVICE_REGISTRY.find((s) => s.name === name)!;

    // First instance (no label)
    const config = await configureService(meta, ask);
    instances.push({ configKey: name, config });

    // Additional instances
    while (true) {
      const another = await ask(`\nAdd another ${meta.displayName} instance? (y/n): `);
      if (another.toLowerCase() !== 'y') break;

      const label = await ask('Instance label (e.g. "staging"): ');
      if (!label) {
        console.log('  Label is required for additional instances.');
        continue;
      }

      const instanceConfig = await configureService(meta, ask, label);
      instances.push({ configKey: `${name}:${label}`, config: instanceConfig });
    }
  }

  return instances;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/setup.ts
git commit -m "feat: add interactive prompting helpers for service selection and configuration"
```

---

### Task 5: Config File Writing

**Files:**
- Modify: `src/setup.ts`

- [ ] **Step 1: Add the config file writer**

Add to `src/setup.ts`:

```typescript
function buildGatewayConfig(instances: ServiceInstance[]): Record<string, unknown> {
  const services: Record<string, Record<string, string>> = {};
  for (const inst of instances) {
    services[inst.configKey] = inst.config;
  }
  return { services };
}

function writeFileWithBackup(filePath: string, content: string): string | null {
  const resolved = resolve(filePath);
  let backupPath: string | null = null;

  mkdirSync(dirname(resolved), { recursive: true });

  if (existsSync(resolved)) {
    backupPath = generateBackupPath(resolved);
    renameSync(resolved, backupPath);
  }

  writeFileSync(resolved, content, 'utf-8');
  return backupPath;
}

async function writeConfigFile(
  instances: ServiceInstance[],
  ask: (q: string) => Promise<string>
): Promise<string> {
  const defaultPath = join(homedir(), '.config', 'codemode-gateway', 'config.json');
  const pathInput = await ask(`\nConfig file path [${defaultPath}]: `);
  const configPath = pathInput || defaultPath;

  const config = buildGatewayConfig(instances);
  const json = JSON.stringify(config, null, 2);

  console.log(`\nConfig file: ${configPath}`);
  console.log(json);

  const confirm = await ask('\nWrite this file? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('\nSkipped. Here is the config to save manually:');
    console.log(json);
    return configPath;
  }

  const backupPath = writeFileWithBackup(configPath, json + '\n');
  if (backupPath) {
    console.log(`✓ Backed up existing file to ${backupPath}`);
  }
  console.log(`✓ Written to ${configPath}`);

  return configPath;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/setup.ts
git commit -m "feat: add config file writer with backup support"
```

---

### Task 6: AI Tool Detection and MCP Config

**Files:**
- Modify: `src/setup.ts`

- [ ] **Step 1: Add AI tool metadata and detection**

Add to `src/setup.ts`:

```typescript
interface AiTool {
  name: string;
  detect: () => boolean;
  configPaths: { label: string; path: string }[];
  snippetOnly?: boolean;
}

function getAiTools(): AiTool[] {
  const cwd = process.cwd();
  return [
    {
      name: 'Claude Code',
      detect: () => existsSync(join(homedir(), '.claude')),
      configPaths: [
        { label: 'This project only', path: join(cwd, '.mcp.json') },
        { label: 'All projects', path: join(homedir(), '.claude', 'mcp.json') },
      ],
    },
    {
      name: 'Gemini CLI',
      detect: () => existsSync(join(homedir(), '.gemini')),
      configPaths: [
        { label: 'Global', path: join(homedir(), '.gemini', 'settings.json') },
      ],
    },
    {
      name: 'Cursor',
      detect: () => existsSync(join(cwd, '.cursor')),
      configPaths: [
        { label: 'This project', path: join(cwd, '.cursor', 'mcp.json') },
      ],
    },
    {
      name: 'Windsurf',
      detect: () => existsSync(join(cwd, '.windsurf')),
      configPaths: [
        { label: 'This project', path: join(cwd, '.windsurf', 'mcp.json') },
      ],
    },
    {
      name: 'Codex',
      detect: () => false,
      configPaths: [],
      snippetOnly: true,
    },
    {
      name: 'Generic MCP',
      detect: () => false,
      configPaths: [],
      snippetOnly: true,
    },
  ];
}
```

- [ ] **Step 2: Add the AI tool configuration flow**

Add to `src/setup.ts`:

```typescript
function getServerPath(): string {
  // Resolve from this file's location to dist/server.js
  return resolve(dirname(import.meta.dirname ?? __dirname), 'dist', 'server.js');
}

function buildMcpEntry(configPath: string): McpServerEntry {
  return {
    command: 'node',
    args: [getServerPath()],
    env: { GATEWAY_CONFIG: resolve(configPath) },
  };
}

async function configureAiTool(
  configPath: string,
  ask: (q: string) => Promise<string>
): Promise<void> {
  const tools = getAiTools();

  console.log('\nConfigure for which AI tool?');
  tools.forEach((t, i) => {
    const detected = t.detect() ? ' (detected)' : '';
    const snippet = t.snippetOnly ? ' (copy snippet)' : '';
    console.log(`  ${i + 1}. ${t.name}${detected}${snippet}`);
  });

  const choice = await ask('\nEnter number: ');
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= tools.length) {
    console.log('Invalid choice. Skipping AI tool configuration.');
    return;
  }

  const tool = tools[idx];
  const entry = buildMcpEntry(configPath);

  // Snippet-only tools: just print the JSON
  if (tool.snippetOnly) {
    const snippet = JSON.stringify({ mcpServers: { 'codemode-gateway': entry } }, null, 2);
    console.log(`\nAdd this to your ${tool.name} MCP configuration:\n`);
    console.log(snippet);
    return;
  }

  // Tools with config file(s)
  let mcpPath: string;
  if (tool.configPaths.length === 1) {
    mcpPath = tool.configPaths[0].path;
  } else {
    console.log('\nConfigure for:');
    tool.configPaths.forEach((cp, i) => {
      console.log(`  ${i + 1}. ${cp.label} (${cp.path})`);
    });
    const scopeChoice = await ask('Enter number: ');
    const scopeIdx = parseInt(scopeChoice, 10) - 1;
    if (isNaN(scopeIdx) || scopeIdx < 0 || scopeIdx >= tool.configPaths.length) {
      console.log('Invalid choice. Skipping.');
      return;
    }
    mcpPath = tool.configPaths[scopeIdx].path;
  }

  // Read existing config if present
  let existing: McpConfig | null = null;
  if (existsSync(mcpPath)) {
    try {
      existing = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      console.log(`  Warning: Could not parse existing ${mcpPath}, will create new file.`);
    }
  }

  const merged = mergeIntoMcpConfig(existing, entry);
  const json = JSON.stringify(merged, null, 2);

  console.log(`\nMCP config: ${mcpPath}`);
  console.log(json);

  const confirm = await ask('\nWrite this file? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('\nSkipped. Here is the config to save manually:');
    console.log(json);
    return;
  }

  const backupPath = writeFileWithBackup(mcpPath, json + '\n');
  if (backupPath) {
    console.log(`✓ Backed up existing file to ${backupPath}`);
  }
  console.log(`✓ Written to ${mcpPath}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/setup.ts
git commit -m "feat: add AI tool detection and MCP config writer"
```

---

### Task 7: Main Setup Flow and Entry Point

**Files:**
- Modify: `src/setup.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Add the main `runSetup` function**

Add to `src/setup.ts`:

```typescript
export async function runSetup(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║       Codemode Gateway Setup Wizard      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\nThis wizard will help you:');
  console.log('  1. Choose which services to connect');
  console.log('  2. Configure credentials for each service');
  console.log('  3. Set up your AI tool to use the gateway');

  const { ask, close } = createPrompt();

  try {
    // Step 1: Select services
    const selectedNames = await selectServices(ask);
    if (selectedNames.length === 0) {
      console.log('\nNo services selected. Exiting.');
      return;
    }

    // Step 2: Configure each service
    const instances = await configureAllServices(selectedNames, ask);

    // Step 3: Write gateway config
    const configPath = await writeConfigFile(instances, ask);

    // Step 4: Configure AI tool
    const setupAi = await ask('\nConfigure an AI tool to use this gateway? (y/n): ');
    if (setupAi.toLowerCase() === 'y') {
      await configureAiTool(configPath, ask);
    }

    // Done
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║            Setup Complete!                ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('\nTo verify, start your AI tool and try:');
    console.log('  search("list")');
    console.log('\nThis should show all actions from your configured services.\n');
  } finally {
    close();
  }
}
```

- [ ] **Step 2: Wire up the --setup flag in server.ts**

Modify `src/server.ts`. Add this block right after the imports (before the `const registry = ...` line):

```typescript
// Handle --setup flag before starting the MCP server
if (process.argv.includes('--setup')) {
  import('./setup.js').then(({ runSetup }) => runSetup()).then(
    () => process.exit(0),
    (err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    }
  );
} else {
```

And wrap the rest of the file (from `const registry = ...` through `main().catch(...)`) inside the `else {` block, ending with `}`.

The full structure becomes:

```typescript
if (process.argv.includes('--setup')) {
  import('./setup.js').then(({ runSetup }) => runSetup()).then(
    () => process.exit(0),
    (err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    }
  );
} else {
  const registry = new ServiceRegistry();
  // ... all existing server code ...
  main().catch((err) => {
    console.error('[codemode-gateway] Fatal error:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new setup tests)

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts src/server.ts
git commit -m "feat: wire up --setup flag to interactive installer"
```

---

### Task 8: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/setup-guide.md`

- [ ] **Step 1: Add --setup section to README.md**

Add a new section after "Quick Start" in README.md:

```markdown
## Interactive Setup

Run the setup wizard to configure services and connect your AI tool:

```bash
npx codemode-gateway --setup
```

The wizard will:
1. Let you choose which services to configure
2. Walk through credentials for each service
3. Optionally configure your AI tool (Claude Code, Gemini CLI, Cursor, Windsurf, Codex)

For manual configuration, see below.
```

- [ ] **Step 2: Add --setup reference to docs/setup-guide.md**

Add at the top of the file, before the manual configuration section:

```markdown
## Quick Setup

Run the interactive installer:

```bash
npx codemode-gateway --setup
```

This walks you through service selection, credentials, and AI tool configuration. For manual setup, continue reading below.

---
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/setup-guide.md
git commit -m "docs: add --setup wizard documentation"
```
