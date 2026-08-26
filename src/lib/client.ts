/**
 * Minimal HTTP client for Elasticsearch / OpenSearch.
 *
 * Every request goes straight from the browser to the cluster the user
 * configured — there is no proxy, no middleman, no telemetry. Responses
 * are kept as raw text so multi-megabyte payloads can be handed to the
 * lazy JSON engine without an eager JSON.parse.
 */

export interface ClusterConnection {
  id: string;
  name: string;
  url: string;
  auth: AuthConfig;
}

export type AuthConfig =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; apiKey: string }
  | { type: 'bearer'; token: string };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';

export interface ClusterResponse {
  status: number;
  ok: boolean;
  /** Raw body text — parse lazily, it may be tens of megabytes. */
  bodyText: string;
  durationMs: number;
  contentType: string;
}

export class ClusterRequestError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ClusterRequestError';
  }
}

function authHeaders(auth: AuthConfig): Record<string, string> {
  switch (auth.type) {
    case 'none':
      return {};
    case 'basic':
      return { Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}` };
    case 'apiKey':
      return { Authorization: `ApiKey ${auth.apiKey}` };
    case 'bearer':
      return { Authorization: `Bearer ${auth.token}` };
  }
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function joinPath(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return normalizeBaseUrl(base) + p;
}

/**
 * Why a request could not even leave the browser.
 *
 * The hosted copy of this page is served over HTTPS. A browser will not let an
 * HTTPS page talk to an `http://` cluster (mixed content), and Chrome also
 * blocks HTTPS pages from reaching loopback and private addresses at all
 * (Private Network Access) — even over HTTPS, even with CORS wide open on the
 * cluster. Both refusals happen before any request is sent, so the cluster
 * never sees them and no cluster-side configuration can fix them.
 *
 * This used to be reported as "check that CORS is enabled on the cluster",
 * which sends people to a setup page that cannot possibly help. Returns null
 * when the combination is allowed and the failure really is the cluster, the
 * URL, or CORS.
 */
export function blockedByBrowser(clusterUrl: string): string | null {
  if (typeof window === 'undefined') return null;
  const pageIsHttps = window.location.protocol === 'https:';
  if (!pageIsHttps) return null;

  let target: URL;
  try {
    target = new URL(clusterUrl);
  } catch {
    return null;
  }

  const advice =
    'This page is served over HTTPS, and the browser refuses the request before it is sent. ' +
    'Nothing you change on the cluster will help. Two things do work: download this page ' +
    '(it is a handful of static files) and serve it from the same origin as the cluster, ' +
    'or open it over plain http:// on a machine that can reach the cluster.';

  if (target.protocol === 'http:') {
    return `Cannot reach ${clusterUrl}: an https:// page may not talk to an http:// address. ` + advice;
  }

  const host = target.hostname;
  const isLoopback = host === 'localhost' || host === '::1' || /^127\./.test(host);
  const isPrivate =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isLoopback || isPrivate) {
    return (
      `Cannot reach ${clusterUrl}: Chrome blocks pages on the public internet from reaching ` +
      `${isLoopback ? 'loopback' : 'private network'} addresses. ` + advice
    );
  }
  return null;
}

export async function clusterRequest(
  conn: ClusterConnection,
  method: HttpMethod,
  path: string,
  body?: string,
  signal?: AbortSignal,
): Promise<ClusterResponse> {
  const started = performance.now();

  // Отказ браузера распознаётся до запроса: он и правда происходит раньше,
  // и сообщать про CORS в этом случае — отправлять человека чинить не то.
  const blocked = blockedByBrowser(conn.url);
  if (blocked) throw new ClusterRequestError(blocked);

  let res: Response;
  try {
    res = await fetch(joinPath(conn.url, path), {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(conn.auth),
      },
      body: body || undefined,
      signal,
      // Never send cookies or HTTP cache identity to the cluster.
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ClusterRequestError(
      `Could not reach ${conn.url} — check that the cluster is up, the URL is correct, ` +
        `and CORS is enabled on the cluster (see the Connections page for config snippets).`,
      err,
    );
  }
  const bodyText = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    bodyText,
    durationMs: performance.now() - started,
    contentType: res.headers.get('content-type') ?? '',
  };
}

/** Convenience for small, trusted-size endpoints (cluster health, _cat, etc.). */
export async function clusterJson<T = unknown>(
  conn: ClusterConnection,
  method: HttpMethod,
  path: string,
  body?: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await clusterRequest(conn, method, path, body, signal);
  if (!res.ok) {
    let detail = res.bodyText.slice(0, 2000);
    try {
      const parsed = JSON.parse(res.bodyText);
      detail = parsed?.error?.reason ?? parsed?.error?.type ?? detail;
    } catch {
      /* keep raw text */
    }
    throw new ClusterRequestError(`HTTP ${res.status} on ${method} ${path}: ${detail}`);
  }
  return JSON.parse(res.bodyText) as T;
}

export interface ClusterInfo {
  name: string;
  clusterName: string;
  distribution: 'elasticsearch' | 'opensearch' | 'unknown';
  version: string;
}

/** GET / and figure out whether we are talking to ES or OpenSearch. */
export async function fetchClusterInfo(conn: ClusterConnection): Promise<ClusterInfo> {
  const root = await clusterJson<{
    name?: string;
    cluster_name?: string;
    version?: { number?: string; distribution?: string; build_flavor?: string };
  }>(conn, 'GET', '/');
  const v = root.version ?? {};
  const distribution =
    v.distribution === 'opensearch'
      ? 'opensearch'
      : v.number
        ? 'elasticsearch'
        : 'unknown';
  return {
    name: root.name ?? '',
    clusterName: root.cluster_name ?? '',
    distribution,
    version: v.number ?? '?',
  };
}
