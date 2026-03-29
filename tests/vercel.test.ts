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
      expect(body.target).toEqual(['production']);
    });

    it('splits comma-separated target into array', async () => {
      mockFetch.mockResolvedValueOnce(mockVercelResponse({ key: 'API_KEY' }));
      await action.execute({ project_id: 'proj-1', key: 'API_KEY', value: 'secret', target: 'production,preview' }, config);
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body as string);
      expect(body.target).toEqual(['production', 'preview']);
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
