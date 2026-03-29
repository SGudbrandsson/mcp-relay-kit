/**
 * @fileoverview PostHog service adapter.
 *
 * Config keys:
 *   - token: PostHog Personal API Key (required)
 *   - project_id: PostHog project ID (required)
 *   - baseUrl: API base URL (optional, defaults to https://us.posthog.com)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://us.posthog.com';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function posthogFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('PostHog token not configured');

  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;
  const projectId = config.project_id as string;
  if (!projectId) throw new Error('PostHog project_id not configured');
  const safeProjectId = validatePathSegment(projectId, 'project_id');

  const res = await fetch(`${baseUrl}/api/projects/${safeProjectId}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  {
    name: 'query_events',
    description: 'Query recent PostHog events, filterable by event type, person, and date range',
    params: {
      event: { type: 'string', description: 'Filter by event name (e.g., "$pageview", "$rageclick")', required: false },
      person_id: { type: 'string', description: 'Filter by person ID', required: false },
      distinct_id: { type: 'string', description: 'Filter by distinct ID', required: false },
      limit: { type: 'string', description: 'Max results to return (default: 100)', required: false },
      before: { type: 'string', description: 'Only events before this ISO date', required: false },
      after: { type: 'string', description: 'Only events after this ISO date', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.event) searchParams.set('event', params.event as string);
      if (params.person_id) searchParams.set('person_id', params.person_id as string);
      if (params.distinct_id) searchParams.set('distinct_id', params.distinct_id as string);
      if (params.limit) searchParams.set('limit', params.limit as string);
      if (params.before) searchParams.set('before', params.before as string);
      if (params.after) searchParams.set('after', params.after as string);
      const qs = searchParams.toString();
      return posthogFetch(`/events/${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_person',
    description: 'Get a PostHog person by ID or distinct_id',
    params: {
      person_id: { type: 'string', description: 'PostHog person ID', required: false },
      distinct_id: { type: 'string', description: 'Distinct ID to search by', required: false },
    },
    execute: async (params, config) => {
      if (params.person_id) {
        return posthogFetch(`/persons/${validatePathSegment(params.person_id, 'person_id')}/`, config);
      }
      if (params.distinct_id) {
        return posthogFetch(`/persons/?distinct_id=${encodeURIComponent(params.distinct_id as string)}`, config);
      }
      throw new Error('Either person_id or distinct_id is required');
    },
  },
  {
    name: 'search_persons',
    description: 'Search PostHog persons by email or properties',
    params: {
      query: { type: 'string', description: 'Search query (email, name, etc.)', required: true },
    },
    execute: async (params, config) => {
      return posthogFetch(`/persons/?search=${encodeURIComponent(params.query as string)}`, config);
    },
  },
  {
    name: 'get_person_events',
    description: 'Get all events for a specific person (activity timeline for debugging)',
    params: {
      person_id: { type: 'string', description: 'Person ID', required: true },
      limit: { type: 'string', description: 'Max results (default: 100)', required: false },
      event: { type: 'string', description: 'Filter by event name', required: false },
      before: { type: 'string', description: 'Only events before this ISO date', required: false },
      after: { type: 'string', description: 'Only events after this ISO date', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      searchParams.set('person_id', params.person_id as string);
      if (params.limit) searchParams.set('limit', params.limit as string);
      if (params.event) searchParams.set('event', params.event as string);
      if (params.before) searchParams.set('before', params.before as string);
      if (params.after) searchParams.set('after', params.after as string);
      return posthogFetch(`/events/?${searchParams}`, config);
    },
  },
  {
    name: 'query_insights',
    description: 'Get a saved PostHog insight (trend, funnel, etc.) by ID',
    params: {
      insight_id: { type: 'string', description: 'Insight ID', required: true },
    },
    execute: async (params, config) => {
      return posthogFetch(`/insights/${validatePathSegment(params.insight_id, 'insight_id')}/`, config);
    },
  },
  {
    name: 'list_cohorts',
    description: 'List all PostHog cohorts',
    params: {},
    execute: async (_params, config) => {
      return posthogFetch('/cohorts/', config);
    },
  },
  {
    name: 'get_session_recordings',
    description: 'Find PostHog session recordings, filterable by person and date range',
    params: {
      person_id: { type: 'string', description: 'Filter by person ID', required: false },
      date_from: { type: 'string', description: 'Start date (ISO format)', required: false },
      date_to: { type: 'string', description: 'End date (ISO format)', required: false },
      limit: { type: 'string', description: 'Max results', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.person_id) searchParams.set('person_id', params.person_id as string);
      if (params.date_from) searchParams.set('date_from', params.date_from as string);
      if (params.date_to) searchParams.set('date_to', params.date_to as string);
      if (params.limit) searchParams.set('limit', params.limit as string);
      const qs = searchParams.toString();
      return posthogFetch(`/session_recordings/${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_session_recording',
    description: 'Get a specific PostHog session recording with events and details',
    params: {
      recording_id: { type: 'string', description: 'Session recording ID', required: true },
    },
    execute: async (params, config) => {
      return posthogFetch(`/session_recordings/${validatePathSegment(params.recording_id, 'recording_id')}/`, config);
    },
  },
];

export const posthogAdapter: ServiceAdapter = {
  name: 'posthog',
  description: 'PostHog product analytics — query events, persons, session recordings, and insights',
  actions,
};
