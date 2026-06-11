import { useEffect, useMemo, useState } from 'react';
import { JsonTree } from '../components/JsonTree';
import { QueryBuilder } from '../components/QueryBuilder';
import { clusterJson, clusterRequest, type ClusterResponse } from '../lib/client';
import { formatBytes } from '../lib/lazyjson/scanner';
import { compileSearch } from '../lib/querybuilder/compile';
import { defaultModel } from '../lib/querybuilder/model';
import { useClusterData } from '../lib/useClusterData';
import { useConnections } from '../state/connections';

interface CatIndexName {
  index: string;
}

type Mode = 'builder' | 'dsl';

export function SearchPage() {
  const { active } = useConnections();
  const indices = useClusterData<CatIndexName[]>('/_cat/indices?format=json&h=index&s=index');
  const [index, setIndex] = useState('');
  const [mode, setMode] = useState<Mode>('builder');
  const [model, setModel] = useState(defaultModel);
  const [dslText, setDslText] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [result, setResult] = useState<ClusterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const compiled = useMemo(() => compileSearch(model), [model]);
  const indexNames = useMemo(
    () => (indices.data ?? []).map((i) => i.index).filter((n) => !n.startsWith('.')),
    [indices.data],
  );

  // Pull field names from the mapping for autocomplete when an index is chosen.
  useEffect(() => {
    if (!active || !index || index.includes('*')) {
      setFields([]);
      return;
    }
    let cancelled = false;
    clusterJson<Record<string, { mappings?: { properties?: Record<string, unknown> } }>>(
      active,
      'GET',
      `/${encodeURIComponent(index)}/_mapping`,
    )
      .then((mapping) => {
        if (cancelled) return;
        const names = new Set<string>();
        for (const idx of Object.values(mapping)) {
          collectFields(idx.mappings?.properties, '', names);
        }
        setFields([...names].sort());
      })
      .catch(() => setFields([]));
    return () => {
      cancelled = true;
    };
  }, [active, index]);

  const run = async () => {
    if (!active) return;
    setRunning(true);
    setError(null);
    const body = mode === 'builder' ? compiled.bodyText : dslText;
    try {
      JSON.parse(body);
    } catch (e) {
      setError(`Query body is not valid JSON: ${e instanceof Error ? e.message : e}`);
      setRunning(false);
      return;
    }
    const target = index.trim() === '' ? '_all' : index.trim();
    try {
      const res = await clusterRequest(
        active,
        'POST',
        `/${encodeURIComponent(target).replaceAll('%2C', ',').replaceAll('%2A', '*')}/_search`,
        body,
      );
      setResult(res);
      if (!res.ok) setError(`HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Search</h1>

      <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <label className="hint">index</label>
        <input
          list="search-indices"
          placeholder="_all (or pattern like logs-*)"
          style={{ width: 260 }}
          value={index}
          onChange={(e) => setIndex(e.target.value)}
        />
        <datalist id="search-indices">
          {indexNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <button
            className={`btn small ${mode === 'builder' ? 'primary' : ''}`}
            onClick={() => setMode('builder')}
          >
            Builder
          </button>
          <button
            className={`btn small ${mode === 'dsl' ? 'primary' : ''}`}
            onClick={() => {
              if (mode === 'builder') setDslText(compiled.bodyText);
              setMode('dsl');
            }}
          >
            Raw DSL
          </button>
          <button className="btn primary" onClick={run} disabled={running || !active}>
            {running ? 'Running…' : '▶ Run'}
          </button>
        </div>
      </div>

      {mode === 'builder' ? (
        <>
          <QueryBuilder model={model} onChange={setModel} fields={fields} />
          <details style={{ margin: '12px 0' }}>
            <summary className="hint" style={{ cursor: 'pointer' }}>
              Generated Query DSL
            </summary>
            <pre className="json-raw" style={{ marginTop: 8 }}>{compiled.bodyText}</pre>
          </details>
        </>
      ) : (
        <textarea
          rows={14}
          style={{ width: '100%', marginBottom: 12 }}
          value={dslText}
          onChange={(e) => setDslText(e.target.value)}
          spellCheck={false}
        />
      )}

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <>
          <p className="hint">
            {result.status} · {result.durationMs.toFixed(0)} ms ·{' '}
            {formatBytes(result.bodyText.length)} — rendered lazily, expand nodes to explore
          </p>
          <JsonTree text={result.bodyText} height={560} />
        </>
      )}
    </div>
  );
}

function collectFields(
  properties: Record<string, unknown> | undefined,
  prefix: string,
  out: Set<string>,
) {
  if (!properties) return;
  for (const [name, def] of Object.entries(properties)) {
    const full = prefix ? `${prefix}.${name}` : name;
    out.add(full);
    if (def && typeof def === 'object' && 'properties' in def) {
      collectFields(
        (def as { properties?: Record<string, unknown> }).properties,
        full,
        out,
      );
    }
  }
}
