/**
 * @fileoverview Sentry service adapter.
 *
 * Config keys:
 *   - token: Sentry Auth Token (required)
 *   - organization: Sentry organization slug (required for project-scoped endpoints)
 *   - project: Sentry project slug (required for project-scoped endpoints)
 *   - baseUrl: API base URL (optional, defaults to https://sentry.io/api/0)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://sentry.io/api/0';

async function sentryFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Sentry token not configured');

  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  {
    name: 'list_issues',
    description: 'List issues for a Sentry project. Supports Sentry search syntax in query (e.g., "is:unresolved level:error first-seen:-24h")',
    params: {
      query: { type: 'string', description: 'Sentry search query (e.g., "is:unresolved", "TypeError")', required: false },
      sort: { type: 'string', description: 'Sort order', required: false, enum: ['date', 'priority', 'freq', 'new'] },
    },
    execute: async (params, config) => {
      const org = config.organization as string;
      const project = config.project as string;
      const searchParams = new URLSearchParams();
      if (params.query) searchParams.set('query', params.query as string);
      if (params.sort) searchParams.set('sort', params.sort as string);
      const qs = searchParams.toString();
      return sentryFetch(`/projects/${org}/${project}/issues/${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_issue',
    description: 'Get details of a specific Sentry issue by ID',
    params: {
      issue_id: { type: 'string', description: 'Issue ID', required: true },
    },
    execute: async (params, config) => {
      return sentryFetch(`/issues/${params.issue_id}/`, config);
    },
  },
  {
    name: 'get_issue_events',
    description: 'Get events (occurrences) for a Sentry issue',
    params: {
      issue_id: { type: 'string', description: 'Issue ID', required: true },
    },
    execute: async (params, config) => {
      return sentryFetch(`/issues/${params.issue_id}/events/`, config);
    },
  },
  {
    name: 'get_event_details',
    description: 'Get full event details including stack trace for a specific event',
    params: {
      issue_id: { type: 'string', description: 'Issue ID', required: true },
      event_id: { type: 'string', description: 'Event ID', required: true },
    },
    execute: async (params, config) => {
      return sentryFetch(`/issues/${params.issue_id}/events/${params.event_id}/`, config);
    },
  },
  {
    name: 'resolve_issue',
    description: 'Mark a Sentry issue as resolved',
    params: {
      issue_id: { type: 'string', description: 'Issue ID', required: true },
    },
    execute: async (params, config) => {
      return sentryFetch(`/issues/${params.issue_id}/`, config, {
        method: 'PUT',
        body: { status: 'resolved' },
      });
    },
  },
  {
    name: 'unresolve_issue',
    description: 'Reopen a resolved Sentry issue',
    params: {
      issue_id: { type: 'string', description: 'Issue ID', required: true },
    },
    execute: async (params, config) => {
      return sentryFetch(`/issues/${params.issue_id}/`, config, {
        method: 'PUT',
        body: { status: 'unresolved' },
      });
    },
  },
  {
    name: 'update_issue',
    description: 'Update a Sentry issue (assign, change status, set priority)',
    params: {
      issue_id: { type: 'string', description: 'Issue ID', required: true },
      assignedTo: { type: 'string', description: 'User email or "me" or team slug', required: false },
      status: { type: 'string', description: 'Issue status', required: false, enum: ['resolved', 'unresolved', 'ignored'] },
      priority: { type: 'string', description: 'Issue priority', required: false },
    },
    execute: async (params, config) => {
      const { issue_id, ...data } = params;
      return sentryFetch(`/issues/${issue_id}/`, config, {
        method: 'PUT',
        body: data,
      });
    },
  },
];

export const sentryAdapter: ServiceAdapter = {
  name: 'sentry',
  description: 'Sentry error tracking — list, inspect, and manage issues and events',
  actions,
};
