import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveValue, generateBackupPath, mergeIntoMcpConfig, writeFileWithBackup } from '../src/setup.js';

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
  it('treats bare $ as literal', () => {
    expect(resolveValue('$')).toBe('$');
  });
});

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

describe('mergeIntoMcpConfig', () => {
  it('creates new config when none exists', () => {
    const result = mergeIntoMcpConfig(null, {
      command: 'node', args: ['/path/to/server.js'],
      env: { GATEWAY_CONFIG: '/path/to/config.json' },
    });
    expect(result).toEqual({
      mcpServers: {
        'codemode-gateway': {
          command: 'node', args: ['/path/to/server.js'],
          env: { GATEWAY_CONFIG: '/path/to/config.json' },
        },
      },
    });
  });
  it('preserves existing MCP servers', () => {
    const existing = { mcpServers: { 'other-server': { command: 'other', args: [] } } };
    const result = mergeIntoMcpConfig(existing, {
      command: 'node', args: ['/path/to/server.js'],
      env: { GATEWAY_CONFIG: '/path/to/config.json' },
    });
    expect(result.mcpServers['other-server']).toEqual({ command: 'other', args: [] });
    expect(result.mcpServers['codemode-gateway']).toBeDefined();
  });
  it('overwrites existing gateway entry', () => {
    const existing = { mcpServers: { 'codemode-gateway': { command: 'old', args: ['/old'] } } };
    const result = mergeIntoMcpConfig(existing, {
      command: 'node', args: ['/new/server.js'],
      env: { GATEWAY_CONFIG: '/new/config.json' },
    });
    expect(result.mcpServers['codemode-gateway'].command).toBe('node');
    expect(result.mcpServers['codemode-gateway'].args).toEqual(['/new/server.js']);
  });
});

describe('writeFileWithBackup', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to a new file in a new directory and returns null', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-'));
    const filePath = path.join(tmpDir, 'subdir', 'config.json');
    const content = '{"services":{}}';

    const result = writeFileWithBackup(filePath, content);

    expect(result).toBeNull();
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('creates a backup and writes new content when file already exists', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-'));
    const filePath = path.join(tmpDir, 'config.json');
    const originalContent = '{"original":true}';
    const newContent = '{"updated":true}';
    fs.writeFileSync(filePath, originalContent, 'utf-8');

    const backupPath = writeFileWithBackup(filePath, newContent);

    expect(backupPath).not.toBeNull();
    expect(backupPath).toMatch(/config\.json\.bak\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    expect(fs.readFileSync(backupPath!, 'utf-8')).toBe(originalContent);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(newContent);
  });
});
