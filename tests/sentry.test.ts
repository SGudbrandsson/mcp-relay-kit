import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sentryAdapter } from '../src/services/sentry.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockSentryResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockSentryError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ detail: message }),
  };
}

const config = { token: 'test-token', organization: 'my-org', project: 'my-project' };

describe('Sentry adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = sentryAdapter.actions.map((a) => a.name);
    expect(names).toContain('list_issues');
    expect(names).toContain('get_issue');
    expect(names).toContain('get_issue_events');
    expect(names).toContain('get_event_details');
    expect(names).toContain('resolve_issue');
    expect(names).toContain('unresolve_issue');
    expect(names).toContain('update_issue');
  });

  describe('list_issues', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'list_issues')!;

    it('lists issues for a project', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse([{ id: '1', title: 'Error' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: '1', title: 'Error' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/projects/my-org/my-project/issues/');
    });

    it('passes query parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse([]));
      await action.execute({ query: 'is:unresolved' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('query=is%3Aunresolved');
    });

    it('passes sort parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse([]));
      await action.execute({ sort: 'priority' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('sort=priority');
    });

    it('uses custom baseUrl when configured', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse([]));
      await action.execute({}, { ...config, baseUrl: 'https://sentry.example.com/api/0' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://sentry.example.com/api/0')).toBe(true);
    });
  });

  describe('get_issue', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'get_issue')!;

    it('fetches an issue by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse({ id: '123', title: 'Bug' }));
      const result = await action.execute({ issue_id: '123' }, config);
      expect(result).toEqual({ id: '123', title: 'Bug' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sentry.io/api/0/issues/123/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('throws on missing token', async () => {
      await expect(action.execute({ issue_id: '123' }, {})).rejects.toThrow('Sentry token not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryError(404, 'Not Found'));
      await expect(action.execute({ issue_id: '123' }, config)).rejects.toThrow('Sentry API 404');
    });
  });

  describe('get_issue_events', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'get_issue_events')!;

    it('fetches events for an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse([{ eventID: 'e1' }]));
      const result = await action.execute({ issue_id: '123' }, config);
      expect(result).toEqual([{ eventID: 'e1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/issues/123/events/');
    });
  });

  describe('get_event_details', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'get_event_details')!;

    it('fetches a specific event', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse({ eventID: 'e1', entries: [] }));
      const result = await action.execute({ issue_id: '123', event_id: 'e1' }, config);
      expect(result).toEqual({ eventID: 'e1', entries: [] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/issues/123/events/e1/');
    });
  });

  describe('resolve_issue', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'resolve_issue')!;

    it('marks an issue as resolved', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse({ id: '123', status: 'resolved' }));
      await action.execute({ issue_id: '123' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sentry.io/api/0/issues/123/',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'resolved' }),
        })
      );
    });
  });

  describe('unresolve_issue', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'unresolve_issue')!;

    it('marks an issue as unresolved', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse({ id: '123', status: 'unresolved' }));
      await action.execute({ issue_id: '123' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sentry.io/api/0/issues/123/',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'unresolved' }),
        })
      );
    });
  });

  describe('update_issue', () => {
    const action = sentryAdapter.actions.find((a) => a.name === 'update_issue')!;

    it('updates issue fields', async () => {
      mockFetch.mockResolvedValueOnce(mockSentryResponse({ id: '123' }));
      await action.execute({ issue_id: '123', assignedTo: 'user@example.com', priority: 'high' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sentry.io/api/0/issues/123/',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ assignedTo: 'user@example.com', priority: 'high' }),
        })
      );
    });
  });
});
