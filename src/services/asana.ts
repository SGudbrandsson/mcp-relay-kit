/**
 * @fileoverview Asana service adapter.
 *
 * Config keys:
 *   - token: Asana Personal Access Token (required)
 *   - workspace: Default workspace GID (optional, used as fallback)
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { ServiceAdapter, ServiceAction } from '../types.js';

const ASANA_BASE = 'https://app.asana.com/api/1.0';

/** Mime type lookup for common image/file extensions */
const MIME_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  txt: 'text/plain', json: 'application/json', csv: 'text/csv',
  zip: 'application/zip', mp4: 'video/mp4',
};

async function asanaFetch(
  path: string,
  config: Record<string, unknown>,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const token = config.token as string | undefined;
  if (!token) throw new Error('Asana token not configured');

  const res = await fetch(`${ASANA_BASE}${path}`, {
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
    throw new Error(`Asana API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data?: unknown };
  return json.data ?? json;
}

const actions: ServiceAction[] = [
  {
    name: 'get_task',
    description: 'Get details of a specific Asana task by its GID',
    params: {
      task_id: { type: 'string', description: 'Task GID', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(`/tasks/${params.task_id}`, config);
    },
  },
  {
    name: 'update_task',
    description: 'Update an Asana task (name, notes/description, completed status, due date, assignee). Use html_notes for rich formatting.',
    params: {
      task_id: { type: 'string', description: 'Task GID', required: true },
      name: { type: 'string', description: 'New task name', required: false },
      notes: { type: 'string', description: 'New task description (plain text)', required: false },
      html_notes: { type: 'string', description: 'New task description in HTML (e.g., "<body><b>Bold</b></body>")', required: false },
      completed: { type: 'boolean', description: 'Mark task as complete or incomplete', required: false },
      due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)', required: false },
      assignee: { type: 'string', description: 'Assignee GID or email', required: false },
    },
    execute: async (params, config) => {
      const { task_id, ...data } = params;
      return asanaFetch(`/tasks/${task_id}`, config, {
        method: 'PUT',
        body: { data },
      });
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in an Asana project. Use html_notes for rich formatting (bold, links, lists).',
    params: {
      name: { type: 'string', description: 'Task name', required: true },
      project_id: { type: 'string', description: 'Project GID to add the task to', required: true },
      notes: { type: 'string', description: 'Task description (plain text)', required: false },
      html_notes: { type: 'string', description: 'Task description in HTML (e.g., "<body><b>Bold</b> text</body>")', required: false },
      due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)', required: false },
      assignee: { type: 'string', description: 'Assignee GID or email', required: false },
      section_id: { type: 'string', description: 'Section GID to place the task in (optional)', required: false },
    },
    execute: async (params, config) => {
      const { project_id, section_id, ...rest } = params;
      const data: Record<string, unknown> = {
        ...rest,
        projects: [project_id],
        workspace: config.workspace,
      };
      if (section_id) {
        data.memberships = [{ project: project_id, section: section_id }];
      }
      return asanaFetch('/tasks', config, {
        method: 'POST',
        body: { data },
      });
    },
  },
  {
    name: 'post_comment',
    description: 'Post a comment (story) on an Asana task',
    params: {
      task_id: { type: 'string', description: 'Task GID', required: true },
      text: { type: 'string', description: 'Comment text (supports basic formatting)', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(`/tasks/${params.task_id}/stories`, config, {
        method: 'POST',
        body: { data: { text: params.text } },
      });
    },
  },
  {
    name: 'search_tasks',
    description: 'Search for tasks in the workspace by text query',
    params: {
      query: { type: 'string', description: 'Search text', required: true },
      project_id: { type: 'string', description: 'Limit search to a specific project GID', required: false },
    },
    execute: async (params, config) => {
      const workspace = config.workspace as string;
      if (!workspace) throw new Error('Asana workspace not configured — required for search');
      const searchParams = new URLSearchParams({
        'text': params.query as string,
        'type': 'task',
        'opt_fields': 'name,completed,due_on,assignee.name,permalink_url',
      });
      if (params.project_id) {
        searchParams.set('projects.any', params.project_id as string);
      }
      return asanaFetch(`/workspaces/${workspace}/typeahead?${searchParams}`, config);
    },
  },
  {
    name: 'list_project_tasks',
    description: 'List tasks in an Asana project (incomplete by default)',
    params: {
      project_id: { type: 'string', description: 'Project GID', required: true },
      completed: { type: 'boolean', description: 'Include completed tasks (default: false)', required: false },
    },
    execute: async (params, config) => {
      const optFields = 'name,completed,due_on,assignee.name,permalink_url';
      const completedSince = params.completed ? '' : '&completed_since=now';
      return asanaFetch(
        `/projects/${params.project_id}/tasks?opt_fields=${optFields}${completedSince}`,
        config
      );
    },
  },
  {
    name: 'get_task_comments',
    description: 'Get all comments (stories) on an Asana task',
    params: {
      task_id: { type: 'string', description: 'Task GID', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(
        `/tasks/${params.task_id}/stories?opt_fields=created_by.name,text,created_at,type,resource_subtype`,
        config
      );
    },
  },
  {
    name: 'update_comment',
    description: 'Update the text of an existing comment (story) on an Asana task. Use get_task_comments to find the story GID first.',
    params: {
      story_id: { type: 'string', description: 'Story (comment) GID', required: true },
      text: { type: 'string', description: 'New comment text', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(`/stories/${params.story_id}`, config, {
        method: 'PUT',
        body: { data: { text: params.text } },
      });
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment (story) from an Asana task. Use get_task_comments to find the story GID first.',
    params: {
      story_id: { type: 'string', description: 'Story (comment) GID to delete', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(`/stories/${params.story_id}`, config, {
        method: 'DELETE',
      });
    },
  },
  {
    name: 'delete_task',
    description: 'Delete an Asana task permanently',
    params: {
      task_id: { type: 'string', description: 'Task GID to delete', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(`/tasks/${params.task_id}`, config, {
        method: 'DELETE',
      });
    },
  },
  {
    name: 'add_task_to_project',
    description: 'Add an existing task to a project (optionally in a specific section)',
    params: {
      task_id: { type: 'string', description: 'Task GID', required: true },
      project_id: { type: 'string', description: 'Project GID to add the task to', required: true },
      section_id: { type: 'string', description: 'Section GID within the project (optional)', required: false },
    },
    execute: async (params, config) => {
      const body: Record<string, unknown> = { project: params.project_id };
      if (params.section_id) body.section = params.section_id;
      return asanaFetch(`/tasks/${params.task_id}/addProject`, config, {
        method: 'POST',
        body: { data: body },
      });
    },
  },
  {
    name: 'get_task_attachments',
    description: 'List all attachments on an Asana task',
    params: {
      task_id: { type: 'string', description: 'Task GID', required: true },
    },
    execute: async (params, config) => {
      return asanaFetch(
        `/tasks/${params.task_id}/attachments?opt_fields=name,download_url,host,view_url,created_at`,
        config
      );
    },
  },
  {
    name: 'upload_attachment',
    description: 'Upload a file (screenshot, image, document) as an attachment to an Asana task. Provide an absolute file path on the local filesystem.',
    params: {
      task_id: { type: 'string', description: 'Task GID to attach the file to', required: true },
      file_path: { type: 'string', description: 'Absolute path to the file on disk (e.g., /tmp/screenshot.png)', required: true },
      file_name: { type: 'string', description: 'Override filename (default: use basename of file_path)', required: false },
    },
    execute: async (params, config) => {
      const token = config.token as string | undefined;
      if (!token) throw new Error('Asana token not configured');

      const filePath = params.file_path as string;
      const fileName = (params.file_name as string) || basename(filePath);
      const ext = extname(fileName).slice(1).toLowerCase();
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      const fileData = readFileSync(filePath);
      const blob = new Blob([fileData], { type: mimeType });

      const form = new FormData();
      form.append('file', blob, fileName);

      const res = await fetch(`${ASANA_BASE}/tasks/${params.task_id}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Asana API ${res.status}: ${text}`);
      }

      const json = (await res.json()) as { data?: unknown };
      return json.data ?? json;
    },
  },
];

export const asanaAdapter: ServiceAdapter = {
  name: 'asana',
  description: 'Asana project management — tasks, comments, and project tracking',
  actions,
};
