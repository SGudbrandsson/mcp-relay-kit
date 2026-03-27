import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asanaAdapter } from '../src/services/asana.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockAsanaResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  };
}

function mockAsanaError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ errors: [{ message }] }),
  };
}

const config = { token: 'test-token', workspace: 'ws-123' };

describe('Asana adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = asanaAdapter.actions.map((a) => a.name);
    expect(names).toContain('get_task');
    expect(names).toContain('update_task');
    expect(names).toContain('create_task');
    expect(names).toContain('post_comment');
    expect(names).toContain('search_tasks');
    expect(names).toContain('list_project_tasks');
  });

  describe('get_task', () => {
    const action = asanaAdapter.actions.find((a) => a.name === 'get_task')!;

    it('fetches a task by GID', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaResponse({ gid: '123', name: 'Test task' }));
      const result = await action.execute({ task_id: '123' }, config);
      expect(result).toEqual({ gid: '123', name: 'Test task' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('throws on missing token', async () => {
      await expect(action.execute({ task_id: '123' }, {})).rejects.toThrow('Asana token not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaError(404, 'Not Found'));
      await expect(action.execute({ task_id: '123' }, config)).rejects.toThrow('Asana API 404');
    });
  });

  describe('update_task', () => {
    const action = asanaAdapter.actions.find((a) => a.name === 'update_task')!;

    it('sends PUT with update data', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaResponse({ gid: '123', completed: true }));
      await action.execute({ task_id: '123', completed: true, name: 'Updated' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ data: { completed: true, name: 'Updated' } }),
        })
      );
    });
  });

  describe('create_task', () => {
    const action = asanaAdapter.actions.find((a) => a.name === 'create_task')!;

    it('creates a task in a project', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaResponse({ gid: '456', name: 'New task' }));
      await action.execute({ name: 'New task', project_id: 'proj-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              name: 'New task',
              projects: ['proj-1'],
              workspace: 'ws-123',
            },
          }),
        })
      );
    });
  });

  describe('post_comment', () => {
    const action = asanaAdapter.actions.find((a) => a.name === 'post_comment')!;

    it('posts a comment on a task', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaResponse({ gid: '789', text: 'Done!' }));
      await action.execute({ task_id: '123', text: 'Done!' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://app.asana.com/api/1.0/tasks/123/stories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: { text: 'Done!' } }),
        })
      );
    });
  });

  describe('search_tasks', () => {
    const action = asanaAdapter.actions.find((a) => a.name === 'search_tasks')!;

    it('searches tasks in workspace', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaResponse([{ gid: '1', name: 'Found' }]));
      const result = await action.execute({ query: 'bug fix' }, config);
      expect(result).toEqual([{ gid: '1', name: 'Found' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/workspaces/ws-123/typeahead');
      expect(url).toContain('text=bug+fix');
    });

    it('throws without workspace config', async () => {
      await expect(action.execute({ query: 'test' }, { token: 'x' })).rejects.toThrow(
        'Asana workspace not configured'
      );
    });
  });

  describe('list_project_tasks', () => {
    const action = asanaAdapter.actions.find((a) => a.name === 'list_project_tasks')!;

    it('lists incomplete tasks by default', async () => {
      mockFetch.mockResolvedValueOnce(mockAsanaResponse([{ gid: '1', name: 'Open task' }]));
      await action.execute({ project_id: 'proj-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/projects/proj-1/tasks');
      expect(url).toContain('completed_since=now');
    });
  });
});
