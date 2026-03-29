#!/usr/bin/env node
/**
 * @fileoverview Codemode Gateway server.
 *
 * Exposes all registered services through 2 tools:
 *   - search(query) — discover available actions
 *   - execute(service, action, params) — call an action
 *
 * Runs as an MCP stdio server. Configure via GATEWAY_CONFIG env var.
 */

// Handle --setup flag before starting the MCP server
if (process.argv.includes('--setup')) {
  import('./setup.js').then(({ runSetup }) => runSetup()).then(
    () => process.exit(0),
    (err) => {
      console.error('Setup failed:', err);
      process.exit(1);
    }
  );
} else {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = await import('zod');
  const { ServiceRegistry } = await import('./registry.js');
  const { loadConfig } = await import('./config.js');
  const { availableAdapters } = await import('./services/index.js');

  const registry = new ServiceRegistry();

  // Load config and register matching adapters.
  // Config keys can be plain ("sentry") or labeled ("sentry:production").
  // Labeled keys register the same adapter under a unique instance name.
  const config = loadConfig();
  for (const [configKey, serviceConfig] of Object.entries(config.services)) {
    const adapterName = configKey.includes(':') ? configKey.split(':')[0] : configKey;
    const adapter = availableAdapters[adapterName];
    if (adapter) {
      registry.register(adapter, serviceConfig, configKey);
      console.error(`[codemode-gateway] Registered service: ${configKey}`);
    } else {
      console.error(`[codemode-gateway] Unknown service in config: ${configKey} (available: ${Object.keys(availableAdapters).join(', ')})`);
    }
  }

  if (registry.serviceNames.length === 0) {
    console.error('[codemode-gateway] Warning: No services registered. Set GATEWAY_CONFIG to a config file path.');
  }

  const server = new McpServer({
    name: 'codemode-gateway',
    version: '0.1.0',
  });

  server.tool(
    'search',
    `Search for available actions across all services (${registry.serviceNames.join(', ') || 'none configured'}). Returns action names, descriptions, and parameter schemas. Call with empty query to list all actions.`,
    { query: z.string().describe('Search query — matches against service names, action names, and descriptions. Use empty string to list all.') },
    async ({ query }) => {
      const results = registry.search(query);
      return {
        content: [
          {
            type: 'text' as const,
            text: results.length > 0
              ? JSON.stringify(results, null, 2)
              : `No actions found for "${query}". Available services: ${registry.serviceNames.join(', ') || 'none'}`,
          },
        ],
      };
    }
  );

  server.tool(
    'execute',
    'Execute an action on a service. Use search() first to discover available actions and their parameters.',
    {
      service: z.string().describe('Service name (e.g., "asana", "slack")'),
      action: z.string().describe('Action name (e.g., "post_comment", "update_task")'),
      params: z.string().describe('Action parameters as a JSON string (e.g., {"task_id": "123", "text": "Done"})').default('{}'),
    },
    async ({ service, action, params: paramsJson }) => {
      let params: Record<string, unknown>;
      try {
        params = JSON.parse(paramsJson);
      } catch {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Invalid JSON in params' }) }] };
      }
      const result = await registry.execute(service, action, params);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[codemode-gateway] Server running (services: ${registry.serviceNames.join(', ') || 'none'})`);
  }

  main().catch((err) => {
    console.error('[codemode-gateway] Fatal error:', err);
    process.exit(1);
  });
}
