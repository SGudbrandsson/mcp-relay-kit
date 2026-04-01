/**
 * @fileoverview Figma service adapter.
 *
 * Config keys:
 *   - token: Figma personal access token (required)
 *   - team_id: Figma team ID (required for team-scoped endpoints like list_projects, list_styles)
 *   - baseUrl: API base URL (optional, defaults to https://api.figma.com/v1)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.figma.com/v1';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

async function figmaFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Figma token not configured');

  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'X-FIGMA-TOKEN': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  {
    name: 'get_file',
    description: 'Get a Figma file by key. Returns document structure, components, and metadata',
    params: {
      file_key: { type: 'string', description: 'Figma file key (from the URL)', required: true },
      depth: {
        type: 'number',
        description: 'Depth of the document tree to return (1-4). Lower values return faster',
        required: false,
      },
      branch_data: {
        type: 'boolean',
        description: 'Whether to include branch metadata',
        required: false,
      },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      const searchParams = new URLSearchParams();
      if (params.depth !== undefined) searchParams.set('depth', String(params.depth));
      if (params.branch_data !== undefined) searchParams.set('branch_data', String(params.branch_data));
      const qs = searchParams.toString();
      return figmaFetch(`/files/${fileKey}${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_file_nodes',
    description: 'Get specific nodes from a Figma file by their IDs',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
      ids: { type: 'string', description: 'Comma-separated list of node IDs (e.g. "1:2,3:4")', required: true },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      const searchParams = new URLSearchParams();
      searchParams.set('ids', params.ids as string);
      return figmaFetch(`/files/${fileKey}/nodes?${searchParams.toString()}`, config);
    },
  },
  {
    name: 'get_images',
    description: 'Render nodes from a Figma file as images (PNG, JPG, SVG, or PDF)',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
      ids: { type: 'string', description: 'Comma-separated list of node IDs to render', required: true },
      format: {
        type: 'string',
        description: 'Image format',
        required: false,
        enum: ['jpg', 'png', 'svg', 'pdf'],
        default: 'png',
      },
      scale: {
        type: 'number',
        description: 'Image scale (0.01 to 4)',
        required: false,
      },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      const searchParams = new URLSearchParams();
      searchParams.set('ids', params.ids as string);
      if (params.format) searchParams.set('format', params.format as string);
      if (params.scale !== undefined) {
        const scale = Number(params.scale);
        if (scale < 0.01 || scale > 4) throw new Error('scale must be between 0.01 and 4');
        searchParams.set('scale', String(scale));
      }
      return figmaFetch(`/images/${fileKey}?${searchParams.toString()}`, config);
    },
  },
  {
    name: 'get_comments',
    description: 'Get comments on a Figma file',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
      as_md: {
        type: 'boolean',
        description: 'Whether to return comments as markdown',
        required: false,
      },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      const searchParams = new URLSearchParams();
      if (params.as_md !== undefined) searchParams.set('as_md', String(params.as_md));
      const qs = searchParams.toString();
      return figmaFetch(`/files/${fileKey}/comments${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'post_comment',
    description: 'Post a comment on a Figma file',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
      message: { type: 'string', description: 'Comment text', required: true },
      comment_id: {
        type: 'string',
        description: 'ID of comment to reply to (for threaded replies)',
        required: false,
      },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      const body: Record<string, unknown> = { message: params.message };
      if (params.comment_id) body.comment_id = params.comment_id;
      return figmaFetch(`/files/${fileKey}/comments`, config, { method: 'POST', body });
    },
  },
  {
    name: 'get_file_components',
    description: 'Get a list of published components in a Figma file',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      return figmaFetch(`/files/${fileKey}/components`, config);
    },
  },
  {
    name: 'get_file_styles',
    description: 'Get a list of published styles in a Figma file',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      return figmaFetch(`/files/${fileKey}/styles`, config);
    },
  },
  {
    name: 'get_image_fills',
    description:
      'Get download URLs for all images used as fills in a Figma file (photos, textures, backgrounds)',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      return figmaFetch(`/files/${fileKey}/images`, config);
    },
  },
  {
    name: 'get_team_projects',
    description: 'List projects for a Figma team',
    params: {
      team_id: {
        type: 'string',
        description: 'Team ID (defaults to configured team_id)',
        required: false,
      },
    },
    execute: async (params, config) => {
      const teamId = (params.team_id as string) || (config.team_id as string);
      if (!teamId) throw new Error('team_id is required (pass as param or set in config)');
      return figmaFetch(`/teams/${validatePathSegment(teamId, 'team_id')}/projects`, config);
    },
  },
  {
    name: 'get_project_files',
    description: 'List files in a Figma project',
    params: {
      project_id: { type: 'string', description: 'Project ID', required: true },
      branch_data: {
        type: 'boolean',
        description: 'Whether to include branch metadata',
        required: false,
      },
    },
    execute: async (params, config) => {
      const projectId = validatePathSegment(params.project_id, 'project_id');
      const searchParams = new URLSearchParams();
      if (params.branch_data !== undefined) searchParams.set('branch_data', String(params.branch_data));
      const qs = searchParams.toString();
      return figmaFetch(`/projects/${projectId}/files${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_team_components',
    description: 'Get published components for a team library',
    params: {
      team_id: {
        type: 'string',
        description: 'Team ID (defaults to configured team_id)',
        required: false,
      },
      page_size: { type: 'number', description: 'Number of items per page (max 30)', required: false },
      cursor: { type: 'string', description: 'Pagination cursor from previous response', required: false },
    },
    execute: async (params, config) => {
      const teamId = (params.team_id as string) || (config.team_id as string);
      if (!teamId) throw new Error('team_id is required (pass as param or set in config)');
      const searchParams = new URLSearchParams();
      if (params.page_size !== undefined) searchParams.set('page_size', String(params.page_size));
      if (params.cursor) searchParams.set('after', params.cursor as string);
      const qs = searchParams.toString();
      return figmaFetch(
        `/teams/${validatePathSegment(teamId, 'team_id')}/components${qs ? `?${qs}` : ''}`,
        config
      );
    },
  },
  {
    name: 'get_team_styles',
    description: 'Get published styles for a team library',
    params: {
      team_id: {
        type: 'string',
        description: 'Team ID (defaults to configured team_id)',
        required: false,
      },
      page_size: { type: 'number', description: 'Number of items per page (max 30)', required: false },
      cursor: { type: 'string', description: 'Pagination cursor from previous response', required: false },
    },
    execute: async (params, config) => {
      const teamId = (params.team_id as string) || (config.team_id as string);
      if (!teamId) throw new Error('team_id is required (pass as param or set in config)');
      const searchParams = new URLSearchParams();
      if (params.page_size !== undefined) searchParams.set('page_size', String(params.page_size));
      if (params.cursor) searchParams.set('after', params.cursor as string);
      const qs = searchParams.toString();
      return figmaFetch(
        `/teams/${validatePathSegment(teamId, 'team_id')}/styles${qs ? `?${qs}` : ''}`,
        config
      );
    },
  },
  {
    name: 'get_file_versions',
    description: 'Get version history of a Figma file',
    params: {
      file_key: { type: 'string', description: 'Figma file key', required: true },
    },
    execute: async (params, config) => {
      const fileKey = validatePathSegment(params.file_key, 'file_key');
      return figmaFetch(`/files/${fileKey}/versions`, config);
    },
  },
];

export const figmaAdapter: ServiceAdapter = {
  name: 'figma',
  description: 'Figma design platform — inspect files, export images, manage comments, and browse team libraries',
  actions,
};
