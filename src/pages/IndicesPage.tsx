import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { JsonTree } from '../components/JsonTree';
import { clusterRequest } from '../lib/client';
import { useClusterData } from '../lib/useClusterData';
import { useConnections } from '../state/connections';
import { ErrorView, Loading } from './OverviewPage';

interface CatIndex {
  health: 'green' | 'yellow' | 'red';
  status: string;
  index: string;
  pri: string;
  rep: string;
  'docs.count': string | null;
  'store.size': string | null;
  'pri.store.size': string | null;
}

const PATH =
  '/_cat/indices?format=json&h=health,status,index,pri,rep,docs.count,store.size,pri.store.size&bytes=b&s=index';

type DetailTab = 'mappings' | 'settings' | 'stats';

export function IndicesPage() {
  const { data, error, refresh, loading } = useClusterData<CatIndex[]>(PATH);
  const { active } = useConnections();
  const [filter, setFilter] = useState('');
  const [hideSystem, setHideSystem] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('mappings');
  const [detailText, setDetailText] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (i) =>
        (!hideSystem || !i.index.startsWith('.')) &&
        (filter === '' || i.index.includes(filter)),
    );
  }, [data, filter, hideSystem]);

  const openDetail = async (index: string, tab: DetailTab) => {
    if (!active) return;
    setSelected(index);
    setDetailTab(tab);
    setDetailText(null);
    setDetailError(null);
    const path =
      tab === 'mappings'
        ? `/${encodeURIComponent(index)}/_mapping`
        : tab === 'settings'
          ? `/${encodeURIComponent(index)}/_settings`
          : `/${encodeURIComponent(index)}/_stats`;
    try {
      const res = await clusterRequest(active, 'GET', path);
      setDetailText(res.bodyText);
      if (!res.ok) setDetailError(`HTTP ${res.status}`);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) return <ErrorView title="Indices" message={error} />;
  if (!data) return <Loading title="Indices" />;

  const columns: Column<CatIndex>[] = [
    {
      key: 'health',
      label: '',
      render: (i) => <span className={`status-dot status-${i.health}`} />,
      sortValue: (i) => i.health,
    },
    { key: 'index', label: 'Index', render: (i) => i.index },
    { key: 'status', label: 'Status', render: (i) => i.status },
    {
      key: 'pri',
      label: 'Pri',
      render: (i) => i.pri,
      sortValue: (i) => Number(i.pri),
    },
    {
      key: 'rep',
      label: 'Rep',
      render: (i) => i.rep,
      sortValue: (i) => Number(i.rep),
    },
    {
      key: 'docs',
      label: 'Docs',
      render: (i) => (i['docs.count'] != null ? Number(i['docs.count']).toLocaleString() : '—'),
      sortValue: (i) => Number(i['docs.count']) || 0,
    },
    {
      key: 'size',
      label: 'Size',
      render: (i) => formatCatBytes(i['store.size']),
      sortValue: (i) => Number(i['store.size']) || 0,
    },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Indices <span className="pill">{rows.length}</span>
        </h1>
        <div className="row">
          <input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="row hint" style={{ whiteSpace: 'nowrap', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={hideSystem}
              onChange={(e) => setHideSystem(e.target.checked)}
            />
            Hide system
          </label>
          <button className="btn small" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.index}
        initialSort="index"
        onRowClick={(i) => openDetail(i.index, 'mappings')}
      />

      {selected && (
        <div style={{ marginTop: 20 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong className="mono">{selected}</strong>
            {(['mappings', 'settings', 'stats'] as DetailTab[]).map((t) => (
              <button
                key={t}
                className={`btn small ${detailTab === t ? 'primary' : ''}`}
                onClick={() => openDetail(selected, t)}
              >
                {t}
              </button>
            ))}
            <button className="btn small" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {detailError && <div className="error-banner">{detailError}</div>}
          {detailText ? (
            <JsonTree text={detailText} height={420} />
          ) : (
            !detailError && <p className="hint">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatCatBytes(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
