/**
 * Connection state.
 *
 * Security model:
 *  - Connection metadata (name + URL) is kept in localStorage so the
 *    cluster list survives reloads.
 *  - Credentials are NEVER written to localStorage. They live in memory,
 *    and optionally in sessionStorage (cleared when the tab closes) if
 *    the user explicitly opts in with "remember for this tab".
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthConfig, ClusterConnection, ClusterInfo } from '../lib/client';

const META_KEY = 'prismatic.connections.v1';
const ACTIVE_KEY = 'prismatic.activeConnection.v1';
const SESSION_AUTH_KEY = 'prismatic.sessionAuth.v1';

interface StoredConnectionMeta {
  id: string;
  name: string;
  url: string;
  authType: AuthConfig['type'];
}

function loadMeta(): StoredConnectionMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMeta(meta: StoredConnectionMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function loadSessionAuth(): Record<string, AuthConfig> {
  try {
    const raw = sessionStorage.getItem(SESSION_AUTH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface ConnectionsApi {
  connections: ClusterConnection[];
  active: ClusterConnection | null;
  activeInfo: ClusterInfo | null;
  setActiveInfo: (info: ClusterInfo | null) => void;
  addConnection: (conn: Omit<ClusterConnection, 'id'>, rememberAuthForTab: boolean) => string;
  updateAuth: (id: string, auth: AuthConfig, rememberAuthForTab: boolean) => void;
  removeConnection: (id: string) => void;
  setActiveId: (id: string | null) => void;
  /** ids whose auth is configured but lost (e.g. after reload without tab-remember) */
  needsAuth: (id: string) => boolean;
}

const Ctx = createContext<ConnectionsApi | null>(null);

export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<StoredConnectionMeta[]>(loadMeta);
  const [authMap, setAuthMap] = useState<Record<string, AuthConfig>>(loadSessionAuth);
  const [activeId, setActiveIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY),
  );
  const [activeInfo, setActiveInfo] = useState<ClusterInfo | null>(null);

  useEffect(() => saveMeta(meta), [meta]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeId]);

  const persistSessionAuth = useCallback(
    (id: string, auth: AuthConfig, remember: boolean) => {
      if (!remember || auth.type === 'none') return;
      const stored = loadSessionAuth();
      stored[id] = auth;
      sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify(stored));
    },
    [],
  );

  const connections: ClusterConnection[] = useMemo(
    () =>
      meta.map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        auth: authMap[m.id] ?? { type: 'none' },
      })),
    [meta, authMap],
  );

  const addConnection = useCallback(
    (conn: Omit<ClusterConnection, 'id'>, rememberAuthForTab: boolean) => {
      const id = crypto.randomUUID();
      setMeta((m) => [...m, { id, name: conn.name, url: conn.url, authType: conn.auth.type }]);
      setAuthMap((a) => ({ ...a, [id]: conn.auth }));
      persistSessionAuth(id, conn.auth, rememberAuthForTab);
      setActiveIdState(id);
      return id;
    },
    [persistSessionAuth],
  );

  const updateAuth = useCallback(
    (id: string, auth: AuthConfig, rememberAuthForTab: boolean) => {
      setAuthMap((a) => ({ ...a, [id]: auth }));
      setMeta((m) => m.map((c) => (c.id === id ? { ...c, authType: auth.type } : c)));
      persistSessionAuth(id, auth, rememberAuthForTab);
    },
    [persistSessionAuth],
  );

  const removeConnection = useCallback((id: string) => {
    setMeta((m) => m.filter((c) => c.id !== id));
    setAuthMap((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
    const stored = loadSessionAuth();
    delete stored[id];
    sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify(stored));
    setActiveIdState((cur) => (cur === id ? null : cur));
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    setActiveInfo(null);
  }, []);

  const needsAuth = useCallback(
    (id: string) => {
      const m = meta.find((c) => c.id === id);
      if (!m || m.authType === 'none') return false;
      return (authMap[id]?.type ?? 'none') === 'none';
    },
    [meta, authMap],
  );

  const active = connections.find((c) => c.id === activeId) ?? null;

  const api: ConnectionsApi = useMemo(
    () => ({
      connections,
      active,
      activeInfo,
      setActiveInfo,
      addConnection,
      updateAuth,
      removeConnection,
      setActiveId,
      needsAuth,
    }),
    [connections, active, activeInfo, addConnection, updateAuth, removeConnection, setActiveId, needsAuth],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useConnections(): ConnectionsApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useConnections must be used inside ConnectionsProvider');
  return api;
}
