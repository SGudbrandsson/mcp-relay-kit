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

    it('executes SQL via Management API with read_only defaulting to true', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([{ id: 1 }]));
      await action.execute({ query: 'SELECT 1' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/projects/abcdefghij/database/query');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.query).toBe('SELECT 1');
      expect(body.read_only).toBe(true);
    });

    it('passes read_only flag', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([]));
      await action.execute({ query: 'SELECT 1', read_only: 'true' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.read_only).toBe(true);
    });

    it('sets read_only to false when passed "false"', async () => {
      mockFetch.mockResolvedValueOnce(mockSupabaseResponse([]));
      await action.execute({ query: 'INSERT INTO t VALUES (1)', read_only: 'false' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.read_only).toBe(false);
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

    it('throws on invalid JSON user_metadata', async () => {
      await expect(action.execute({ email: 'a@b.com', user_metadata: 'not-json' }, config)).rejects.toThrow('user_metadata must be valid JSON');
    });

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

    it('rejects path with traversal sequences', async () => {
      await expect(action.execute({ bucket_id: 'photos', path: '../../etc/passwd', expires_in: '3600' }, config)).rejects.toThrow('Invalid path');
    });

    it('throws on non-numeric expires_in', async () => {
      await expect(action.execute({ bucket_id: 'photos', path: 'photo.jpg', expires_in: 'abc' }, config)).rejects.toThrow('expires_in must be a number');
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

    it('rejects path with traversal sequences', async () => {
      const content = Buffer.from('x').toString('base64');
      await expect(action.execute({ bucket_id: 'photos', path: '../etc/passwd', content }, config)).rejects.toThrow('Invalid path');
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

    it('throws on invalid JSON body', async () => {
      await expect(action.execute({ function_slug: 'hello', body: 'not-json' }, config)).rejects.toThrow('body must be valid JSON');
    });

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
