# MCP Gateway Setup Guide

This guide explains how to configure and connect the MCP gateway to your AI coding tool.

## 1. Create a Gateway Config

Create a JSON file with your service credentials:

```json
{
  "services": {
    "sentry": {
      "token": "${SENTRY_AUTH_TOKEN}",
      "organization": "my-org",
      "project": "my-project"
    },
    "linear": {
      "token": "${LINEAR_API_KEY}"
    }
  }
}
```

Save this as `~/.config/mcp-gateway/config.json` (or any path you prefer).

**Multiple instances:** To connect to the same service multiple times (e.g. production and staging Sentry), use `service:label` keys:

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
    }
  }
}
```

Each instance appears separately in search results and is called by its full name: `execute("sentry:production", "list_issues", "{}")`. Plain keys without a label (e.g. `"sentry"`) still work for single instances.

**Environment variable interpolation:** Values like `${SENTRY_AUTH_TOKEN}` are resolved from your shell environment at startup. Set them in your shell profile:

```bash
export SENTRY_AUTH_TOKEN="sntrys_..."
export LINEAR_API_KEY="lin_api_..."
```

Only include services you use — the gateway ignores unconfigured adapters.

## 2. Configure Your AI Tool

### Claude Code

Add to your project's `.mcp.json` (or `~/.claude/mcp.json` for global):

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

Or use `npx` to avoid local installation:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "npx",
      "args": ["-y", "mcp-gateway"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### OpenAI Codex

Add to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Cursor

Go to **Settings → MCP Servers → Add Server** and configure:

- **Name:** `gateway`
- **Command:** `node /path/to/mcp-gateway/dist/server.js`
- **Environment:** `GATEWAY_CONFIG=/path/to/config.json`

Or add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP settings (`.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/path/to/mcp-gateway/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

### Other MCP-Compatible Tools

The gateway uses the standard MCP stdio transport. Any tool that supports MCP servers can connect with:

- **Command:** `node /path/to/mcp-gateway/dist/server.js`
- **Environment:** `GATEWAY_CONFIG=/path/to/config.json`

## 3. Build First

Before running, compile the TypeScript:

```bash
cd /path/to/mcp-gateway
npm install
npm run build
```

## 4. Verify the Setup

Once configured, your AI tool should have access to two MCP tools:

- **`search`** — Find available actions: try `search("list issues")`
- **`execute`** — Call an action: try `execute("sentry", "list_issues", "{}")`

If the tools aren't appearing, check:
1. The `GATEWAY_CONFIG` path is correct and the file exists
2. Environment variables referenced in config are set
3. The gateway is built (`dist/server.js` exists)
4. Your AI tool's MCP configuration syntax is correct

## Available Services

| Service | Config Keys | Actions |
|---------|------------|---------|
| Asana | `token`, `workspace` | Task, project, and comment management |
| Sentry | `token`, `organization`, `project` | Issue tracking and event inspection |
| Linear | `token` | Issue CRUD, teams, projects, labels |
| PostHog | `token`, `project_id` | Events, persons, session recordings, insights |
| Cloudflare | `token`, `account_id`, `zone_id` | DNS, Zero Trust Access, Tunnels |
| Coolify | `token`, `baseUrl` | Applications, servers, databases, projects |
| Vercel | `token`, `team_id` | Deployments, projects, env vars, domains |
| Supabase | `token`, `service_role_key`, `project_ref` | Database SQL, auth, storage, edge functions |

See `examples/keeps.json` for a full config example with all services.
