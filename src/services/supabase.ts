/**
 * @fileoverview Supabase service adapter.
 *
 * Config keys:
 *   - token: Supabase Management API token (required for management actions)
 *   - service_role_key: Supabase service role key (required for project API actions)
 *   - project_ref: Supabase project reference ID (required)
 *   - baseUrl: Base URL domain (optional, defaults to "supabase.co", configurable for self-hosted)
 */

import type { ServiceAdapter, ServiceAction } from '../types.js';

const DEFAULT_BASE_URL = 'supabase.co';
const MANAGEMENT_API_URL = 'https://api.supabase.com';

function validatePathSegment(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[/?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain path separators`);
  }
  return encodeURIComponent(s);
}

function validateStoragePath(value: unknown, name: string): string {
  const s = String(value);
  if (!s || /[?#]/.test(s) || s.includes('..')) {
    throw new Error(`Invalid ${name}: must not contain traversal sequences`);
  }
  return s.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

function requireProjectRef(config: Record<string, unknown>): string {
  const ref = config.project_ref as string | undefined;
  if (!ref) throw new Error('Supabase project_ref not configured');
  return validatePathSegment(ref, 'project_ref');
}

async function supabaseManagementFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Supabase management token not configured');

  const res = await fetch(`${MANAGEMENT_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API ${res.status}: ${text}`);
  }

  return res.json();
}

async function supabaseProjectFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown; rawBody?: Buffer; contentType?: string } = {}
): Promise<unknown> {
  const serviceRoleKey = config.service_role_key as string | undefined;
  if (!serviceRoleKey) throw new Error('Supabase service_role_key not configured');

  const projectRef = requireProjectRef(config);
  const baseUrl = (config.baseUrl as string) || DEFAULT_BASE_URL;

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  let fetchBody: string | Uint8Array | undefined;
  if (options.rawBody) {
    headers['Content-Type'] = options.contentType || 'application/octet-stream';
    fetchBody = new Uint8Array(options.rawBody);
  } else if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(options.body);
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`https://${projectRef}.${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(fetchBody !== undefined ? { body: fetchBody as BodyInit } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase API ${res.status}: ${text}`);
  }

  return res.json();
}

const actions: ServiceAction[] = [
  // --- Projects (Management API) ---
  {
    name: 'list_projects',
    description: 'List all Supabase projects',
    params: {},
    execute: async (_params, config) => {
      return supabaseManagementFetch('/v1/projects', config);
    },
  },
  {
    name: 'get_project',
    description: 'Get details of a Supabase project',
    params: {
      project_ref: { type: 'string', description: 'Project reference ID (defaults to config value)', required: false },
    },
    execute: async (params, config) => {
      const ref = (params.project_ref as string) || requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${validatePathSegment(ref, 'project_ref')}`, config);
    },
  },

  // --- Database (Management API) ---
  {
    name: 'run_sql',
    description: 'Run a SQL query against the Supabase database. Defaults to read-only; set read_only to "false" to allow destructive operations (INSERT, UPDATE, DELETE, DROP, etc.)',
    params: {
      query: { type: 'string', description: 'SQL query to execute', required: true },
      read_only: { type: 'string', description: 'Run as read-only query (true/false, defaults to true)', required: false },
    },
    execute: async (params, config) => {
      const ref = requireProjectRef(config);
      const body: Record<string, unknown> = { query: params.query };
      body.read_only = params.read_only === 'false' ? false : true;
      return supabaseManagementFetch(`/v1/projects/${ref}/database/query`, config, { method: 'POST', body });
    },
  },

  // --- Auth / Users (Project API) ---
  {
    name: 'list_users',
    description: 'List Supabase auth users',
    params: {
      page: { type: 'string', description: 'Page number', required: false },
      per_page: { type: 'string', description: 'Users per page', required: false },
    },
    execute: async (params, config) => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page as string);
      if (params.per_page) searchParams.set('per_page', params.per_page as string);
      const qs = searchParams.toString();
      return supabaseProjectFetch(`/auth/v1/admin/users${qs ? `?${qs}` : ''}`, config);
    },
  },
  {
    name: 'get_user',
    description: 'Get a Supabase auth user by ID',
    params: {
      user_id: { type: 'string', description: 'User ID (UUID)', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/auth/v1/admin/users/${validatePathSegment(params.user_id, 'user_id')}`, config);
    },
  },
  {
    name: 'create_user',
    description: 'Create a new Supabase auth user',
    params: {
      email: { type: 'string', description: 'User email', required: false },
      phone: { type: 'string', description: 'User phone number', required: false },
      password: { type: 'string', description: 'User password', required: false },
      email_confirm: { type: 'string', description: 'Auto-confirm email (true/false)', required: false },
      user_metadata: { type: 'string', description: 'User metadata as JSON string', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.email) body.email = params.email;
      if (params.phone) body.phone = params.phone;
      if (params.password) body.password = params.password;
      if (params.email_confirm) body.email_confirm = params.email_confirm === 'true';
      if (params.user_metadata) {
        try {
          body.user_metadata = JSON.parse(params.user_metadata as string);
        } catch {
          throw new Error('user_metadata must be valid JSON');
        }
      }
      return supabaseProjectFetch('/auth/v1/admin/users', config, { method: 'POST', body });
    },
  },
  {
    name: 'update_user',
    description: 'Update a Supabase auth user',
    params: {
      user_id: { type: 'string', description: 'User ID (UUID)', required: true },
      email: { type: 'string', description: 'New email', required: false },
      password: { type: 'string', description: 'New password', required: false },
      user_metadata: { type: 'string', description: 'User metadata as JSON string', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.email) body.email = params.email;
      if (params.password) body.password = params.password;
      if (params.user_metadata) {
        try {
          body.user_metadata = JSON.parse(params.user_metadata as string);
        } catch {
          throw new Error('user_metadata must be valid JSON');
        }
      }
      return supabaseProjectFetch(`/auth/v1/admin/users/${validatePathSegment(params.user_id, 'user_id')}`, config, { method: 'PUT', body });
    },
  },
  {
    name: 'delete_user',
    description: 'Delete a Supabase auth user',
    params: {
      user_id: { type: 'string', description: 'User ID (UUID)', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/auth/v1/admin/users/${validatePathSegment(params.user_id, 'user_id')}`, config, { method: 'DELETE' });
    },
  },

  // --- Storage (Project API) ---
  {
    name: 'list_buckets',
    description: 'List all Supabase storage buckets',
    params: {},
    execute: async (_params, config) => {
      return supabaseProjectFetch('/storage/v1/bucket', config);
    },
  },
  {
    name: 'get_bucket',
    description: 'Get details of a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/storage/v1/bucket/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config);
    },
  },
  {
    name: 'create_bucket',
    description: 'Create a new Supabase storage bucket',
    params: {
      id: { type: 'string', description: 'Bucket ID', required: true },
      name: { type: 'string', description: 'Bucket name', required: true },
      public: { type: 'string', description: 'Make bucket public (true/false)', required: false },
      file_size_limit: { type: 'string', description: 'Max file size in bytes', required: false },
      allowed_mime_types: { type: 'string', description: 'Comma-separated allowed MIME types', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { id: params.id, name: params.name };
      if (params.public) body.public = params.public === 'true';
      if (params.file_size_limit) {
        const fileSizeLimit = parseInt(params.file_size_limit as string, 10);
        if (isNaN(fileSizeLimit)) throw new Error('file_size_limit must be a number');
        body.file_size_limit = fileSizeLimit;
      }
      if (params.allowed_mime_types) body.allowed_mime_types = (params.allowed_mime_types as string).split(',').map((s) => s.trim());
      return supabaseProjectFetch('/storage/v1/bucket', config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_bucket',
    description: 'Delete a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
    },
    execute: async (params, config) => {
      return supabaseProjectFetch(`/storage/v1/bucket/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config, { method: 'DELETE' });
    },
  },
  {
    name: 'list_files',
    description: 'List files in a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      prefix: { type: 'string', description: 'Path prefix to filter by', required: false },
      limit: { type: 'string', description: 'Max files to return', required: false },
      search: { type: 'string', description: 'Search string', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = {};
      if (params.prefix) body.prefix = params.prefix;
      if (params.limit) {
        const limit = parseInt(params.limit as string, 10);
        if (isNaN(limit)) throw new Error('limit must be a number');
        body.limit = limit;
      }
      if (params.search) body.search = params.search;
      return supabaseProjectFetch(`/storage/v1/object/list/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config, { method: 'POST', body });
    },
  },
  {
    name: 'delete_files',
    description: 'Delete files from a Supabase storage bucket',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      prefixes: { type: 'string', description: 'Comma-separated file paths to delete', required: true },
    },
    execute: async (params, config) => {
      const prefixes = (params.prefixes as string).split(',').map((s) => s.trim());
      return supabaseProjectFetch(`/storage/v1/object/${validatePathSegment(params.bucket_id, 'bucket_id')}`, config, {
        method: 'DELETE',
        body: { prefixes },
      });
    },
  },
  {
    name: 'get_signed_url',
    description: 'Generate a signed URL for a file in Supabase storage',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      path: { type: 'string', description: 'File path within the bucket', required: true },
      expires_in: { type: 'string', description: 'URL expiration time in seconds', required: true },
    },
    execute: async (params, config) => {
      const expiresIn = parseInt(params.expires_in as string, 10);
      if (isNaN(expiresIn)) throw new Error('expires_in must be a number');
      return supabaseProjectFetch(
        `/storage/v1/object/sign/${validatePathSegment(params.bucket_id, 'bucket_id')}/${validateStoragePath(params.path, 'path')}`,
        config,
        { method: 'POST', body: { expiresIn } }
      );
    },
  },
  {
    name: 'upload_file',
    description: 'Upload a file to Supabase storage (content must be base64-encoded)',
    params: {
      bucket_id: { type: 'string', description: 'Bucket ID', required: true },
      path: { type: 'string', description: 'Destination file path within the bucket', required: true },
      content: { type: 'string', description: 'File content as base64-encoded string', required: true },
      content_type: { type: 'string', description: 'MIME type (e.g., "image/png")', required: false },
    },
    execute: async (params, config) => {
      const rawBody = Buffer.from(params.content as string, 'base64');
      const contentType = (params.content_type as string) || 'application/octet-stream';
      return supabaseProjectFetch(
        `/storage/v1/object/${validatePathSegment(params.bucket_id, 'bucket_id')}/${validateStoragePath(params.path, 'path')}`,
        config,
        { method: 'POST', rawBody, contentType }
      );
    },
  },

  // --- Edge Functions ---
  {
    name: 'list_functions',
    description: 'List all Supabase Edge Functions',
    params: {},
    execute: async (_params, config) => {
      const ref = requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${ref}/functions`, config);
    },
  },
  {
    name: 'get_function',
    description: 'Get details of a Supabase Edge Function',
    params: {
      function_slug: { type: 'string', description: 'Function slug', required: true },
    },
    execute: async (params, config) => {
      const ref = requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${ref}/functions/${validatePathSegment(params.function_slug, 'function_slug')}`, config);
    },
  },
  {
    name: 'delete_function',
    description: 'Delete a Supabase Edge Function',
    params: {
      function_slug: { type: 'string', description: 'Function slug', required: true },
    },
    execute: async (params, config) => {
      const ref = requireProjectRef(config);
      return supabaseManagementFetch(`/v1/projects/${ref}/functions/${validatePathSegment(params.function_slug, 'function_slug')}`, config, { method: 'DELETE' });
    },
  },
  {
    name: 'invoke_function',
    description: 'Invoke a Supabase Edge Function',
    params: {
      function_slug: { type: 'string', description: 'Function slug', required: true },
      body: { type: 'string', description: 'Request body as JSON string', required: false },
    },
    execute: async (params, config) => {
      let parsedBody: unknown;
      if (params.body) {
        try {
          parsedBody = JSON.parse(params.body as string);
        } catch {
          throw new Error('body must be valid JSON');
        }
      }
      return supabaseProjectFetch(
        `/functions/v1/${validatePathSegment(params.function_slug, 'function_slug')}`,
        config,
        { method: 'POST', ...(parsedBody ? { body: parsedBody } : {}) }
      );
    },
  },
];

export const supabaseAdapter: ServiceAdapter = {
  name: 'supabase',
  description: 'Supabase — manage database (SQL), auth users, storage, and edge functions',
  actions,
};
