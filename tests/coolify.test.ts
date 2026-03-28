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
