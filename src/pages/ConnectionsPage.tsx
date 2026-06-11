import { useState, type FormEvent } from 'react';
import { fetchClusterInfo, type AuthConfig } from '../lib/client';
import { navigate } from '../lib/router';
import { useConnections } from '../state/connections';

const CORS_ES = `# elasticsearch.yml — allow this app's origin to call the cluster
http.cors.enabled: true
http.cors.allow-origin: "<origin where you serve Prismatic>"
http.cors.allow-headers: X-Requested-With, Content-Type, Authorization
http.cors.allow-credentials: false`;

const CORS_OS = `# opensearch.yml — same keys as Elasticsearch
http.cors.enabled: true
http.cors.allow-origin: "<origin where you serve Prismatic>"
http.cors.allow-headers: X-Requested-With, Content-Type, Authorization`;

export function ConnectionsPage() {
  const { connections, active, addConnection, removeConnection, setActiveId, setActiveInfo } =
    useConnections();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('http://localhost:9200');
  const [authType, setAuthType] = useState<AuthConfig['type']>('none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCors, setShowCors] = useState(false);

  const buildAuth = (): AuthConfig => {
    switch (authType) {
      case 'basic':
        return { type: 'basic', username, password };
      case 'apiKey':
        return { type: 'apiKey', apiKey };
      case 'bearer':
        return { type: 'bearer', token };
      default:
        return { type: 'none' };
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTesting(true);
    const conn = {
      name: name.trim() || url.replace(/^https?:\/\//, ''),
      url: url.trim(),
      auth: buildAuth(),
    };
    try {
      const info = await fetchClusterInfo({ ...conn, id: 'probe' });
      addConnection(conn, remember);
      setActiveInfo(info);
      navigate('/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Connections</h1>

      {connections.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Auth</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.id === active?.id && <span className="status-dot status-green" />}
                    {c.name}
                  </td>
                  <td className="mono">{c.url}</td>
                  <td>
                    <span className="pill">{c.auth.type}</span>
                  </td>
                  <td>
                    <div className="row">
                      <button
                        className="btn small"
                        onClick={() => {
                          setActiveId(c.id);
                          navigate('/overview');
                        }}
                      >
                        Connect
                      </button>
                      <button className="btn small danger" onClick={() => removeConnection(c.id)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 16 }}>Add cluster</h2>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={onSubmit} style={{ maxWidth: 560, display: 'grid', gap: 10 }}>
        <input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="http://localhost:9200"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          type="url"
        />
        <select
          value={authType}
          onChange={(e) => setAuthType(e.target.value as AuthConfig['type'])}
        >
          <option value="none">No auth</option>
          <option value="basic">Basic auth</option>
          <option value="apiKey">API key</option>
          <option value="bearer">Bearer token</option>
        </select>
        {authType === 'basic' && (
          <div className="row">
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        )}
        {authType === 'apiKey' && (
          <input
            placeholder="Base64 API key (id:key encoded)"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        )}
        {authType === 'bearer' && (
          <input
            placeholder="Bearer token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        )}
        {authType !== 'none' && (
          <label className="row hint" style={{ userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember credentials for this tab only (sessionStorage — cleared when the tab
            closes; never written to disk)
          </label>
        )}
        <div className="row">
          <button className="btn primary" type="submit" disabled={testing}>
            {testing ? 'Testing…' : 'Test & connect'}
          </button>
          <button type="button" className="btn" onClick={() => setShowCors((s) => !s)}>
            CORS setup help
          </button>
        </div>
      </form>

      {showCors && (
        <div style={{ marginTop: 20, maxWidth: 720 }}>
          <p className="hint">
            Prismatic runs entirely in your browser and talks to the cluster directly, so the
            cluster must allow cross-origin requests from wherever you serve this app. Add the
            following and restart the node(s):
          </p>
          <pre className="json-raw">{CORS_ES}</pre>
          <p className="hint">OpenSearch:</p>
          <pre className="json-raw">{CORS_OS}</pre>
          <p className="hint">
            Tip: if you cannot change cluster settings, serve Prismatic from the same origin as
            the cluster behind your existing reverse proxy — no CORS needed, and nothing else
            changes since the app is pure static files.
          </p>
        </div>
      )}
    </div>
  );
}
