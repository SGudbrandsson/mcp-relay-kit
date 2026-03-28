import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { posthogAdapter } from '../src/services/posthog.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockPosthogResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function mockPosthogError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ detail: message }),
  };
}

const config = { token: 'test-token', project_id: '12345' };

describe('PostHog adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = posthogAdapter.actions.map((a) => a.name);
    expect(names).toContain('query_events');
    expect(names).toContain('get_person');
    expect(names).toContain('search_persons');
    expect(names).toContain('get_person_events');
    expect(names).toContain('query_insights');
    expect(names).toContain('list_cohorts');
    expect(names).toContain('get_session_recordings');
    expect(names).toContain('get_session_recording');
  });

  describe('query_events', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'query_events')!;

    it('queries events with filters', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [{ event: '$pageview' }] }));
      const result = await action.execute({ event: '$pageview', limit: '10' }, config);
      expect(result).toEqual({ results: [{ event: '$pageview' }] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/events/');
      expect(url).toContain('event=%24pageview');
      expect(url).toContain('limit=10');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({}, {})).rejects.toThrow('PostHog token not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogError(401, 'Unauthorized'));
      await expect(action.execute({}, config)).rejects.toThrow('PostHog API 401');
    });

    it('uses custom baseUrl when configured', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [] }));
      await action.execute({}, { ...config, baseUrl: 'https://posthog.example.com' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://posthog.example.com')).toBe(true);
    });
  });

  describe('get_person', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'get_person')!;

    it('fetches a person by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ id: 'p1', properties: { email: 'a@b.com' } }));
      const result = await action.execute({ person_id: 'p1' }, config);
      expect(result).toEqual({ id: 'p1', properties: { email: 'a@b.com' } });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/persons/p1/');
    });

    it('searches by distinct_id', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [{ id: 'p1' }] }));
      await action.execute({ distinct_id: 'user-abc' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/persons/');
      expect(url).toContain('distinct_id=user-abc');
    });
  });

  describe('search_persons', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'search_persons')!;

    it('searches persons by query', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [{ id: 'p1' }] }));
      await action.execute({ query: 'jane@example.com' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/persons/');
      expect(url).toContain('search=jane%40example.com');
    });
  });

  describe('get_person_events', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'get_person_events')!;

    it('fetches events for a person', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [{ event: '$click' }] }));
      const result = await action.execute({ person_id: 'p1', limit: '5' }, config);
      expect(result).toEqual({ results: [{ event: '$click' }] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/events/');
      expect(url).toContain('person_id=p1');
      expect(url).toContain('limit=5');
    });
  });

  describe('query_insights', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'query_insights')!;

    it('fetches a saved insight by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ id: 42, name: 'Daily actives', result: [] }));
      const result = await action.execute({ insight_id: '42' }, config);
      expect(result).toEqual({ id: 42, name: 'Daily actives', result: [] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/insights/42/');
    });
  });

  describe('list_cohorts', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'list_cohorts')!;

    it('lists cohorts', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [{ id: 1, name: 'Power users' }] }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ results: [{ id: 1, name: 'Power users' }] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/cohorts/');
    });
  });

  describe('get_session_recordings', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'get_session_recordings')!;

    it('lists session recordings with filters', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ results: [{ id: 'rec-1' }] }));
      await action.execute({ person_id: 'p1', date_from: '2026-03-01' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/session_recordings/');
      expect(url).toContain('person_id=p1');
      expect(url).toContain('date_from=2026-03-01');
    });
  });

  describe('get_session_recording', () => {
    const action = posthogAdapter.actions.find((a) => a.name === 'get_session_recording')!;

    it('fetches a specific session recording', async () => {
      mockFetch.mockResolvedValueOnce(mockPosthogResponse({ id: 'rec-1', events: [] }));
      const result = await action.execute({ recording_id: 'rec-1' }, config);
      expect(result).toEqual({ id: 'rec-1', events: [] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/projects/12345/session_recordings/rec-1/');
    });
  });
});
