import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clusterJson,
  clusterRequest,
  fetchClusterInfo,
  joinPath,
  normalizeBaseUrl,
  type ClusterConnection,
} from './client';

let server: Server;
let baseUrl: string;
let lastReq: { method?: string; url?: string; auth?: string; body?: string } = {};

function handle(req: IncomingMessage, res: ServerResponse) {
  let body = '';
  req.on('data', (c: Buffer) => (body += c.toString()));
  req.on('end', () => {
    lastReq = {
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      body,
    };
    if (req.url === '/') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          name: 'node-1',
          cluster_name: 'test-cluster',
          version: { number: '8.17.0', build_flavor: 'default' },
        }),
      );
    } else if (req.url === '/opensearch/') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          name: 'os-node',
          cluster_name: 'os-cluster',
          version: { number: '2.18.0', distribution: 'opensearch' },
        }),
      );
    } else if (req.url?.startsWith('/missing')) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { type: 'index_not_found_exception', reason: 'no such index' } }));
    } else {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    }
  });
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr === 'object' && addr) baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function conn(overrides: Partial<ClusterConnection> = {}): ClusterConnection {
  return { id: 't', name: 'test', url: baseUrl, auth: { type: 'none' }, ...overrides };
}

describe('clusterRequest', () => {
  it('performs requests and returns raw text with timing', async () => {
    const res = await clusterRequest(conn(), 'GET', '/_cluster/health');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.bodyText)).toEqual({ ok: true });
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('sends basic auth and JSON bodies', async () => {
    const res = await clusterRequest(
      conn({ auth: { type: 'basic', username: 'elastic', password: 's3cret' } }),
      'POST',
      '/idx/_search',
      '{"query":{"match_all":{}}}',
    );
    expect(res.ok).toBe(true);
    expect(lastReq.auth).toBe(`Basic ${Buffer.from('elastic:s3cret').toString('base64')}`);
    expect(lastReq.body).toBe('{"query":{"match_all":{}}}');
  });

  it('sends ApiKey and Bearer schemes', async () => {
    await clusterRequest(conn({ auth: { type: 'apiKey', apiKey: 'abc123' } }), 'GET', '/');
    expect(lastReq.auth).toBe('ApiKey abc123');
    await clusterRequest(conn({ auth: { type: 'bearer', token: 'tok' } }), 'GET', '/');
    expect(lastReq.auth).toBe('Bearer tok');
  });

  it('raises a friendly error for unreachable hosts', async () => {
    await expect(
      clusterRequest(conn({ url: 'http://127.0.0.1:1' }), 'GET', '/'),
    ).rejects.toThrow(/CORS|reach/);
  });
});

describe('clusterJson', () => {
  it('extracts the error reason from ES error envelopes', async () => {
    await expect(clusterJson(conn(), 'GET', '/missing/_search')).rejects.toThrow(
      /404.*no such index/,
    );
  });
});

describe('fetchClusterInfo', () => {
  it('detects Elasticsearch', async () => {
    const info = await fetchClusterInfo(conn());
    expect(info).toEqual({
      name: 'node-1',
      clusterName: 'test-cluster',
      distribution: 'elasticsearch',
      version: '8.17.0',
    });
  });

  it('detects OpenSearch', async () => {
    const info = await fetchClusterInfo(conn({ url: `${baseUrl}/opensearch` }));
    expect(info.distribution).toBe('opensearch');
    expect(info.version).toBe('2.18.0');
  });
});

describe('url helpers', () => {
  it('normalizes and joins paths', () => {
    expect(normalizeBaseUrl('http://x:9200///')).toBe('http://x:9200');
    expect(joinPath('http://x:9200/', '_cat/nodes')).toBe('http://x:9200/_cat/nodes');
    expect(joinPath('http://x:9200', '/_cat/nodes')).toBe('http://x:9200/_cat/nodes');
  });
});
