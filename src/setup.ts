#!/usr/bin/env node
/**
 * @fileoverview Interactive setup wizard for Codemode Gateway.
 *
 * Run with: node dist/server.js --setup
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// ── Types ──

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

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

interface ServiceInstance {
  configKey: string;
  config: Record<string, string>;
}

interface AiTool {
  name: string;
  detected: boolean;
  configPaths: { label: string; path: string }[];
  snippetOnly: boolean;
}

// ── Utility functions (exported for testing) ──

/** Determine whether user input is an env var reference or a literal value. */
export function resolveValue(input: string): string {
  if (input.startsWith('$')) {
    const name = input.slice(1);
    if (!name) return input;
    return `\${${name}}`;
  }
  if (/^[A-Z][A-Z0-9_]*$/.test(input)) return `\${${input}}`;
  return input;
}

/** Generate a backup path by appending .bak.<ISO-timestamp> */
export function generateBackupPath(filePath: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${filePath}.bak.${ts}`;
}

/** Merge our gateway entry into an existing MCP config, preserving other servers. */
export function mergeIntoMcpConfig(existing: McpConfig | null, entry: McpServerEntry): McpConfig {
  const base = existing ?? { mcpServers: {} };
  return { ...base, mcpServers: { ...base.mcpServers, 'codemode-gateway': entry } };
}

// ── Service metadata registry ──

export const SERVICE_REGISTRY: ServiceMeta[] = [
  {
    name: 'asana', displayName: 'Asana', description: 'Project management',
    fields: [
      { name: 'token', description: 'Personal access token', envVarHint: 'ASANA_TOKEN', required: true },
      { name: 'workspace', description: 'Workspace GID', envVarHint: '', required: false },
    ],
  },
  {
    name: 'sentry', displayName: 'Sentry', description: 'Error tracking',
    fields: [
      { name: 'token', description: 'Auth token', envVarHint: 'SENTRY_AUTH_TOKEN', required: true },
      { name: 'organization', description: 'Organization slug', envVarHint: '', required: true },
      { name: 'project', description: 'Project slug', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'API base URL (for self-hosted)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'linear', displayName: 'Linear', description: 'Issue tracking',
    fields: [
      { name: 'token', description: 'API key', envVarHint: 'LINEAR_API_KEY', required: true },
      { name: 'baseUrl', description: 'API base URL (for self-hosted)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'posthog', displayName: 'PostHog', description: 'Product analytics',
    fields: [
      { name: 'token', description: 'Personal API key', envVarHint: 'POSTHOG_PERSONAL_API_KEY', required: true },
      { name: 'project_id', description: 'Project ID', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'API base URL (for self-hosted)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'cloudflare', displayName: 'Cloudflare', description: 'DNS, Zero Trust, Tunnels',
    fields: [
      { name: 'token', description: 'API token', envVarHint: 'CLOUDFLARE_API_TOKEN', required: true },
      { name: 'account_id', description: 'Account ID', envVarHint: '', required: true },
      { name: 'zone_id', description: 'Zone ID', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'API base URL', envVarHint: '', required: false },
    ],
  },
  {
    name: 'coolify', displayName: 'Coolify', description: 'Self-hosted PaaS',
    fields: [
      { name: 'token', description: 'API token', envVarHint: 'COOLIFY_API_TOKEN', required: true },
      { name: 'baseUrl', description: 'Coolify instance URL (e.g. http://coolify:8000)', envVarHint: '', required: true },
    ],
  },
  {
    name: 'vercel', displayName: 'Vercel', description: 'Deployments and hosting',
    fields: [
      { name: 'token', description: 'API token', envVarHint: 'VERCEL_TOKEN', required: true },
      { name: 'team_id', description: 'Team ID (e.g. team_xxxx)', envVarHint: '', required: false },
    ],
  },
  {
    name: 'supabase', displayName: 'Supabase', description: 'Database, auth, storage, edge functions',
    fields: [
      { name: 'token', description: 'Management API token', envVarHint: 'SUPABASE_MANAGEMENT_TOKEN', required: true },
      { name: 'service_role_key', description: 'Service role key', envVarHint: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
      { name: 'project_ref', description: 'Project reference ID', envVarHint: '', required: true },
      { name: 'baseUrl', description: 'Base URL domain (default: supabase.co)', envVarHint: '', required: false },
    ],
  },
];

// ── Interactive prompting helpers ──

function createPrompt(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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

async function selectServices(ask: (q: string) => Promise<string>): Promise<string[]> {
  printHeader('Select Services');
  const selected = new Set<number>();

  const showList = () => {
    for (let i = 0; i < SERVICE_REGISTRY.length; i++) {
      const meta = SERVICE_REGISTRY[i];
      const mark = selected.has(i) ? '[x]' : '[ ]';
      console.log(`  ${mark} ${i + 1}. ${meta.displayName} — ${meta.description}`);
    }
    console.log('\nEnter number to toggle, "a" for all, Enter to confirm.');
  };

  showList();

  while (true) {
    const input = await ask('> ');
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
        for (let i = 0; i < SERVICE_REGISTRY.length; i++) selected.add(i);
      }
      showList();
      continue;
    }
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= SERVICE_REGISTRY.length) {
      const idx = num - 1;
      if (selected.has(idx)) {
        selected.delete(idx);
      } else {
        selected.add(idx);
      }
      showList();
    } else {
      console.log(`Invalid input. Enter 1-${SERVICE_REGISTRY.length}, "a", or Enter.`);
    }
  }

  return Array.from(selected).sort().map((i) => SERVICE_REGISTRY[i].name);
}

async function configureService(
  meta: ServiceMeta,
  ask: (q: string) => Promise<string>,
  label?: string,
): Promise<Record<string, string>> {
  const displayLabel = label ? `${meta.displayName} (${label})` : meta.displayName;
  printHeader(`Configure ${displayLabel}`);

  const config: Record<string, string> = {};
  for (const field of meta.fields) {
    const hint = field.envVarHint ? ` [env: ${field.envVarHint}]` : '';
    const reqTag = field.required ? ' (required)' : ' (optional)';
    const prompt = `  ${field.description}${hint}${reqTag}: `;
    while (true) {
      const value = await ask(prompt);
      if (value === '' && !field.required) break;
      if (value === '' && field.required) {
        console.log('    This field is required.');
        continue;
      }
      config[field.name] = resolveValue(value);
      break;
    }
  }
  return config;
}

async function configureAllServices(
  selectedNames: string[],
  ask: (q: string) => Promise<string>,
): Promise<ServiceInstance[]> {
  const instances: ServiceInstance[] = [];

  for (const name of selectedNames) {
    const meta = SERVICE_REGISTRY.find((s) => s.name === name);
    if (!meta) continue;

    // First instance
    const config = await configureService(meta, ask);
    instances.push({ configKey: name, config });

    // Additional instances
    while (true) {
      const more = await ask(`\nAdd another ${meta.displayName} instance? (y/N): `);
      if (more.toLowerCase() !== 'y') break;
      const label = await ask('  Label for this instance (e.g. "production"): ');
      if (!label) {
        console.log('  Label is required for additional instances.');
        continue;
      }
      const extraConfig = await configureService(meta, ask, label);
      instances.push({ configKey: `${name}:${label}`, config: extraConfig });
    }
  }

  return instances;
}

// ── Config file writing ──

function buildGatewayConfig(instances: ServiceInstance[]): Record<string, unknown> {
  const services: Record<string, Record<string, string>> = {};
  for (const inst of instances) {
    services[inst.configKey] = inst.config;
  }
  return { services };
}

function writeFileWithBackup(filePath: string, content: string): string | null {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let backupPath: string | null = null;
  if (fs.existsSync(filePath)) {
    backupPath = generateBackupPath(filePath);
    fs.copyFileSync(filePath, backupPath);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return backupPath;
}

async function writeConfigFile(
  instances: ServiceInstance[],
  ask: (q: string) => Promise<string>,
): Promise<string> {
  printHeader('Write Gateway Config');

  const defaultPath = path.join(os.homedir(), '.config', 'codemode-gateway', 'config.json');
  const pathInput = await ask(`Config file path [${defaultPath}]: `);
  const configPath = pathInput || defaultPath;

  const gatewayConfig = buildGatewayConfig(instances);
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

// ── AI tool detection and MCP config ──

function getAiTools(): AiTool[] {
  const home = os.homedir();
  const cwd = process.cwd();

  return [
    {
      name: 'Claude Code',
      detected: fs.existsSync(path.join(home, '.claude')),
      configPaths: [
        { label: 'Project', path: path.join(cwd, '.mcp.json') },
        { label: 'Global', path: path.join(home, '.claude', 'mcp.json') },
      ],
      snippetOnly: false,
    },
    {
      name: 'Gemini CLI',
      detected: fs.existsSync(path.join(home, '.gemini')),
      configPaths: [
        { label: 'Global', path: path.join(home, '.gemini', 'settings.json') },
      ],
      snippetOnly: false,
    },
    {
      name: 'Cursor',
      detected: fs.existsSync(path.join(cwd, '.cursor')),
      configPaths: [
        { label: 'Project', path: path.join(cwd, '.cursor', 'mcp.json') },
      ],
      snippetOnly: false,
    },
    {
      name: 'Windsurf',
      detected: fs.existsSync(path.join(cwd, '.windsurf')),
      configPaths: [
        { label: 'Project', path: path.join(cwd, '.windsurf', 'mcp.json') },
      ],
      snippetOnly: false,
    },
    {
      name: 'Codex',
      detected: true,
      configPaths: [],
      snippetOnly: true,
    },
    {
      name: 'Generic MCP',
      detected: true,
      configPaths: [],
      snippetOnly: true,
    },
  ];
}

function getServerPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  // When running from source (src/), point to dist/server.js for the MCP config
  const projectRoot = path.resolve(thisDir, '..');
  return path.join(projectRoot, 'dist', 'server.js');
}

function buildMcpEntry(configPath: string): McpServerEntry {
  return {
    command: 'node',
    args: [getServerPath()],
    env: { GATEWAY_CONFIG: configPath },
  };
}

async function configureAiTool(
  configPath: string,
  ask: (q: string) => Promise<string>,
): Promise<void> {
  printHeader('Configure AI Tool');

  const tools = getAiTools();
  console.log('Available AI tools:\n');
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const hint = tool.detected ? ' (detected)' : '';
    const type = tool.snippetOnly ? ' [snippet]' : '';
    console.log(`  ${i + 1}. ${tool.name}${hint}${type}`);
  }

  const input = await ask('\nSelect a tool (number) or Enter to skip: ');
  if (!input) return;

  const idx = parseInt(input, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= tools.length) {
    console.log('Invalid selection, skipping.');
    return;
  }

  const tool = tools[idx];
  const entry = buildMcpEntry(configPath);

  if (tool.snippetOnly) {
    console.log(`\nAdd this to your ${tool.name} MCP config:\n`);
    const snippet: McpConfig = { mcpServers: { 'codemode-gateway': entry } };
    console.log(JSON.stringify(snippet, null, 2));
    return;
  }

  // Pick scope if multiple config paths
  let targetPath: string;
  if (tool.configPaths.length === 1) {
    targetPath = tool.configPaths[0].path;
  } else {
    console.log('\nConfig scope:');
    for (let i = 0; i < tool.configPaths.length; i++) {
      console.log(`  ${i + 1}. ${tool.configPaths[i].label} (${tool.configPaths[i].path})`);
    }
    const scopeInput = await ask('Select scope (number): ');
    const scopeIdx = parseInt(scopeInput, 10) - 1;
    if (isNaN(scopeIdx) || scopeIdx < 0 || scopeIdx >= tool.configPaths.length) {
      console.log('Invalid selection, skipping.');
      return;
    }
    targetPath = tool.configPaths[scopeIdx].path;
  }

  // Read existing config if present
  let existing: McpConfig | null = null;
  if (fs.existsSync(targetPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as McpConfig;
    } catch {
      console.log(`Warning: Could not parse existing config at ${targetPath}, will overwrite.`);
    }
  }

  const merged = mergeIntoMcpConfig(existing, entry);
  const content = JSON.stringify(merged, null, 2) + '\n';

  console.log('\nPreview:');
  console.log(content);

  const confirm = await ask('Write this config? (Y/n): ');
  if (confirm.toLowerCase() === 'n') {
    console.log('Skipped.');
    return;
  }

  const backup = writeFileWithBackup(targetPath, content);
  if (backup) {
    console.log(`Backed up existing config to: ${backup}`);
  }
  console.log(`MCP config written to: ${targetPath}`);
}

// ── Main entry point ──

export async function runSetup(): Promise<void> {
  console.log('\n=== Codemode Gateway Setup ===\n');
  console.log('This wizard will help you configure the gateway and connect it to your AI tools.\n');

  const { ask, close } = createPrompt();

  try {
    // Select services
    const selectedNames = await selectServices(ask);
    console.log(`\nSelected: ${selectedNames.join(', ')}`);

    // Configure each service
    const instances = await configureAllServices(selectedNames, ask);

    // Write gateway config
    const configPath = await writeConfigFile(instances, ask);

    // Optionally configure AI tool
    const setupAi = await ask('\nConfigure an AI tool now? (Y/n): ');
    if (setupAi.toLowerCase() !== 'n') {
      await configureAiTool(configPath, ask);
    }

    printHeader('Setup Complete');
    console.log('You can re-run this wizard anytime with: npx codemode-gateway --setup\n');
  } finally {
    close();
  }
}
