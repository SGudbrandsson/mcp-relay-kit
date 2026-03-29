/**
 * @fileoverview Service registry — manages adapters and provides search + execute.
 */

import type { ServiceAdapter, ServiceAction, ServiceConfig } from './types.js';

export interface SearchResult {
  service: string;
  action: string;
  description: string;
  params: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>;
}

export class ServiceRegistry {
  private adapters = new Map<string, ServiceAdapter>();
  private configs = new Map<string, ServiceConfig>();

  /**
   * Register a service adapter with its project-specific config.
   * @param instanceName — override the adapter's default name (e.g. "sentry:production").
   *   When provided, this name is used as the registry key so the same adapter type
   *   can be registered multiple times with different configs.
   */
  register(adapter: ServiceAdapter, config: ServiceConfig, instanceName?: string): void {
    const name = instanceName ?? adapter.name;
    this.adapters.set(name, adapter);
    this.configs.set(name, config);
  }

  /** List all registered services and their actions */
  listAll(): SearchResult[] {
    const results: SearchResult[] = [];
    for (const [instanceName, adapter] of this.adapters) {
      for (const action of adapter.actions) {
        results.push(formatResult(instanceName, action));
      }
    }
    return results;
  }

  /**
   * Search for actions matching a query string.
   * Matches against service name, action name, and description.
   */
  search(query: string): SearchResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return this.listAll();

    const scored: { result: SearchResult; score: number }[] = [];

    for (const [instanceName, adapter] of this.adapters) {
      for (const action of adapter.actions) {
        const haystack = `${instanceName} ${adapter.name} ${action.name} ${action.description}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (haystack.includes(term)) score++;
        }
        if (score > 0) {
          scored.push({ result: formatResult(instanceName, action), score });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.result);
  }

  /**
   * Execute a service action.
   * @param service - Service or instance name (e.g., "asana" or "sentry:production")
   * @param action - Action name (e.g., "post_comment")
   * @param params - Action parameters
   */
  async execute(
    service: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const adapter = this.adapters.get(service);
    if (!adapter) {
      return { success: false, error: `Unknown service: ${service}. Available: ${[...this.adapters.keys()].join(', ')}` };
    }

    const actionDef = adapter.actions.find((a) => a.name === action);
    if (!actionDef) {
      return {
        success: false,
        error: `Unknown action: ${service}.${action}. Available: ${adapter.actions.map((a) => a.name).join(', ')}`,
      };
    }

    // Validate required params
    for (const [paramName, schema] of Object.entries(actionDef.params)) {
      if (schema.required !== false && params[paramName] === undefined) {
        return { success: false, error: `Missing required parameter: ${paramName}` };
      }
    }

    const config = this.configs.get(service) ?? {};

    try {
      const data = await actionDef.execute(params, config);
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /** Check if a service is registered */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /** Get registered service names */
  get serviceNames(): string[] {
    return [...this.adapters.keys()];
  }
}

function formatResult(serviceName: string, action: ServiceAction): SearchResult {
  const params: SearchResult['params'] = {};
  for (const [k, v] of Object.entries(action.params)) {
    params[k] = {
      type: v.type,
      description: v.description,
      ...(v.required === false ? { required: false } : {}),
      ...(v.enum ? { enum: v.enum } : {}),
    };
  }
  return {
    service: serviceName,
    action: action.name,
    description: action.description,
    params,
  };
}
