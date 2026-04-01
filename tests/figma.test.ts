import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { figmaAdapter } from '../src/services/figma.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockFigmaResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockFigmaError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ err: message }),
  };
}

const config = { token: 'test-token', team_id: 'team-123' };

function findAction(name: string) {
  return figmaAdapter.actions.find((a) => a.name === name)!;
}

describe('Figma adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = figmaAdapter.actions.map((a) => a.name);
    expect(names).toContain('get_file');
    expect(names).toContain('get_file_nodes');
    expect(names).toContain('get_images');
    expect(names).toContain('get_comments');
    expect(names).toContain('post_comment');
    expect(names).toContain('get_file_components');
    expect(names).toContain('get_file_styles');
    expect(names).toContain('get_team_projects');
    expect(names).toContain('get_project_files');
    expect(names).toContain('get_team_components');
    expect(names).toContain('get_team_styles');
    expect(names).toContain('get_image_fills');
    expect(names).toContain('get_file_versions');
  });

  it('uses X-FIGMA-TOKEN header', async () => {
    mockFetch.mockResolvedValueOnce(mockFigmaResponse({ document: {} }));
    await findAction('get_file').execute({ file_key: 'abc123' }, config);
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-FIGMA-TOKEN']).toBe('test-token');
  });

  it('throws when token is missing', async () => {
    await expect(findAction('get_file').execute({ file_key: 'abc' }, {})).rejects.toThrow(
      'Figma token not configured'
    );
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce(mockFigmaError(403, 'Forbidden'));
    await expect(findAction('get_file').execute({ file_key: 'abc' }, config)).rejects.toThrow(
      'Figma API 403'
    );
  });

  describe('get_file', () => {
    const action = findAction('get_file');

    it('fetches a file by key', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ document: { id: '0:0' } }));
      const result = await action.execute({ file_key: 'abc123' }, config);
      expect(result).toEqual({ document: { id: '0:0' } });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc123');
    });

    it('passes depth parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({}));
      await action.execute({ file_key: 'abc', depth: 2 }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('depth=2');
    });

    it('rejects path traversal in file_key', async () => {
      await expect(action.execute({ file_key: '../etc' }, config)).rejects.toThrow(
        'Invalid file_key'
      );
    });

    it('passes branch_data parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({}));
      await action.execute({ file_key: 'abc', branch_data: true }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('branch_data=true');
    });
  });

  describe('get_file_nodes', () => {
    const action = findAction('get_file_nodes');

    it('fetches specific nodes', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ nodes: { '1:2': {} } }));
      await action.execute({ file_key: 'abc', ids: '1:2,3:4' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc/nodes');
      expect(url).toContain('ids=');
    });

    it('rejects path traversal in file_key', async () => {
      await expect(action.execute({ file_key: '../etc', ids: '1:2' }, config)).rejects.toThrow(
        'Invalid file_key'
      );
    });
  });

  describe('get_images', () => {
    const action = findAction('get_images');

    it('renders nodes as images', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ images: { '1:2': 'https://...' } }));
      await action.execute({ file_key: 'abc', ids: '1:2', format: 'svg' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/images/abc');
      expect(url).toContain('format=svg');
    });

    it('rejects scale out of range', async () => {
      await expect(
        action.execute({ file_key: 'abc', ids: '1:2', scale: 100 }, config)
      ).rejects.toThrow('scale must be between 0.01 and 4');
    });

    it('passes valid scale parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ images: {} }));
      await action.execute({ file_key: 'abc', ids: '1:2', scale: 2 }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('scale=2');
    });

    it('accepts boundary scale values', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ images: {} }));
      await action.execute({ file_key: 'abc', ids: '1:2', scale: 0.01 }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('scale=0.01');

      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ images: {} }));
      await action.execute({ file_key: 'abc', ids: '1:2', scale: 4 }, config);
      const url2 = mockFetch.mock.calls[1][0] as string;
      expect(url2).toContain('scale=4');
    });
  });

  describe('get_comments', () => {
    const action = findAction('get_comments');

    it('fetches comments', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ comments: [] }));
      await action.execute({ file_key: 'abc' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc/comments');
    });

    it('passes as_md parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ comments: [] }));
      await action.execute({ file_key: 'abc', as_md: true }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('as_md=true');
    });
  });

  describe('post_comment', () => {
    const action = findAction('post_comment');

    it('posts a comment', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ id: 'comment-1' }));
      await action.execute({ file_key: 'abc', message: 'Looks good!' }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/files/abc/comments');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ message: 'Looks good!' });
    });

    it('supports reply to existing comment', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ id: 'comment-2' }));
      await action.execute({ file_key: 'abc', message: 'Reply', comment_id: 'c1' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.comment_id).toBe('c1');
    });

    it('rejects path traversal in file_key', async () => {
      await expect(
        action.execute({ file_key: '../etc', message: 'test' }, config)
      ).rejects.toThrow('Invalid file_key');
    });
  });

  describe('get_file_components', () => {
    it('fetches components for a file', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { components: [] } }));
      await findAction('get_file_components').execute({ file_key: 'abc' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc/components');
    });
  });

  describe('get_file_styles', () => {
    const action = findAction('get_file_styles');

    it('fetches styles for a file', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { styles: [] } }));
      const result = await action.execute({ file_key: 'abc' }, config);
      expect(result).toEqual({ meta: { styles: [] } });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc/styles');
    });
  });

  describe('get_image_fills', () => {
    const action = findAction('get_image_fills');

    it('fetches image fill URLs for a file', async () => {
      const data = { meta: { images: { 'img1': 'https://s3.amazonaws.com/...' } } };
      mockFetch.mockResolvedValueOnce(mockFigmaResponse(data));
      const result = await action.execute({ file_key: 'abc' }, config);
      expect(result).toEqual(data);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc/images');
    });

    it('rejects path traversal in file_key', async () => {
      await expect(action.execute({ file_key: '../etc' }, config)).rejects.toThrow(
        'Invalid file_key'
      );
    });
  });

  describe('get_team_projects', () => {
    const action = findAction('get_team_projects');

    it('uses team_id from config', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ projects: [] }));
      await action.execute({}, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/team-123/projects');
    });

    it('overrides team_id from params', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ projects: [] }));
      await action.execute({ team_id: 'other-team' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/other-team/projects');
    });

    it('throws when no team_id available', async () => {
      await expect(action.execute({}, { token: 'test' })).rejects.toThrow('team_id is required');
    });
  });

  describe('get_project_files', () => {
    const action = findAction('get_project_files');

    it('lists files in a project', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ files: [] }));
      await action.execute({ project_id: 'p1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/projects/p1/files');
    });

    it('passes branch_data parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ files: [] }));
      await action.execute({ project_id: 'p1', branch_data: true }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('branch_data=true');
    });
  });

  describe('get_team_components', () => {
    const action = findAction('get_team_components');

    it('fetches team components with pagination', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { components: [] } }));
      await action.execute({ page_size: 10, cursor: 'abc' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/team-123/components');
      expect(url).toContain('page_size=10');
      expect(url).toContain('after=abc');
    });

    it('overrides team_id from params', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { components: [] } }));
      await action.execute({ team_id: 'other-team' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/other-team/components');
    });

    it('throws when no team_id available', async () => {
      await expect(action.execute({}, { token: 'test' })).rejects.toThrow('team_id is required');
    });
  });

  describe('get_team_styles', () => {
    const action = findAction('get_team_styles');

    it('fetches team styles with pagination', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { styles: [] } }));
      await action.execute({ page_size: 5, cursor: 'xyz' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/team-123/styles');
      expect(url).toContain('page_size=5');
      expect(url).toContain('after=xyz');
    });

    it('uses team_id from config as fallback', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { styles: [] } }));
      await action.execute({}, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/team-123/styles');
    });

    it('overrides team_id from params', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ meta: { styles: [] } }));
      await action.execute({ team_id: 'other-team' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/teams/other-team/styles');
    });

    it('throws when no team_id available', async () => {
      await expect(action.execute({}, { token: 'test' })).rejects.toThrow('team_id is required');
    });
  });

  describe('get_file_versions', () => {
    const action = findAction('get_file_versions');

    it('fetches version history', async () => {
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ versions: [] }));
      await action.execute({ file_key: 'abc' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/files/abc/versions');
    });

    it('rejects path traversal in file_key', async () => {
      await expect(action.execute({ file_key: '../etc' }, config)).rejects.toThrow(
        'Invalid file_key'
      );
    });
  });

  describe('custom baseUrl', () => {
    it('uses baseUrl from config instead of default', async () => {
      const customConfig = { token: 'test-token', baseUrl: 'https://figma.internal.co/v1' };
      mockFetch.mockResolvedValueOnce(mockFigmaResponse({ document: {} }));
      await findAction('get_file').execute({ file_key: 'abc' }, customConfig);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('https://figma.internal.co/v1/files/abc');
    });
  });
});
