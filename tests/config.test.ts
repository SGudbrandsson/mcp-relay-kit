import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const tmpDir = join(tmpdir(), 'mcp-relay-kit-test');
  let configPath: string;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, 'test-config.json');
  });

  afterEach(() => {
    delete process.env.GATEWAY_CONFIG;
    delete process.env.TEST_TOKEN;
    try {
      unlinkSync(configPath);
    } catch {}
  });

  it('returns empty config when GATEWAY_CONFIG not set', () => {
    delete process.env.GATEWAY_CONFIG;
    const config = loadConfig();
    expect(config).toEqual({ services: {} });
  });

  it('loads a valid config file', () => {
    writeFileSync(configPath, JSON.stringify({
      services: {
        asana: { token: 'my-token', workspace: 'ws-123' },
      },
    }));
    process.env.GATEWAY_CONFIG = configPath;
    const config = loadConfig();
    expect(config.services.asana).toEqual({ token: 'my-token', workspace: 'ws-123' });
  });

  it('interpolates environment variables', () => {
    writeFileSync(configPath, JSON.stringify({
      services: {
        asana: { token: '${TEST_TOKEN}' },
      },
    }));
    process.env.GATEWAY_CONFIG = configPath;
    process.env.TEST_TOKEN = 'secret-123';
    const config = loadConfig();
    expect(config.services.asana.token).toBe('secret-123');
  });

  it('replaces missing env vars with empty string', () => {
    writeFileSync(configPath, JSON.stringify({
      services: {
        asana: { token: '${NONEXISTENT_VAR}' },
      },
    }));
    process.env.GATEWAY_CONFIG = configPath;
    const config = loadConfig();
    expect(config.services.asana.token).toBe('');
  });

  it('returns empty config for invalid JSON', () => {
    writeFileSync(configPath, 'not valid json');
    process.env.GATEWAY_CONFIG = configPath;
    const config = loadConfig();
    expect(config).toEqual({ services: {} });
  });

  it('returns empty config for nonexistent file', () => {
    process.env.GATEWAY_CONFIG = '/tmp/nonexistent-mcp-relay-kit-config.json';
    const config = loadConfig();
    expect(config).toEqual({ services: {} });
  });

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

  it('returns undefined mcpServers when not present in config', () => {
    writeFileSync(configPath, JSON.stringify({
      services: { asana: { token: 'tok' } },
    }));
    process.env.GATEWAY_CONFIG = configPath;
    const config = loadConfig();
    expect(config.mcpServers).toBeUndefined();
  });
});
