import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cloudflareAdapter } from '../src/services/cloudflare.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockCloudflareResponse(result: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, result, errors: [] }),
    text: async () => JSON.stringify({ success: true, result, errors: [] }),
  };
}

function mockCloudflareError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ success: false, errors: [{ message }] }),
  };
}

const config = {
  token: 'test-token',
  account_id: 'acct-123',
  zone_id: 'zone-456',
};

describe('Cloudflare adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = cloudflareAdapter.actions.map((a) => a.name);
    // DNS
    expect(names).toContain('list_dns_records');
    expect(names).toContain('get_dns_record');
    expect(names).toContain('create_dns_record');
    expect(names).toContain('update_dns_record');
    expect(names).toContain('delete_dns_record');
    // Zero Trust
    expect(names).toContain('list_access_apps');
    expect(names).toContain('get_access_app');
    expect(names).toContain('create_access_app');
    expect(names).toContain('delete_access_app');
    expect(names).toContain('list_access_policies');
    expect(names).toContain('create_access_policy');
    expect(names).toContain('delete_access_policy');
    // Tunnels
    expect(names).toContain('list_tunnels');
    expect(names).toContain('get_tunnel');
    expect(names).toContain('create_tunnel');
    expect(names).toContain('delete_tunnel');
    expect(names).toContain('get_tunnel_config');
    expect(names).toContain('update_tunnel_config');
    expect(names.length).toBe(18);
  });

  // --- DNS ---

  describe('list_dns_records', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_dns_records')!;

    it('lists DNS records for a zone', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([{ id: 'rec-1', type: 'A' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'rec-1', type: 'A' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/zones/zone-456/dns_records');
    });

    it('passes type and name filters', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({ type: 'A', name: 'example.com' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('type=A');
      expect(url).toContain('name=example.com');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({}, { zone_id: 'z' })).rejects.toThrow('Cloudflare token not configured');
    });

    it('throws on missing zone_id', async () => {
      await expect(action.execute({}, { token: 'test-token' })).rejects.toThrow('Cloudflare zone_id not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareError(403, 'Forbidden'));
      await expect(action.execute({}, config)).rejects.toThrow('Cloudflare API 403');
    });

    it('uses custom baseUrl when configured', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({}, { ...config, baseUrl: 'https://cf.example.com/v4' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://cf.example.com/v4')).toBe(true);
    });
  });

  describe('get_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'get_dns_record')!;

    it('fetches a DNS record by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-1', type: 'A', content: '1.2.3.4' }));
      const result = await action.execute({ record_id: 'rec-1' }, config);
      expect(result).toEqual({ id: 'rec-1', type: 'A', content: '1.2.3.4' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/zones/zone-456/dns_records/rec-1');
    });

    it('rejects record_id containing ../', async () => {
      await expect(action.execute({ record_id: '../secret' }, config)).rejects.toThrow('Invalid record_id');
    });
  });

  describe('create_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_dns_record')!;

    it('creates a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-new' }));
      await action.execute({ type: 'A', name: 'test.example.com', content: '1.2.3.4', proxied: 'true' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-456/dns_records'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"type":"A"'),
        })
      );
    });

    it('throws on non-numeric ttl', async () => {
      await expect(action.execute({ type: 'A', name: 'test.example.com', content: '1.2.3.4', ttl: 'abc' }, config)).rejects.toThrow('ttl must be a number');
    });
  });

  describe('update_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'update_dns_record')!;

    it('updates a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-1' }));
      await action.execute({ record_id: 'rec-1', content: '5.6.7.8' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-456/dns_records/rec-1'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('delete_dns_record', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_dns_record')!;

    it('deletes a DNS record', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'rec-1' }));
      await action.execute({ record_id: 'rec-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-456/dns_records/rec-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // --- Zero Trust ---

  describe('list_access_apps', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_access_apps')!;

    it('lists access applications', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([{ id: 'app-1' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'app-1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/access/apps');
    });

    it('throws on missing account_id', async () => {
      await expect(action.execute({}, { token: 'test-token' })).rejects.toThrow('Cloudflare account_id not configured');
    });
  });

  describe('get_access_app', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'get_access_app')!;

    it('fetches an access app by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'app-1', name: 'My App' }));
      await action.execute({ app_id: 'app-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/access/apps/app-1');
    });

    it('rejects app_id containing path separators', async () => {
      await expect(action.execute({ app_id: 'app/bad' }, config)).rejects.toThrow('Invalid app_id');
    });
  });

  describe('create_access_app', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_access_app')!;

    it('creates an access application', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'app-new' }));
      await action.execute({ name: 'Test App', domain: 'app.example.com', type: 'self_hosted' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/access/apps'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Test App"'),
        })
      );
    });
  });

  describe('delete_access_app', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_access_app')!;

    it('deletes an access application', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'app-1' }));
      await action.execute({ app_id: 'app-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/access/apps/app-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('create_access_policy', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_access_policy')!;

    it('throws on invalid JSON include', async () => {
      await expect(action.execute({ app_id: 'a', name: 'n', decision: 'allow', include: 'not-json' }, config)).rejects.toThrow('include must be valid JSON');
    });

    it('creates an access policy with JSON include', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'pol-new' }));
      const include = JSON.stringify([{ email: { email: 'user@example.com' } }]);
      await action.execute({ app_id: 'app-1', name: 'Allow user', decision: 'allow', include }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/accounts/acct-123/access/apps/app-1/policies');
      const body = JSON.parse(opts.body as string);
      expect(body.include).toEqual([{ email: { email: 'user@example.com' } }]);
    });
  });

  describe('delete_access_policy', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_access_policy')!;

    it('deletes an access policy', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'pol-1' }));
      await action.execute({ app_id: 'app-1', policy_id: 'pol-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/access/apps/app-1/policies/pol-1');
    });

    it('rejects policy_id with path traversal', async () => {
      await expect(action.execute({ app_id: 'app-1', policy_id: '../bad' }, config)).rejects.toThrow('Invalid policy_id');
    });
  });

  // --- Tunnels ---

  describe('list_tunnels', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_tunnels')!;

    it('lists tunnels', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([{ id: 'tun-1' }]));
      const result = await action.execute({}, config);
      expect(result).toEqual([{ id: 'tun-1' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/cfd_tunnel');
    });

    it('passes name filter', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({ name: 'my-tunnel' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('name=my-tunnel');
    });
  });

  describe('get_tunnel', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'get_tunnel')!;

    it('fetches a tunnel by ID', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'tun-1' }));
      await action.execute({ tunnel_id: 'tun-1' }, config);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/accounts/acct-123/cfd_tunnel/tun-1');
    });
  });

  describe('create_tunnel', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'create_tunnel')!;

    it('creates a tunnel', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'tun-new' }));
      await action.execute({ name: 'my-tunnel', tunnel_secret: 'base64secret' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/cfd_tunnel'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"my-tunnel"'),
        })
      );
    });
  });

  describe('delete_tunnel', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'delete_tunnel')!;

    it('deletes a tunnel', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ id: 'tun-1' }));
      await action.execute({ tunnel_id: 'tun-1' }, config);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/accounts/acct-123/cfd_tunnel/tun-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('update_tunnel_config', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'update_tunnel_config')!;

    it('throws on invalid JSON config', async () => {
      await expect(action.execute({ tunnel_id: 'tun-1', config: 'not-json' }, config)).rejects.toThrow('config must be valid JSON');
    });

    it('updates tunnel config with ingress rules', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse({ tunnel_id: 'tun-1' }));
      const ingressConfig = JSON.stringify({ ingress: [{ hostname: 'app.example.com', service: 'http://localhost:3000' }] });
      await action.execute({ tunnel_id: 'tun-1', config: ingressConfig }, config);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/accounts/acct-123/cfd_tunnel/tun-1/configurations');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body as string);
      expect(body.config.ingress).toBeDefined();
    });
  });

  describe('auth headers', () => {
    const action = cloudflareAdapter.actions.find((a) => a.name === 'list_dns_records')!;

    it('sends Bearer token', async () => {
      mockFetch.mockResolvedValueOnce(mockCloudflareResponse([]));
      await action.execute({}, config);
      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe('Bearer test-token');
    });
  });
});
