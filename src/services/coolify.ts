/**
 * @fileoverview Coolify service adapter.
 *
 * Config keys:
 *   - token: Coolify API Token (required)
 *   - baseUrl: Coolify instance URL (required, e.g., "http://coolify.local:8000")
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const VALID_DB_TYPES = ['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'clickhouse', 'dragonfly', 'keydb'];

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function coolifyFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Coolify token not configured');

  const baseUrl = config.baseUrl as string | undefined;
  if (!baseUrl) throw new Error('Coolify baseUrl not configured');

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coolify API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  // --- Applications ---
  {
    name: 'list_applications',
    description: 'List all Coolify applications',
    params: {
      tag: { type: 'string', description: 'Filter by tag', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.tag) searchParams.set('tag', params.tag as string);
      const qs = searchParams.toString();
      return coolifyFetch(`/applications${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_application',
    description: 'Get details of a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'deploy_application',
    description: 'Deploy a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
      force: { type: 'string', description: 'Force rebuild (true/false)', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      searchParams.set('uuid', params.uuid as string);
      if (params.force) searchParams.set('force', params.force as string);
      return coolifyFetch(`/deploy?${searchParams}`, config);
    },
  },
  {
    name: 'restart_application',
    description: 'Restart a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}/restart`, config);
    },
  },
  {
    name: 'stop_application',
    description: 'Stop a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}/stop`, config);
    },
  },
  {
    name: 'get_application_logs',
    description: 'Get logs for a Coolify application',
    params: {
      uuid: { type: 'string', description: 'Application UUID', required: true },
      lines: { type: 'string', description: 'Number of log lines to return', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.lines) searchParams.set('lines', params.lines as string);
      const qs = searchParams.toString();
      return coolifyFetch(`/applications/${validatePathSegment(params.uuid, 'uuid')}/logs${qs ? `?${qs}` : ''}`, config);
    },
  },

  // --- Servers ---
  {
    name: 'list_servers',
    description: 'List all Coolify servers',
    params: {},
    execute: async (_params, config) => {
      return coolifyFetch('/servers', config);
    },
  },
  {
    name: 'get_server',
    description: 'Get details of a Coolify server',
    params: {
      uuid: { type: 'string', description: 'Server UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/servers/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'validate_server',
    description: 'Validate a Coolify server connection',
    params: {
      uuid: { type: 'string', description: 'Server UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/servers/${validatePathSegment(params.uuid, 'uuid')}/validate`, config);
    },
  },
  {
    name: 'get_server_resources',
    description: 'Get resources deployed on a Coolify server',
    params: {
      uuid: { type: 'string', description: 'Server UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/servers/${validatePathSegment(params.uuid, 'uuid')}/resources`, config);
    },
  },

  // --- Databases ---
  {
    name: 'list_databases',
    description: 'List all Coolify databases',
    params: {},
    execute: async (_params, config) => {
      return coolifyFetch('/databases', config);
    },
  },
  {
    name: 'get_database',
    description: 'Get details of a Coolify database',
    params: {
      uuid: { type: 'string', description: 'Database UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/databases/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'create_database',
    description: 'Create a new database in Coolify',
    params: {
      type: { type: 'string', description: 'Database type', required: true, enum: ['postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'clickhouse', 'dragonfly', 'keydb'] },
      server_uuid: { type: 'string', description: 'Server UUID to create the database on', required: true },
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      environment_name: { type: 'string', description: 'Environment name', required: true },
      name: { type: 'string', description: 'Database name', required: false },
      image: { type: 'string', description: 'Docker image to use', required: false },
    },
    execute: async (params, config) => {
      const dbType = params.type as string;
      if (!VALID_DB_TYPES.includes(dbType)) {
        throw new Error(`Invalid database type: ${dbType}. Must be one of: ${VALID_DB_TYPES.join(', ')}`);
      }
      const body: Record<string, unknown> = {
        server_uuid: params.server_uuid,
        project_uuid: params.project_uuid,
        environment_name: params.environment_name,
      };
      if (params.name) body.name = params.name;
      if (params.image) body.image = params.image;
      return coolifyFetch(`/databases/${validatePathSegment(dbType, 'type')}`, config, { method: 'POST', body });
    },
  },
  {
    name: 'start_database',
    description: 'Start a Coolify database',
    params: {
      uuid: { type: 'string', description: 'Database UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/databases/${validatePathSegment(params.uuid, 'uuid')}/start`, config);
    },
  },
  {
    name: 'stop_database',
    description: 'Stop a Coolify database',
    params: {
      uuid: { type: 'string', description: 'Database UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/databases/${validatePathSegment(params.uuid, 'uuid')}/stop`, config);
    },
  },

  // --- Projects ---
  {
    name: 'list_projects',
    description: 'List all Coolify projects',
    params: {},
    execute: async (_params, config) => {
      return coolifyFetch('/projects', config);
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a Coolify project',
    params: {
      uuid: { type: 'string', description: 'Project UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/projects/${validatePathSegment(params.uuid, 'uuid')}`, config);
    },
  },
  {
    name: 'create_project',
    description: 'Create a new Coolify project',
    params: {
      name: { type: 'string', description: 'Project name', required: true },
      description: { type: 'string', description: 'Project description', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { name: params.name };
      if (params.description) body.description = params.description;
      return coolifyFetch('/projects', config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a Coolify project',
    params: {
      uuid: { type: 'string', description: 'Project UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/projects/${validatePathSegment(params.uuid, 'uuid')}`, config, { method: 'DELETE' });
    },
  },

  // --- Environments ---
  {
    name: 'list_environments',
    description: 'List environments for a Coolify project',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(`/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/environments`, config);
    },
  },
  {
    name: 'get_environment',
    description: 'Get details of a Coolify environment',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      environment_name: { type: 'string', description: 'Environment name', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(
        `/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/${validatePathSegment(params.environment_name, 'environment_name')}`,
        config
      );
    },
  },
  {
    name: 'create_environment',
    description: 'Create a new environment in a Coolify project',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      name: { type: 'string', description: 'Environment name', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(
        `/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/environments`,
        config,
        { method: 'POST', body: { name: params.name } }
      );
    },
  },
  {
    name: 'delete_environment',
    description: 'Delete an environment from a Coolify project',
    params: {
      project_uuid: { type: 'string', description: 'Project UUID', required: true },
      environment_name: { type: 'string', description: 'Environment name', required: true },
    },
    execute: async (params, config) => {
      return coolifyFetch(
        `/projects/${validatePathSegment(params.project_uuid, 'project_uuid')}/${validatePathSegment(params.environment_name, 'environment_name')}`,
        config,
        { method: 'DELETE' }
      );
    },
  },
];

export const coolifyAdapter: ServiceAdapter = {
  name: 'coolify',
  description: 'Coolify — manage applications, servers, databases, projects, and environments',
  actions,
};
