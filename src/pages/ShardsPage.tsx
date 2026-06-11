import { useMemo, useState } from 'react';
import { JsonTree } from '../components/JsonTree';
import { clusterRequest } from '../lib/client';
import { useClusterData } from '../lib/useClusterData';
import { useConnections } from '../state/connections';
import { ErrorView, Loading } from './OverviewPage';

interface CatShard {
  index: string;
  shard: string;
  prirep: 'p' | 'r';
  state: 'STARTED' | 'INITIALIZING' | 'RELOCATING' | 'UNASSIGNED';
  docs: string | null;
  store: string | null;
  node: string | null;
  'unassigned.reason': string | null;
}

const PATH =
  '/_cat/shards?format=json&h=index,shard,prirep,state,docs,store,node,unassigned.reason&s=index,shard';

const STATE_COLOR: Record<CatShard['state'], string> = {
  STARTED: 'var(--green)',
  RELOCATING: 'var(--accent-2)',
  INITIALIZING: 'var(--yellow)',
  UNASSIGNED: 'var(--red)',
};

export function ShardsPage() {
  const { data, error, refresh, loading } = useClusterData<CatShard[]>(PATH);
  const { active } = useConnections();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [filter, setFilter] = useState('');
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainFor, setExplainFor] = useState<string | null>(null);

  const byIndex = useMemo(() => {
    const map = new Map<string, CatShard[]>();
    for (const s of data ?? []) {
      if (onlyProblems && s.state === 'STARTED') continue;
      if (filter && !s.index.includes(filter)) continue;
      const list = map.get(s.index) ?? [];
      list.push(s);
      map.set(s.index, list);
    }
    if (onlyProblems) {
      for (const [k, v] of map) if (v.every((s) => s.state === 'STARTED')) map.delete(k);
    }
    return map;
  }, [data, onlyProblems, filter]);

  const explain = async (shard: CatShard) => {
    if (!active) return;
    const label = `${shard.index}[${shard.shard}] ${shard.prirep === 'p' ? 'primary' : 'replica'}`;
    setExplainFor(label);
    setExplainText(null);
    try {
      const body = JSON.stringify({
        index: shard.index,
        shard: Number(shard.shard),
        primary: shard.prirep === 'p',
      });
      const res = await clusterRequest(active, 'POST', '/_cluster/allocation/explain', body);
      setExplainText(res.bodyText);
    } catch (e) {
      setExplainText(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  };

  if (error) return <ErrorView title="Shards" message={error} />;
  if (!data) return <Loading title="Shards" />;

  const unassigned = data.filter((s) => s.state === 'UNASSIGNED').length;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Shards <span className="pill">{data.length}</span>
          {unassigned > 0 && (
            <span className="pill" style={{ marginLeft: 8, color: 'var(--red)', borderColor: 'var(--red)' }}>
              {unassigned} unassigned
            </span>
          )}
        </h1>
        <div className="row">
          <input placeholder="Filter index…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="row hint" style={{ whiteSpace: 'nowrap', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
            />
            Problems only
          </label>
          <button className="btn small" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {[...byIndex.entries()].map(([index, shards]) => (
        <div key={index} style={{ marginBottom: 14 }}>
          <div className="mono" style={{ marginBottom: 6 }}>
            {index}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {shards.map((s) => (
              <button
                key={`${s.shard}-${s.prirep}-${s.node ?? 'none'}`}
                className="shard-chip"
                style={{ borderColor: STATE_COLOR[s.state] }}
                title={`${s.state}${s.node ? ` on ${s.node}` : ''}${
                  s['unassigned.reason'] ? ` — ${s['unassigned.reason']}` : ''
                }${s.docs ? ` · ${Number(s.docs).toLocaleString()} docs` : ''}`}
                onClick={() => explain(s)}
              >
                <span style={{ color: STATE_COLOR[s.state] }}>
                  {s.prirep === 'p' ? '●' : '○'}
                </span>{' '}
                {s.shard}
              </button>
            ))}
          </div>
        </div>
      ))}

      {explainFor && (
        <div style={{ marginTop: 20 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>Allocation explain — {explainFor}</strong>
            <button className="btn small" onClick={() => setExplainFor(null)}>
              Close
            </button>
          </div>
          {explainText ? <JsonTree text={explainText} height={380} /> : <p className="hint">Loading…</p>}
        </div>
      )}

      <p className="hint" style={{ marginTop: 8 }}>
        ● primary, ○ replica. Click any shard for the allocation explanation (why it is where it
        is, or why it is unassigned).
      </p>
    </div>
  );
}
