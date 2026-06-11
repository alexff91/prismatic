import { useCallback, useEffect, useRef, useState } from 'react';
import { clusterJson, type ClusterConnection, type HttpMethod } from './client';
import { useConnections } from '../state/connections';

interface ClusterDataState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  conn: ClusterConnection | null;
}

/** Fetch a JSON endpoint from the active cluster, with optional polling. */
export function useClusterData<T>(
  path: string,
  opts: { method?: HttpMethod; body?: string; pollMs?: number } = {},
): ClusterDataState<T> {
  const { active } = useConnections();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const { method = 'GET', body, pollMs } = opts;

  useEffect(() => {
    if (!active) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    setLoading(true);
    clusterJson<T>(active, method, path, body, ctrl.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [active, path, method, body, tick]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refresh, conn: active };
}
