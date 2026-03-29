import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceRegistry } from '../src/registry.js';
import type { ServiceAdapter } from '../src/types.js';

function mockAdapter(name: string, actionNames: string[]): ServiceAdapter {
  return {
    name,
    description: `Mock ${name} service`,
    actions: actionNames.map((actionName) => ({
      name: actionName,
      description: `${actionName} action for ${name}`,
      params: {
        id: { type: 'string' as const, description: 'Resource ID', required: true },
      },
      execute: async (params: Record<string, unknown>) => ({
        called: `${name}.${actionName}`,
        params,
      }),
    })),
  };
}

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  describe('register', () => {
    it('registers a service adapter', () => {
      registry.register(mockAdapter('asana', ['get_task']), { token: 'test' });
      expect(registry.has('asana')).toBe(true);
      expect(registry.serviceNames).toEqual(['asana']);
    });

    it('registers multiple adapters', () => {
      registry.register(mockAdapter('asana', ['get_task']), { token: 'a' });
      registry.register(mockAdapter('slack', ['post_message']), { token: 'b' });
      expect(registry.serviceNames).toEqual(['asana', 'slack']);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(mockAdapter('asana', ['get_task', 'update_task', 'post_comment']), { token: 'a' });
      registry.register(mockAdapter('slack', ['post_message', 'list_channels']), { token: 'b' });
    });

    it('returns all actions for empty query', () => {
      const results = registry.search('');
      expect(results).toHaveLength(5);
    });

    it('finds actions by service name', () => {
      const results = registry.search('asana');
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.service === 'asana')).toBe(true);
    });

    it('finds actions by action name', () => {
      const results = registry.search('post');
      expect(results).toHaveLength(2); // post_comment + post_message
    });

    it('ranks by match score', () => {
      const results = registry.search('asana task');
      // get_task and update_task match both "asana" + "task"
      expect(results[0].action).toMatch(/task/);
      expect(results[1].action).toMatch(/task/);
    });

    it('returns empty for no match', () => {
      const results = registry.search('nonexistent_service');
      expect(results).toHaveLength(0);
    });

    it('includes param schemas in results', () => {
      const results = registry.search('get_task');
      expect(results[0].params.id).toEqual({
        type: 'string',
        description: 'Resource ID',
      });
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      registry.register(mockAdapter('asana', ['get_task']), { token: 'test-token' });
    });

    it('executes a valid action', async () => {
      const result = await registry.execute('asana', 'get_task', { id: '123' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ called: 'asana.get_task', params: { id: '123' } });
    });

    it('returns error for unknown service', async () => {
      const result = await registry.execute('unknown', 'get_task', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown service');
      expect(result.error).toContain('asana');
    });

    it('returns error for unknown action', async () => {
      const result = await registry.execute('asana', 'unknown_action', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action');
      expect(result.error).toContain('get_task');
    });

    it('validates required params', async () => {
      const result = await registry.execute('asana', 'get_task', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter: id');
    });

    it('catches execution errors', async () => {
      const adapter: ServiceAdapter = {
        name: 'failing',
        description: 'Always fails',
        actions: [
          {
            name: 'boom',
            description: 'Throws an error',
            params: {},
            execute: async () => {
              throw new Error('Something went wrong');
            },
          },
        ],
      };
      registry.register(adapter, {});
      const result = await registry.execute('failing', 'boom', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });
  });

  describe('multi-instance', () => {
    it('registers the same adapter under different instance names', () => {
      const adapter = mockAdapter('sentry', ['list_issues']);
      registry.register(adapter, { token: 'prod-token', org: 'prod' }, 'sentry:production');
      registry.register(adapter, { token: 'stg-token', org: 'staging' }, 'sentry:staging');
      expect(registry.serviceNames).toEqual(['sentry:production', 'sentry:staging']);
      expect(registry.has('sentry:production')).toBe(true);
      expect(registry.has('sentry:staging')).toBe(true);
      expect(registry.has('sentry')).toBe(false);
    });

    it('search returns instance names, not adapter names', () => {
      const adapter = mockAdapter('sentry', ['list_issues']);
      registry.register(adapter, {}, 'sentry:production');
      registry.register(adapter, {}, 'sentry:staging');
      const results = registry.search('sentry');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.service)).toEqual(['sentry:production', 'sentry:staging']);
    });

    it('search matches on instance label', () => {
      const adapter = mockAdapter('sentry', ['list_issues']);
      registry.register(adapter, {}, 'sentry:production');
      registry.register(adapter, {}, 'sentry:staging');
      const results = registry.search('staging');
      expect(results).toHaveLength(1);
      expect(results[0].service).toBe('sentry:staging');
    });

    it('execute uses the correct config for each instance', async () => {
      const adapter: ServiceAdapter = {
        name: 'sentry',
        description: 'Mock sentry',
        actions: [{
          name: 'get_org',
          description: 'Returns the org from config',
          params: {},
          execute: async (_params, config) => ({ org: config.org }),
        }],
      };
      registry.register(adapter, { org: 'prod-org' }, 'sentry:production');
      registry.register(adapter, { org: 'staging-org' }, 'sentry:staging');

      const prod = await registry.execute('sentry:production', 'get_org', {});
      expect(prod.data).toEqual({ org: 'prod-org' });

      const stg = await registry.execute('sentry:staging', 'get_org', {});
      expect(stg.data).toEqual({ org: 'staging-org' });
    });

    it('plain name still works when no instance name provided', () => {
      registry.register(mockAdapter('asana', ['get_task']), { token: 'test' });
      expect(registry.has('asana')).toBe(true);
      expect(registry.serviceNames).toEqual(['asana']);
    });
  });

  describe('listAll', () => {
    it('returns empty array when no services registered', () => {
      expect(registry.listAll()).toEqual([]);
    });

    it('lists all actions from all services', () => {
      registry.register(mockAdapter('a', ['x', 'y']), {});
      registry.register(mockAdapter('b', ['z']), {});
      const all = registry.listAll();
      expect(all).toHaveLength(3);
      expect(all.map((r) => `${r.service}.${r.action}`)).toEqual(['a.x', 'a.y', 'b.z']);
    });
  });
});
