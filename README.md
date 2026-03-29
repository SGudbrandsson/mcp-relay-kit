# codemode-gateway

Lightweight MCP server that exposes multiple services through just 2 tools: **search** and **execute**.

Instead of loading 44+ Asana tools (25,000-60,000 tokens) or dozens of Slack/Sentry tools into every AI session, the gateway provides a single entry point at ~2,000 tokens of context overhead — regardless of how many services are configured.

## Architecture

```
Claude Code session (any project)
    │
    ├─ search("post comment to asana")
    │   → returns: asana.post_comment schema + params
    │
    └─ execute("asana", "post_comment", {"task_id": "123", "text": "Done"})
        → calls Asana API, returns result
```

The gateway acts as a thin dispatcher — no sandbox, no V8 isolates, no heavy infrastructure. Each service is a module with a few focused actions.

## Quick Start

### 1. Install dependencies

```bash
cd ~/sources/codemode-gateway
npm install
```

### 2. Create a config file

```json
{
  "services": {
    "asana": {
      "token": "${ASANA_TOKEN}",
      "workspace": "your-workspace-gid"
    }
  }
}
```

Save as e.g. `~/.config/codemode-gateway/keeps.json`.

Environment variables in `${VAR}` syntax are interpolated at load time.

### 3. Add to your project's `.mcp.json`

```json
{
  "mcpServers": {
    "gateway": {
      "command": "npx",
      "args": ["tsx", "/home/siggi/sources/codemode-gateway/src/server.ts"],
      "env": {
        "GATEWAY_CONFIG": "/home/siggi/.config/codemode-gateway/keeps.json"
      }
    }
  }
}
```

Or after building:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/home/siggi/sources/codemode-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/home/siggi/.config/codemode-gateway/keeps.json"
      }
    }
  }
}
```

### 4. Build (optional, for production)

```bash
npm run build
```

## Tools

The gateway exposes exactly 2 MCP tools:

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

## Available Services

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

## Adding a New Service

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

That's it — the gateway auto-registers any service that appears in both the adapter registry and the config file.

## Multiple Instances of the Same Service

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

- Use `service:label` to create named instances (e.g. `"sentry:production"`, `"supabase:app-db"`)
- Plain keys like `"supabase"` still work for single instances
- Each instance gets its own config and appears separately in search results
- Use the full instance name when calling execute: `execute("sentry:production", "list_issues", "{}")`
- Search matches against both the service type and the label, so searching "production" finds all production instances

## Per-Project Configuration

Different projects can use different configs pointing to different services:

```
~/.config/codemode-gateway/
├── keeps.json      → asana + slack + sentry
├── codeman.json    → asana + github
└── personal.json   → asana
```

Each project's `.mcp.json` points to its own config via `GATEWAY_CONFIG`.

## Testing

```bash
npm test           # run all tests
npm run test:watch # watch mode
```

Tests include:
- Unit tests for the service registry (search, execute, validation)
- Unit tests for config loading (env var interpolation, error handling)
- Unit tests for the Asana, Sentry, Linear, and PostHog adapters (mocked HTTP)
- E2E test that starts the real MCP server process and communicates via stdio

## Design Decisions

**Why not code-mode / sandbox?** Claude Code already runs arbitrary bash. A sandbox adds infrastructure complexity without security benefit in this context. The gateway is a thin dispatcher — the LLM calls `search` to discover what's available, then `execute` to call it. Same progressive discovery pattern, zero infrastructure overhead.

**Why not one MCP per service?** Context cost. Each MCP server's tool definitions are injected into the LLM context. The official Asana MCP alone costs 25,000-60,000 tokens. The gateway collapses everything into 2 tools at ~2,000 tokens regardless of how many services are behind it.

**Why not skills?** Skills work great for 1-2 services. At 4+ services (Asana + Slack + Sentry + PostHog), maintaining separate skills gets unwieldy, and the agent needs to know which skill to invoke for which service. The gateway provides a single, consistent interface.

**Why JSON string for params?** MCP's tool schema uses Zod for parameter validation. `z.record(z.unknown())` isn't compatible with the MCP SDK's type system for tool inputs. A JSON string is the simplest workaround that keeps the gateway's tool count at exactly 2.
