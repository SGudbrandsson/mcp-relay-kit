# Sentry, Linear, and PostHog Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry, Linear, and PostHog service adapters to the MCP gateway, following the existing Asana adapter pattern.

**Architecture:** Each adapter is a single file in `src/services/` with a helper fetch function and inline `ServiceAction[]`. All three are registered in `src/services/index.ts` and auto-wired when config is present.

**Tech Stack:** TypeScript, native `fetch`, Vitest for tests. Linear uses GraphQL; Sentry and PostHog use REST.

---

### Task 1: Sentry Adapter — Tests

**Files:**
- Create: `tests/sentry.test.ts`

- [ ] **Step 1: Write the test file with all Sentry adapter tests**

```typescript
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
      expect(url).toStartWith('https://sentry.example.com/api/0');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sentry.test.ts`
Expected: FAIL — cannot resolve `../src/services/sentry.js`

- [ ] **Step 3: Commit**

```bash
git add tests/sentry.test.ts
git commit -m "test: add Sentry adapter tests"
```

---

### Task 2: Sentry Adapter — Implementation

**Files:**
- Create: `src/services/sentry.ts`

- [ ] **Step 1: Write the Sentry adapter**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/sentry.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/sentry.ts
git commit -m "feat: add Sentry service adapter"
```

---

### Task 3: Linear Adapter — Tests

**Files:**
- Create: `tests/linear.test.ts`

- [ ] **Step 1: Write the test file with all Linear adapter tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { linearAdapter } from '../src/services/linear.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockLinearResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  };
}

function mockLinearError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ errors: [{ message }] }),
  };
}

const config = { token: 'test-token' };

describe('Linear adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = linearAdapter.actions.map((a) => a.name);
    expect(names).toContain('search_issues');
    expect(names).toContain('get_issue');
    expect(names).toContain('create_issue');
    expect(names).toContain('update_issue');
    expect(names).toContain('delete_issue');
    expect(names).toContain('list_teams');
    expect(names).toContain('list_projects');
    expect(names).toContain('list_workflow_states');
    expect(names).toContain('add_comment');
    expect(names).toContain('list_labels');
  });

  describe('search_issues', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'search_issues')!;

    it('searches issues by query', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueSearch: { nodes: [{ id: '1', title: 'Bug' }] },
      }));
      const result = await action.execute({ query: 'login bug' }, config);
      expect(result).toEqual({ issueSearch: { nodes: [{ id: '1', title: 'Bug' }] } });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.linear.app/graphql');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers.Authorization).toBe('Bearer test-token');
      const body = JSON.parse(call[1].body);
      expect(body.variables.query).toBe('login bug');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({ query: 'test' }, {})).rejects.toThrow('Linear token not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearError(401, 'Unauthorized'));
      await expect(action.execute({ query: 'test' }, config)).rejects.toThrow('Linear API 401');
    });

    it('uses custom baseUrl when configured', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({ issueSearch: { nodes: [] } }));
      await action.execute({ query: 'test' }, { ...config, baseUrl: 'https://linear.example.com' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://linear.example.com/graphql');
    });
  });

  describe('get_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'get_issue')!;

    it('fetches an issue by identifier', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issue: { id: '1', title: 'Bug', identifier: 'ENG-123' },
      }));
      const result = await action.execute({ issue_id: 'ENG-123' }, config);
      expect(result).toEqual({ issue: { id: '1', title: 'Bug', identifier: 'ENG-123' } });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.id).toBe('ENG-123');
    });
  });

  describe('create_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'create_issue')!;

    it('creates an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueCreate: { success: true, issue: { id: '1', title: 'New bug' } },
      }));
      await action.execute({ title: 'New bug', team_id: 'team-1', priority: '2' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.input.title).toBe('New bug');
      expect(body.variables.input.teamId).toBe('team-1');
      expect(body.variables.input.priority).toBe(2);
    });
  });

  describe('update_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'update_issue')!;

    it('updates an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueUpdate: { success: true, issue: { id: '1', title: 'Updated' } },
      }));
      await action.execute({ issue_id: 'issue-1', title: 'Updated', priority: '1' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.id).toBe('issue-1');
      expect(body.variables.input.title).toBe('Updated');
      expect(body.variables.input.priority).toBe(1);
    });
  });

  describe('delete_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'delete_issue')!;

    it('archives an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueArchive: { success: true },
      }));
      await action.execute({ issue_id: 'issue-1' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.id).toBe('issue-1');
      expect(body.query).toContain('issueArchive');
    });
  });

  describe('list_teams', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_teams')!;

    it('lists all teams', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        teams: { nodes: [{ id: '1', name: 'Engineering' }] },
      }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ teams: { nodes: [{ id: '1', name: 'Engineering' }] } });
    });
  });

  describe('list_projects', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_projects')!;

    it('lists all projects', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        projects: { nodes: [{ id: '1', name: 'Project A' }] },
      }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ projects: { nodes: [{ id: '1', name: 'Project A' }] } });
    });
  });

  describe('list_workflow_states', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_workflow_states')!;

    it('lists workflow states for a team', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        workflowStates: { nodes: [{ id: '1', name: 'In Progress', type: 'started' }] },
      }));
      const result = await action.execute({ team_id: 'team-1' }, config);
      expect(result).toEqual({ workflowStates: { nodes: [{ id: '1', name: 'In Progress', type: 'started' }] } });
    });
  });

  describe('add_comment', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'add_comment')!;

    it('adds a comment to an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        commentCreate: { success: true, comment: { id: 'c1', body: 'Fixed' } },
      }));
      await action.execute({ issue_id: 'issue-1', body: 'Fixed' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.input.issueId).toBe('issue-1');
      expect(body.variables.input.body).toBe('Fixed');
    });
  });

  describe('list_labels', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_labels')!;

    it('lists all labels', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueLabels: { nodes: [{ id: '1', name: 'Bug', color: '#red' }] },
      }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ issueLabels: { nodes: [{ id: '1', name: 'Bug', color: '#red' }] } });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/linear.test.ts`
Expected: FAIL — cannot resolve `../src/services/linear.js`

- [ ] **Step 3: Commit**

```bash
git add tests/linear.test.ts
git commit -m "test: add Linear adapter tests"
```

---

### Task 4: Linear Adapter — Implementation

**Files:**
- Create: `src/services/linear.ts`

- [ ] **Step 1: Write the Linear adapter**

```typescript
/**
 * @fileoverview Linear service adapter.
 *
 * Config keys:
 *   - token: Linear API Key (required)
 *   - baseUrl: API base URL (optional, defaults to https://api.linear.app)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.linear.app';

async function linearGraphQL(
  query: string,
  variables: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Linear token not configured');

  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;

  const res = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data?: unknown; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

const actions: ServiceAction[] = [
  {
    name: 'search_issues',
    description: 'Search Linear issues by text query',
    params: {
      query: { type: 'string', description: 'Search text', required: true },
      team_id: { type: 'string', description: 'Filter by team ID', required: false },
    },
    execute: async (params, config) => {
      const filter = params.team_id ? `, filter: { team: { id: { eq: "${params.team_id}" } } }` : '';
      return linearGraphQL(
        `query ($query: String!) {
          issueSearch(query: $query, first: 50${filter}) {
            nodes {
              id identifier title state { name } priority assignee { name } createdAt updatedAt
            }
          }
        }`,
        { query: params.query },
        config
      );
    },
  },
  {
    name: 'get_issue',
    description: 'Get details of a Linear issue by identifier (e.g., "ENG-123")',
    params: {
      issue_id: { type: 'string', description: 'Issue identifier (e.g., "ENG-123") or UUID', required: true },
    },
    execute: async (params, config) => {
      return linearGraphQL(
        `query ($id: String!) {
          issue(id: $id) {
            id identifier title description state { name } priority priorityLabel
            assignee { name email } labels { nodes { name color } }
            project { name } team { name } createdAt updatedAt completedAt
            url
          }
        }`,
        { id: params.issue_id },
        config
      );
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new Linear issue',
    params: {
      title: { type: 'string', description: 'Issue title', required: true },
      team_id: { type: 'string', description: 'Team ID (use list_teams to find)', required: true },
      description: { type: 'string', description: 'Issue description (markdown)', required: false },
      priority: { type: 'string', description: 'Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low', required: false, enum: ['0', '1', '2', '3', '4'] },
      assignee_id: { type: 'string', description: 'Assignee user ID', required: false },
      state_id: { type: 'string', description: 'Workflow state ID (use list_workflow_states to find)', required: false },
      label_ids: { type: 'string', description: 'Comma-separated label IDs', required: false },
    },
    execute: async (params, config) => {
      const input: Record<string, unknown> = {
        title: params.title,
        teamId: params.team_id,
      };
      if (params.description) input.description = params.description;
      if (params.priority) input.priority = parseInt(params.priority as string, 10);
      if (params.assignee_id) input.assigneeId = params.assignee_id;
      if (params.state_id) input.stateId = params.state_id;
      if (params.label_ids) input.labelIds = (params.label_ids as string).split(',').map((s) => s.trim());

      return linearGraphQL(
        `mutation ($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url }
          }
        }`,
        { input },
        config
      );
    },
  },
  {
    name: 'update_issue',
    description: 'Update an existing Linear issue',
    params: {
      issue_id: { type: 'string', description: 'Issue ID or identifier', required: true },
      title: { type: 'string', description: 'New title', required: false },
      description: { type: 'string', description: 'New description (markdown)', required: false },
      priority: { type: 'string', description: 'Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low', required: false, enum: ['0', '1', '2', '3', '4'] },
      assignee_id: { type: 'string', description: 'Assignee user ID', required: false },
      state_id: { type: 'string', description: 'Workflow state ID', required: false },
    },
    execute: async (params, config) => {
      const input: Record<string, unknown> = {};
      if (params.title) input.title = params.title;
      if (params.description) input.description = params.description;
      if (params.priority) input.priority = parseInt(params.priority as string, 10);
      if (params.assignee_id) input.assigneeId = params.assignee_id;
      if (params.state_id) input.stateId = params.state_id;

      return linearGraphQL(
        `mutation ($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue { id identifier title state { name } url }
          }
        }`,
        { id: params.issue_id, input },
        config
      );
    },
  },
  {
    name: 'delete_issue',
    description: 'Archive a Linear issue (Linear archives rather than hard-deletes)',
    params: {
      issue_id: { type: 'string', description: 'Issue ID or identifier', required: true },
    },
    execute: async (params, config) => {
      return linearGraphQL(
        `mutation ($id: String!) {
          issueArchive(id: $id) {
            success
          }
        }`,
        { id: params.issue_id },
        config
      );
    },
  },
  {
    name: 'list_teams',
    description: 'List all Linear teams (use to find team IDs for creating issues)',
    params: {},
    execute: async (_params, config) => {
      return linearGraphQL(
        `query {
          teams {
            nodes { id name key description }
          }
        }`,
        {},
        config
      );
    },
  },
  {
    name: 'list_projects',
    description: 'List Linear projects, optionally filtered by team',
    params: {
      team_id: { type: 'string', description: 'Filter by team ID', required: false },
    },
    execute: async (params, config) => {
      const filter = params.team_id ? `(filter: { accessibleTeams: { some: { id: { eq: "${params.team_id}" } } } })` : '';
      return linearGraphQL(
        `query {
          projects${filter} {
            nodes { id name state startDate targetDate }
          }
        }`,
        {},
        config
      );
    },
  },
  {
    name: 'list_workflow_states',
    description: 'List workflow states for a team (To Do, In Progress, Done, etc.)',
    params: {
      team_id: { type: 'string', description: 'Team ID', required: true },
    },
    execute: async (params, config) => {
      return linearGraphQL(
        `query ($teamId: String!) {
          workflowStates(filter: { team: { id: { eq: $teamId } } }) {
            nodes { id name type position }
          }
        }`,
        { teamId: params.team_id },
        config
      );
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a Linear issue (supports markdown)',
    params: {
      issue_id: { type: 'string', description: 'Issue ID or identifier', required: true },
      body: { type: 'string', description: 'Comment body (markdown)', required: true },
    },
    execute: async (params, config) => {
      return linearGraphQL(
        `mutation ($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment { id body createdAt user { name } }
          }
        }`,
        { input: { issueId: params.issue_id, body: params.body } },
        config
      );
    },
  },
  {
    name: 'list_labels',
    description: 'List available issue labels, optionally filtered by team',
    params: {
      team_id: { type: 'string', description: 'Filter by team ID', required: false },
    },
    execute: async (params, config) => {
      const filter = params.team_id ? `(filter: { team: { id: { eq: "${params.team_id}" } } } )` : '';
      return linearGraphQL(
        `query {
          issueLabels${filter} {
            nodes { id name color }
          }
        }`,
        {},
        config
      );
    },
  },
];

export const linearAdapter: ServiceAdapter = {
  name: 'linear',
  description: 'Linear issue tracking — create, update, search, and manage issues and projects',
  actions,
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/linear.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/linear.ts
git commit -m "feat: add Linear service adapter"
```

---

### Task 5: PostHog Adapter — Tests

**Files:**
- Create: `tests/posthog.test.ts`

- [ ] **Step 1: Write the test file with all PostHog adapter tests**

```typescript
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
      expect(url).toStartWith('https://posthog.example.com');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/posthog.test.ts`
Expected: FAIL — cannot resolve `../src/services/posthog.js`

- [ ] **Step 3: Commit**

```bash
git add tests/posthog.test.ts
git commit -m "test: add PostHog adapter tests"
```

---

### Task 6: PostHog Adapter — Implementation

**Files:**
- Create: `src/services/posthog.ts`

- [ ] **Step 1: Write the PostHog adapter**

```typescript
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

async function posthogFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('PostHog token not configured');

  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;
  const projectId = config.project_id as string;

  const res = await fetch(`${baseUrl}/api/projects/${projectId}${path}`, {
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
        return posthogFetch(`/persons/${params.person_id}/`, config);
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
      return posthogFetch(`/insights/${params.insight_id}/`, config);
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
      return posthogFetch(`/session_recordings/${params.recording_id}/`, config);
    },
  },
];

export const posthogAdapter: ServiceAdapter = {
  name: 'posthog',
  description: 'PostHog product analytics — query events, persons, session recordings, and insights',
  actions,
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/posthog.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/posthog.ts
git commit -m "feat: add PostHog service adapter"
```

---

### Task 7: Register Adapters and Update Example Config

**Files:**
- Modify: `src/services/index.ts`
- Modify: `examples/keeps.json`

- [ ] **Step 1: Update the adapter registry**

Replace the contents of `src/services/index.ts` with:

```typescript
/**
 * @fileoverview Service adapter registry.
 * Add new adapters here — they're auto-registered when their name appears in config.
 */

import type { ServiceAdapter } from '../types.js';
import { asanaAdapter } from './asana.js';
import { sentryAdapter } from './sentry.js';
import { linearAdapter } from './linear.js';
import { posthogAdapter } from './posthog.js';

/** All available adapters, keyed by service name */
export const availableAdapters: Record<string, ServiceAdapter> = {
  asana: asanaAdapter,
  sentry: sentryAdapter,
  linear: linearAdapter,
  posthog: posthogAdapter,
};
```

- [ ] **Step 2: Update example config**

Replace the contents of `examples/keeps.json` with:

```json
{
  "services": {
    "asana": {
      "token": "${ASANA_TOKEN}",
      "workspace": "YOUR_WORKSPACE_GID"
    },
    "sentry": {
      "token": "${SENTRY_AUTH_TOKEN}",
      "organization": "YOUR_ORG_SLUG",
      "project": "YOUR_PROJECT_SLUG"
    },
    "linear": {
      "token": "${LINEAR_API_KEY}"
    },
    "posthog": {
      "token": "${POSTHOG_PERSONAL_API_KEY}",
      "project_id": "YOUR_PROJECT_ID"
    }
  }
}
```

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All tests pass (existing Asana + registry + config + e2e + new Sentry + Linear + PostHog)

- [ ] **Step 4: Commit**

```bash
git add src/services/index.ts examples/keeps.json
git commit -m "feat: register Sentry, Linear, and PostHog adapters"
```
