# Interactive Installer & Project Rename Design

## Goal

Add an interactive CLI installer (`--setup`) that walks users through configuring the gateway and connecting it to their AI tool. Rename the project from `mcp-gateway` to `codemode-gateway`.

## Scope

Two deliverables:

1. **Project rename** — `mcp-gateway` becomes `codemode-gateway` across package.json, bin entry, README, docs, server logs, and tests.
2. **Interactive installer** — a single new file `src/setup.ts` invoked via `--setup` flag.

## Architecture

### Entry point

`src/server.ts` checks `process.argv` for `--setup`. If present, it imports and runs `src/setup.ts` instead of starting the MCP server. No changes to the MCP server logic itself.

### Setup module (`src/setup.ts`)

Single file, no new dependencies. Uses Node `readline` for interactive prompts, `fs` for file I/O, `path` and `os` for path resolution.

#### Service metadata registry

A data structure within setup.ts that defines, for each adapter, the information needed to prompt the user:

```typescript
interface ServiceField {
  name: string;           // config key (e.g. "token")
  description: string;    // human-readable prompt (e.g. "Sentry auth token")
  envVarHint: string;     // suggested env var name (e.g. "SENTRY_AUTH_TOKEN")
  required: boolean;
}

interface ServiceMeta {
  name: string;           // adapter key (e.g. "sentry")
  displayName: string;    // human-readable (e.g. "Sentry")
  description: string;    // one-line summary (e.g. "Error tracking")
  fields: ServiceField[];
}
```

This is static metadata — it does not import or depend on the adapter implementations.

### Installer flow

#### Step 1: Welcome

Print a welcome message explaining what the installer does.

#### Step 2: Select services

Display a numbered list of all available services with checkboxes. User types numbers to toggle selection, `a` for all, Enter to confirm.

```
Available services:
  1. [ ] Asana — project management
  2. [ ] Sentry — error tracking
  3. [ ] Linear — issue tracking
  4. [ ] PostHog — product analytics
  5. [ ] Cloudflare — DNS, Zero Trust, Tunnels
  6. [ ] Coolify — self-hosted PaaS
  7. [ ] Vercel — deployments and hosting
  8. [ ] Supabase — database, auth, storage, edge functions

Enter numbers to toggle (e.g. "1 3 5"), 'a' for all, Enter to continue:
```

#### Step 3: Configure each service

For each selected service, prompt for each field:

```
── Configuring Sentry ──

token (Sentry auth token):
```

**Env var heuristic:** If the user's input matches `/^[A-Z][A-Z0-9_]*$/`, store it as `${INPUT}`. If it starts with `$`, strip the `$` and store as `${REST}`. Otherwise store as a literal string value.

After configuring all fields for a service:

```
Add another Sentry instance? (y/n):
```

If yes, prompt for an instance label (e.g. "staging"), then repeat the field prompts. The config key becomes `sentry:staging`.

#### Step 4: Choose config file path

```
Config file path [~/.config/codemode-gateway/config.json]:
```

User can accept default or type a custom path. Create parent directories if needed.

#### Step 5: Preview and write gateway config

Display the full JSON. Ask "Write this file? (y/n)". If the file already exists, rename it to `<filename>.bak.<ISO-timestamp>` before writing. Print confirmation.

#### Step 6: Select AI tool

Show available AI tools. Auto-detect which are likely installed:

| Tool | Detection | Config path |
|------|-----------|-------------|
| Claude Code | `~/.claude/` exists | `~/.claude/mcp.json` (global) or `.mcp.json` (project) |
| Gemini CLI | `~/.gemini/` exists | `~/.gemini/settings.json` |
| Cursor | `.cursor/` in cwd | `.cursor/mcp.json` |
| Windsurf | `.windsurf/` in cwd | `.windsurf/mcp.json` |
| Codex | always shown | print snippet to copy |
| Generic MCP | always shown | print snippet to copy |

Mark detected tools with a hint:

```
Configure for which AI tool?
  1. Claude Code (detected)
  2. Gemini CLI
  3. Cursor
  4. Windsurf (detected)
  5. Codex (copy snippet)
  6. Generic MCP (copy snippet)
```

#### Step 7: Scope choice

For tools that support project vs global config (Claude Code):

```
Configure for:
  1. This project only (.mcp.json)
  2. All projects (~/.claude/mcp.json)
```

#### Step 8: Preview and write MCP config

Generate the `mcpServers.gateway` entry:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "node",
      "args": ["/absolute/path/to/dist/server.js"],
      "env": {
        "GATEWAY_CONFIG": "/path/to/config.json"
      }
    }
  }
}
```

The `command` path is resolved from the installer's own `__dirname` (pointing to `dist/server.js`). `GATEWAY_CONFIG` points to the config file written in Step 5.

If the MCP config file already exists, read it, parse it, merge the `gateway` key into the existing `mcpServers` object (preserving other servers), and preview the merged result. Same backup strategy before writing.

For Codex and Generic MCP: just print the JSON snippet to stdout for the user to copy.

#### Step 9: Done

```
Setup complete!

To verify, start your AI tool and try:
  search("list")

This should show all actions from your configured services.
```

### Backup strategy

Before overwriting any existing file, rename it to `<original-name>.bak.<ISO-timestamp>` in the same directory. Timestamp format: `YYYY-MM-DDTHH-MM-SS` (filesystem-safe).

### Error handling

- If the user Ctrl+C's at any point, exit cleanly with no partial writes.
- If a directory can't be created, print a clear error and suggest running with different permissions.
- If a file can't be written, print the JSON to stdout so the user can manually save it.

## Project rename

All occurrences of `mcp-gateway` become `codemode-gateway`:

- `package.json`: `name`, `bin` key, `description`
- `src/server.ts`: server name in `McpServer` constructor, log prefix
- `README.md`: all references
- `docs/setup-guide.md`: all references
- `docs/adding-a-connector.md`: all references
- `examples/keeps.json`: no changes needed (doesn't reference the project name)
- `tests/e2e.test.ts`: if it references the project name
- Config file default path: `~/.config/codemode-gateway/`

## Testing

- Unit tests for the env var heuristic function
- Unit tests for the backup filename generation
- Unit tests for the MCP config merge logic (preserving existing servers)
- The interactive prompts themselves are not unit-tested (they're thin readline wrappers)

## No new dependencies

Everything uses Node built-ins: `readline`, `fs`, `path`, `os`.
