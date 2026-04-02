# mcp-relay-kit

One MCP server for all your tools. Two tools. ~2,000 tokens.

---

Every MCP server you add dumps its full tool list into your AI's context. The official Asana MCP alone uses 25,000+ tokens. Add Sentry, GitHub, Linear, and PostHog and you've burned 100k+ tokens before the conversation starts.

MCP Relay Kit sits between your AI tool and your services, exposing everything through just **2 tools** — `search` and `execute` — at a fixed cost of ~2,000 tokens. Add 5 services or 50; the context cost stays the same.

## How it works

```
Your AI tool
    │
    ├─ search("post comment to asana")
    │   → returns: asana.post_comment schema + params
    │
    └─ execute("asana", "post_comment", {"task_id": "123", "text": "Done"})
        → calls Asana API, returns result
```

Your AI calls `search` to discover what's available, then `execute` to use it.

## Why this approach

**Context cost.** Each MCP server injects its full tool list into the context window. One server with 20 tools might cost 15,000 tokens. Five servers and you've lost 75,000+ tokens to tool definitions alone — before your code, your conversation, or your files. The relay collapses all of that into 2 tool definitions at ~2,000 tokens, regardless of how many services sit behind it.

**Fewer mistakes.** With 5+ MCP servers loaded, your AI has 100+ tools to pick from. It often picks the wrong one or hallucinates parameters. With the relay, the AI searches first (`search("create issue")`), gets back the exact schema, then calls it. Less guesswork, fewer retries.

**One config, one process.** Instead of managing 5 separate MCP server configs, you manage one relay config. One process to start, one place to add credentials, one thing to debug when something breaks.

## Get started

### Install from npm

```
npm install -g mcp-relay-kit
# or: npm install -g @clockwork-is/mcp-relay-kit
```

### Interactive setup

The fastest way to configure everything:

```
npx mcp-relay-kit --setup
```

This walks you through picking services, entering credentials, and configuring your AI tool (Claude Code, Gemini CLI, Cursor, Windsurf, or Codex).

## Manual setup

### 1. Clone and build

```
git clone https://github.com/SGudbrandsson/mcp-relay-kit.git
cd mcp-relay-kit
npm install && npm run build
```

### 2. Create a config file

```json
{
  "services": {
    "asana": {
      "token": "${ASANA_TOKEN}",
      "workspace": "your-workspace-gid"
    },
    "sentry": {
      "token": "${SENTRY_AUTH_TOKEN}",
      "organization": "your-org",
      "project": "your-project"
    }
  }
}
```

Save this as `~/.config/mcp-relay-kit/config.json` (or any path you prefer).

Values wrapped in `${VAR}` are resolved from environment variables at startup.

### 3. Point your AI tool at the relay

Add this to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "relay": {
      "command": "mcp-relay-kit",
      "env": {
        "GATEWAY_CONFIG": "/path/to/your/config.json"
      }
    }
  }
}
```

If installed globally, `mcp-relay-kit` is available as a command. Otherwise use `npx mcp-relay-kit` or the full path to `node_modules/.bin/mcp-relay-kit`.

## Proxy any MCP server

Already using an MCP server for GitHub, Slack, or anything else? Add it to the relay instead of loading it directly — same functionality, fraction of the context cost.

```json
{
  "services": {
    "asana": { "token": "..." }
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

The relay spawns each MCP server as a child process, discovers its tools at startup, and exposes them through the same `search` and `execute` interface. A server with 20+ tools still costs only ~2,000 tokens.

The `mcpServers` format is the same one used by Claude Code, Cursor, and other AI tools — so you can often just move an existing entry from your `.mcp.json` into the relay config.

## Tools

The relay exposes exactly 2 MCP tools:

### `search(query)`

Discover available actions across all configured services.

- **query** (string): Search text — matches service names, action names, and descriptions
- Returns: Array of matching actions with their parameter schemas

```
search("task comment")
→ [
    { service: "asana", action: "post_comment", params: { task_id: {...}, text: {...} } },
    { service: "asana", action: "get_task", params: { task_id: {...} } }
  ]
```

Pass an empty string to list all available actions.

### `execute(service, action, params)`

Call a specific action on a service.

- **service** (string): Service name (e.g., "asana")
- **action** (string): Action name (e.g., "post_comment")
- **params** (string): JSON string of parameters (e.g., `{"task_id": "123", "text": "Done"}`)

```
execute("asana", "post_comment", '{"task_id": "123", "text": "PR merged"}')
→ { success: true, data: { gid: "456", text: "PR merged" } }
```

## Built-in services

### Asana

Project management — tasks, comments, and project tracking.

| Action | Description |
|--------|-------------|
| `get_task` | Get task details by GID |
| `update_task` | Update task name, notes, status, due date, assignee |
| `create_task` | Create a new task in a project |
| `post_comment` | Post a comment on a task |
| `search_tasks` | Search tasks by text query |
| `list_project_tasks` | List tasks in a project (incomplete by default) |

**Config:**

```json
{
  "token": "your-personal-access-token",
  "workspace": "your-workspace-gid"
}
```

### Sentry

Error tracking — list, inspect, and manage issues and events.

| Action | Description |
|--------|-------------|
| `list_issues` | List issues for a project, with optional Sentry search query |
| `get_issue` | Get details of a specific issue by ID |
| `get_issue_events` | Get occurrences (events) for an issue |
| `get_event_details` | Get full event details including stack trace |
| `resolve_issue` | Mark an issue as resolved |
| `unresolve_issue` | Reopen a resolved issue |
| `update_issue` | Update an issue (assign, change status, set priority) |

**Config:**

```json
{
  "token": "your-sentry-auth-token",
  "organization": "your-org-slug",
  "project": "your-project-slug"
}
```

### Linear

Issue tracking — create, update, search, and manage issues and projects via GraphQL.

| Action | Description |
|--------|-------------|
| `search_issues` | Search issues by text query |
| `get_issue` | Get details of an issue by identifier (e.g., "ENG-123") |
| `create_issue` | Create a new issue |
| `update_issue` | Update an existing issue |
| `delete_issue` | Archive an issue |
| `list_teams` | List all teams (use to find team IDs) |
| `list_projects` | List projects, optionally filtered by team |
| `list_workflow_states` | List workflow states for a team |
| `add_comment` | Add a comment to an issue |
| `list_labels` | List available issue labels |

**Config:**

```json
{
  "token": "your-linear-api-key"
}
```

### PostHog

Product analytics — query events, persons, session recordings, and insights.

| Action | Description |
|--------|-------------|
| `query_events` | Query recent events, filterable by type, person, and date range |
| `get_person` | Get a person by ID or distinct_id |
| `search_persons` | Search persons by email or properties |
| `get_person_events` | Get all events for a person (activity timeline) |
| `query_insights` | Get a saved insight (trend, funnel, etc.) by ID |
| `list_cohorts` | List all cohorts |
| `get_session_recordings` | Find session recordings, filterable by person and date |
| `get_session_recording` | Get a specific session recording with events and details |

**Config:**

```json
{
  "token": "your-posthog-personal-api-key",
  "project_id": "your-project-id"
}
```

### Figma

Design platform — inspect files, export images, manage comments, and browse team libraries.

| Action | Description |
|--------|-------------|
| `get_file` | Get a Figma file by key (document structure, components, metadata) |
| `get_file_nodes` | Get specific nodes from a file by their IDs |
| `get_images` | Render nodes as images (PNG, JPG, SVG, or PDF) |
| `get_comments` | Get comments on a file |
| `post_comment` | Post a comment on a file (supports threaded replies) |
| `get_file_components` | Get published components in a file |
| `get_file_styles` | Get published styles in a file |
| `get_image_fills` | Get download URLs for all images used as fills (photos, textures, backgrounds) |
| `get_team_projects` | List projects for a team |
| `get_project_files` | List files in a project |
| `get_team_components` | Get published components for a team library |
| `get_team_styles` | Get published styles for a team library |
| `get_file_versions` | Get version history of a file |

**Config:**
```json
{
  "token": "your-figma-personal-access-token",
  "team_id": "your-team-id"
}
```

## Add your own service

1. Create `src/services/your-service.ts`:

```typescript
import type { ServiceAdapter, ServiceAction } from '../types.js';

const actions: ServiceAction[] = [
  {
    name: 'do_something',
    description: 'What this action does',
    params: {
      id: { type: 'string', description: 'Resource ID', required: true },
      optional_field: { type: 'string', description: 'Optional', required: false },
    },
    execute: async (params, config) => {
      const token = config.token as string;
      // Call your API...
      return result;
    },
  },
];

export const yourServiceAdapter: ServiceAdapter = {
  name: 'your-service',
  description: 'What this service does',
  actions,
};
```

2. Register in `src/services/index.ts`:

```typescript
import { yourServiceAdapter } from './your-service.js';

export const availableAdapters: Record<string, ServiceAdapter> = {
  asana: asanaAdapter,
  'your-service': yourServiceAdapter,  // add here
};
```

3. Add config in your project's gateway config:

```json
{
  "services": {
    "asana": { "token": "..." },
    "your-service": { "token": "...", "other_config": "..." }
  }
}
```

The relay auto-registers any service that appears in both the adapter registry and the config file.

## Multiple instances of the same service

You can register the same service multiple times with different configurations using `service:label` syntax in your config keys:

```json
{
  "services": {
    "sentry:production": {
      "token": "${SENTRY_PROD_TOKEN}",
      "organization": "my-org",
      "project": "prod-backend"
    },
    "sentry:staging": {
      "token": "${SENTRY_STAGING_TOKEN}",
      "organization": "my-org",
      "project": "staging-backend"
    },
    "supabase": {
      "token": "${SUPABASE_TOKEN}",
      "service_role_key": "${SUPABASE_SERVICE_ROLE_KEY}",
      "project_ref": "abcdefghij"
    }
  }
}
```

- Use `service:label` to create named instances (e.g., `"sentry:production"`, `"supabase:app-db"`)
- Plain keys like `"supabase"` still work for single instances
- Each instance gets its own config and appears separately in search results
- Use the full instance name when calling execute: `execute("sentry:production", "list_issues", "{}")`
- Search matches against both the service type and the label, so searching "production" finds all production instances

## Per-project configuration

Different projects can use different configs pointing to different services:

```
~/.config/mcp-relay-kit/
├── project-a.json  → asana + slack + sentry
├── project-b.json  → asana + github
└── personal.json   → asana
```

Each project's `.mcp.json` points to its own config via `GATEWAY_CONFIG`.

## Testing

```
npm test           # run all tests
npm run test:watch # watch mode
```

Tests cover the service registry (search, execute, validation), config loading (env var interpolation, error handling), each built-in adapter (mocked HTTP), and an E2E test that starts the real MCP server process and communicates via stdio.

## License

MIT
