/**
 * @fileoverview Vercel service adapter.
 *
 * Config keys:
 *   - token: Vercel API Token (required)
 *   - team_id: Vercel team ID (optional, appended as ?teamId= to requests)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.vercel.com';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function vercelFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown; extraParams?: URLSearchParams } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Vercel token not configured');

  const teamId = config.team_id as string | undefined;
  const url = new URL(`${DEFAULT_BASE_URL}${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  if (options.extraParams) {
    options.extraParams.forEach((value, key) => url.searchParams.set(key, value));
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  // --- Deployments ---
  {
    name: 'list_deployments',
    description: 'List Vercel deployments, optionally filtered by project, state, or target',
    params: {
      projectId: { type: 'string', description: 'Filter by project ID', required: false },
      state: { type: 'string', description: 'Filter by state (BUILDING, READY, ERROR, etc.)', required: false },
      target: { type: 'string', description: 'Filter by target (production, preview)', required: false },
      limit: { type: 'string', description: 'Max results to return', required: false },
    },
    execute: async (params, config) => {
      const extraParams = new URLSearchParams();
      if (params.projectId) extraParams.set('projectId', params.projectId as string);
      if (params.state) extraParams.set('state', params.state as string);
      if (params.target) extraParams.set('target', params.target as string);
      if (params.limit) extraParams.set('limit', params.limit as string);
      return vercelFetch('/v6/deployments', config, { extraParams });
    },
  },
  {
    name: 'get_deployment',
    description: 'Get details of a Vercel deployment',
    params: {
      deployment_id: { type: 'string', description: 'Deployment ID or URL', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v13/deployments/${validatePathSegment(params.deployment_id, 'deployment_id')}`, config);
    },
  },
  {
    name: 'create_deployment',
    description: 'Create a new Vercel deployment',
    params: {
      name: { type: 'string', description: 'Deployment name', required: true },
      project: { type: 'string', description: 'Project ID or name', required: false },
      target: { type: 'string', description: 'Deployment target (production, preview)', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { name: params.name };
      if (params.project) body.project = params.project;
      if (params.target) body.target = params.target;
      return vercelFetch('/v13/deployments', config, { method: 'POST', body });
    },
  },
  {
    name: 'cancel_deployment',
    description: 'Cancel a Vercel deployment',
    params: {
      deployment_id: { type: 'string', description: 'Deployment ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v12/deployments/${validatePathSegment(params.deployment_id, 'deployment_id')}/cancel`, config, { method: 'PATCH' });
    },
  },
  {
    name: 'promote_deployment',
    description: 'Promote a deployment to production',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      deployment_id: { type: 'string', description: 'Deployment ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/promote/${validatePathSegment(params.deployment_id, 'deployment_id')}`,
        config,
        { method: 'POST' }
      );
    },
  },
  {
    name: 'rollback_deployment',
    description: 'Rollback to a previous deployment',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      deployment_id: { type: 'string', description: 'Deployment ID to rollback to', required: true },
      description: { type: 'string', description: 'Reason for rollback', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.description) body.description = params.description;
      return vercelFetch(
        `/v1/projects/${validatePathSegment(params.project_id, 'project_id')}/rollback/${validatePathSegment(params.deployment_id, 'deployment_id')}`,
        config,
        { method: 'POST', body }
      );
    },
  },

  // --- Projects ---
  {
    name: 'list_projects',
    description: 'List Vercel projects',
    params: {
      search: { type: 'string', description: 'Search projects by name', required: false },
    },
    execute: async (params, config) => {
      const extraParams = new URLSearchParams();
      if (params.search) extraParams.set('search', params.search as string);
      return vercelFetch('/v10/projects', config, { extraParams });
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID or name', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v9/projects/${validatePathSegment(params.project_id, 'project_id')}`, config);
    },
  },
  {
    name: 'create_project',
    description: 'Create a new Vercel project',
    params: {
      name: { type: 'string', description: 'Project name', required: true },
      framework: { type: 'string', description: 'Framework preset (nextjs, nuxtjs, gatsby, etc.)', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { name: params.name };
      if (params.framework) body.framework = params.framework;
      return vercelFetch('/v11/projects', config, { method: 'POST', body });
    },
  },
  {
    name: 'update_project',
    description: 'Update a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      name: { type: 'string', description: 'New project name', required: false },
      framework: { type: 'string', description: 'Framework preset', required: false },
      buildCommand: { type: 'string', description: 'Custom build command', required: false },
    },
    execute: async (params, config) => {
      const { project_id, ...rest } = params;
      const body: Record<string, unknown> = {};
      if (rest.name) body.name = rest.name;
      if (rest.framework) body.framework = rest.framework;
      if (rest.buildCommand) body.buildCommand = rest.buildCommand;
      return vercelFetch(`/v9/projects/${validatePathSegment(project_id, 'project_id')}`, config, { method: 'PATCH', body });
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v9/projects/${validatePathSegment(params.project_id, 'project_id')}`, config, { method: 'DELETE' });
    },
  },

  // --- Environment Variables ---
  {
    name: 'list_env_vars',
    description: 'List environment variables for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/env`, config);
    },
  },
  {
    name: 'create_env_var',
    description: 'Create an environment variable for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      key: { type: 'string', description: 'Variable name', required: true },
      value: { type: 'string', description: 'Variable value', required: true },
      target: { type: 'string', description: 'Target environment (production, preview, development, or comma-separated)', required: true },
      type: { type: 'string', description: 'Variable type (plain, secret, encrypted)', required: false, enum: ['plain', 'secret', 'encrypted'] },
    },
    execute: async (params, config) => {
      const targetStr = params.target as string;
      const body: Record<string, unknown> = {
        key: params.key,
        value: params.value,
        target: targetStr.includes(',') ? targetStr.split(',').map(s => s.trim()) : [targetStr],
      };
      if (params.type) body.type = params.type;
      return vercelFetch(`/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/env`, config, { method: 'POST', body });
    },
  },
  {
    name: 'update_env_var',
    description: 'Update an environment variable for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      env_id: { type: 'string', description: 'Environment variable ID', required: true },
      value: { type: 'string', description: 'New value', required: false },
      target: { type: 'string', description: 'New target environment', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.value) body.value = params.value;
      if (params.target) body.target = params.target;
      return vercelFetch(
        `/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/env/${validatePathSegment(params.env_id, 'env_id')}`,
        config,
        { method: 'PATCH', body }
      );
    },
  },
  {
    name: 'delete_env_var',
    description: 'Delete an environment variable from a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      env_id: { type: 'string', description: 'Environment variable ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/env/${validatePathSegment(params.env_id, 'env_id')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },

  // --- Logs ---
  {
    name: 'get_deployment_events',
    description: 'Get build logs (stdout/stderr) for a Vercel deployment',
    params: {
      deployment_id: { type: 'string', description: 'Deployment ID', required: true },
      direction: { type: 'string', description: 'Log order: "forward" (oldest first) or "backward" (newest first)', required: false, enum: ['forward', 'backward'] },
      limit: { type: 'string', description: 'Max number of log lines to return', required: false },
      since: { type: 'string', description: 'Return events after this timestamp (ms since epoch)', required: false },
      until: { type: 'string', description: 'Return events before this timestamp (ms since epoch)', required: false },
    },
    execute: async (params, config) => {
      const extraParams = new URLSearchParams();
      if (params.direction) extraParams.set('direction', params.direction as string);
      if (params.limit) extraParams.set('limit', params.limit as string);
      if (params.since) extraParams.set('since', params.since as string);
      if (params.until) extraParams.set('until', params.until as string);
      return vercelFetch(
        `/v2/deployments/${validatePathSegment(params.deployment_id, 'deployment_id')}/events`,
        config,
        { extraParams }
      );
    },
  },
  {
    name: 'get_runtime_logs',
    description: 'Get runtime logs for a Vercel deployment (serverless, edge functions, middleware)',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      deployment_id: { type: 'string', description: 'Deployment ID', required: true },
    },
    execute: async (params, config) => {
      const token = config.token as string | undefined;
      if (!token) throw new Error('Vercel token not configured');

      const projId = validatePathSegment(params.project_id, 'project_id');
      const deplId = validatePathSegment(params.deployment_id, 'deployment_id');
      const url = new URL(`${DEFAULT_BASE_URL}/v1/projects/${projId}/deployments/${deplId}/runtime-logs`);
      const teamId = config.team_id as string | undefined;
      if (teamId) url.searchParams.set('teamId', teamId);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Vercel API ${res.status}: ${text}`);
      }

      // Response is application/stream+json (newline-delimited JSON)
      const text = await res.text();
      const logs = text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      return logs;
    },
  },

  // --- Domains ---
  {
    name: 'list_domains',
    description: 'List domains for a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(`/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/domains`, config);
    },
  },
  {
    name: 'add_domain',
    description: 'Add a domain to a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      name: { type: 'string', description: 'Domain name (e.g., "example.com")', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v10/projects/${validatePathSegment(params.project_id, 'project_id')}/domains`,
        config,
        { method: 'POST', body: { name: params.name } }
      );
    },
  },
  {
    name: 'remove_domain',
    description: 'Remove a domain from a Vercel project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      domain: { type: 'string', description: 'Domain name to remove', required: true },
    },
    execute: async (params, config) => {
      return vercelFetch(
        `/v9/projects/${validatePathSegment(params.project_id, 'project_id')}/domains/${validatePathSegment(params.domain, 'domain')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },
];

export const vercelAdapter: ServiceAdapter = {
  name: 'vercel',
  description: 'Vercel — manage deployments, logs, projects, environment variables, and domains',
  actions,
};
