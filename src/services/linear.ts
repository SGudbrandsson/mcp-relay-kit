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
      const variables: Record<string, unknown> = { query: params.query };
      const varDecl = params.team_id ? ', $teamId: String!' : '';
      const filter = params.team_id ? ', filter: { team: { id: { eq: $teamId } } }' : '';
      if (params.team_id) variables.teamId = params.team_id;

      return linearGraphQL(
        `query ($query: String!${varDecl}) {
          issueSearch(query: $query, first: 50${filter}) {
            nodes {
              id identifier title state { name } priority assignee { name } createdAt updatedAt
            }
          }
        }`,
        variables,
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
      const variables: Record<string, unknown> = {};
      const varDecl = params.team_id ? '($teamId: String!)' : '';
      const filter = params.team_id ? '(filter: { accessibleTeams: { some: { id: { eq: $teamId } } } })' : '';
      if (params.team_id) variables.teamId = params.team_id;

      return linearGraphQL(
        `query ${varDecl} {
          projects${filter} {
            nodes { id name state startDate targetDate }
          }
        }`,
        variables,
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
      const variables: Record<string, unknown> = {};
      const varDecl = params.team_id ? '($teamId: String!)' : '';
      const filter = params.team_id ? '(filter: { team: { id: { eq: $teamId } } })' : '';
      if (params.team_id) variables.teamId = params.team_id;

      return linearGraphQL(
        `query ${varDecl} {
          issueLabels${filter} {
            nodes { id name color }
          }
        }`,
        variables,
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
