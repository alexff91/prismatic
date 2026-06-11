import { useEffect, useRef, useState } from 'react';
import { JsonTree } from '../components/JsonTree';
import { clusterRequest, type ClusterResponse, type HttpMethod } from '../lib/client';
import { formatBytes } from '../lib/lazyjson/scanner';
import { useConnections } from '../state/connections';

interface HistoryEntry {
  method: HttpMethod;
  path: string;
  body: string;
  at: number;
}

const HISTORY_KEY = 'prismatic.consoleHistory.v1';
const HISTORY_MAX = 50;

const SUGGESTIONS = [
  '_cluster/health',
  '_cluster/stats',
  '_cluster/settings?include_defaults=false',
  '_cluster/allocation/explain',
  '_cluster/pending_tasks',
  '_cat/indices?format=json&v=true',
  '_cat/nodes?format=json&v=true',
  '_cat/shards?format=json&v=true',
  '_cat/allocation?format=json&v=true',
  '_cat/thread_pool?format=json&v=true',
  '_cat/pending_tasks?format=json',
  '_cat/recovery?format=json&active_only=true',
  '_cat/segments?format=json',
  '_cat/templates?format=json',
  '_cat/aliases?format=json',
  '_nodes/stats',
  '_nodes/hot_threads',
  '_tasks?detailed=true&actions=*search*',
  '_aliases',
  '_mapping',
  '_settings',
  '_stats',
  '_search',
  '_count',
  '_analyze',
  '_template',
  '_index_template',
  '_snapshot/_all',
  '_ilm/policy',
  '_ism/policies',
];

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function ConsolePage() {
  const { active } = useConnections();
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('_cluster/health');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<ClusterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  }, [history]);

  const send = async () => {
    if (!active) return;
    if (body.trim() !== '') {
      try {
        JSON.parse(body);
      } catch (e) {
        setError(`Body is not valid JSON: ${e instanceof Error ? e.message : e}`);
        return;
      }
    }
    const isMutation = method !== 'GET' && method !== 'HEAD';
    if (isMutation && method === 'DELETE') {
      // Guard rail: deletes are real. Make the user confirm once per call.
      if (!window.confirm(`Send DELETE ${path}? This cannot be undone.`)) return;
    }
    setRunning(true);
    setError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await clusterRequest(
        active,
        method,
        path,
        body.trim() === '' ? undefined : body,
        abortRef.current.signal,
      );
      setResult(res);
      if (!res.ok) setError(`HTTP ${res.status}`);
      setHistory((h) => [
        { method, path, body, at: Date.now() },
        ...h.filter((e) => !(e.method === method && e.path === path && e.body === body)),
      ]);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const formatBody = () => {
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      /* leave as is; send() reports the error */
    }
  };

  return (
    <div>
      <h1 className="page-title">REST Console</h1>

      <div className="row" style={{ marginBottom: 10 }}>
        <select value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)}>
          {(['GET', 'POST', 'PUT', 'DELETE', 'HEAD'] as HttpMethod[]).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          className="mono"
          style={{ flex: 1 }}
          list="console-suggestions"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="_cluster/health or my-index/_search"
          spellCheck={false}
        />
        <datalist id="console-suggestions">
          {SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button className="btn primary" onClick={send} disabled={running || !active}>
          {running ? '…' : 'Send'}
        </button>
        <button className="btn" onClick={() => setShowHistory((s) => !s)}>
          History ({history.length})
        </button>
      </div>

      {showHistory && history.length > 0 && (
        <div className="card" style={{ marginBottom: 10, maxHeight: 200, overflow: 'auto' }}>
          {history.map((h, i) => (
            <div
              key={`${h.at}-${i}`}
              className="row mono"
              style={{ padding: '3px 0', cursor: 'pointer' }}
              onClick={() => {
                setMethod(h.method);
                setPath(h.path);
                setBody(h.body);
                setShowHistory(false);
              }}
            >
              <span className="pill">{h.method}</span> {h.path}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <textarea
          rows={8}
          style={{ width: '100%' }}
          placeholder="Request body (JSON, optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
        />
        <button className="btn small" onClick={formatBody} style={{ marginTop: 4 }}>
          Format JSON
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <>
          <p className="hint">
            {result.status} · {result.durationMs.toFixed(0)} ms ·{' '}
            {formatBytes(result.bodyText.length)}
          </p>
          <JsonTree text={result.bodyText} height={520} />
        </>
      )}

      <p className="hint" style={{ marginTop: 12 }}>
        Requests go straight from this browser tab to the cluster — nothing is proxied or
        logged anywhere. History is kept in sessionStorage (this tab only). DELETE asks for
        confirmation.
      </p>
    </div>
  );
}
