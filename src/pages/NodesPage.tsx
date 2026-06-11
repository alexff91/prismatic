import { DataTable, type Column } from '../components/DataTable';
import { useClusterData } from '../lib/useClusterData';
import { ErrorView, Loading } from './OverviewPage';

interface CatNode {
  name: string;
  ip: string;
  'node.role': string;
  master: string;
  'heap.percent': string;
  'ram.percent': string;
  cpu: string;
  load_1m: string | null;
  'disk.used_percent': string | null;
  version: string;
}

const PATH =
  '/_cat/nodes?format=json&h=name,ip,node.role,master,heap.percent,ram.percent,cpu,load_1m,disk.used_percent,version';

function pct(v: string | null | undefined): React.ReactNode {
  if (v == null || v === '') return '—';
  const n = Number(v);
  const color = n >= 90 ? 'var(--red)' : n >= 75 ? 'var(--yellow)' : undefined;
  return <span style={color ? { color } : undefined}>{n}%</span>;
}

export function NodesPage() {
  const { data, error, loading, refresh } = useClusterData<CatNode[]>(PATH, { pollMs: 15_000 });

  if (error) return <ErrorView title="Nodes" message={error} />;
  if (!data) return <Loading title="Nodes" />;

  const columns: Column<CatNode>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (n) => (
        <>
          {n.master === '*' && <span title="elected master">★ </span>}
          {n.name}
        </>
      ),
      sortValue: (n) => n.name,
    },
    { key: 'ip', label: 'IP', render: (n) => n.ip },
    { key: 'role', label: 'Roles', render: (n) => n['node.role'] },
    {
      key: 'heap',
      label: 'Heap',
      render: (n) => pct(n['heap.percent']),
      sortValue: (n) => Number(n['heap.percent']) || 0,
    },
    {
      key: 'ram',
      label: 'RAM',
      render: (n) => pct(n['ram.percent']),
      sortValue: (n) => Number(n['ram.percent']) || 0,
    },
    {
      key: 'cpu',
      label: 'CPU',
      render: (n) => pct(n.cpu),
      sortValue: (n) => Number(n.cpu) || 0,
    },
    {
      key: 'load',
      label: 'Load 1m',
      render: (n) => n.load_1m ?? '—',
      sortValue: (n) => Number(n.load_1m) || 0,
    },
    {
      key: 'disk',
      label: 'Disk used',
      render: (n) => pct(n['disk.used_percent']),
      sortValue: (n) => Number(n['disk.used_percent']) || 0,
    },
    { key: 'version', label: 'Version', render: (n) => n.version },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Nodes <span className="pill">{data.length}</span>
        </h1>
        <button className="btn small" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <DataTable columns={columns} rows={data} rowKey={(n) => `${n.name}-${n.ip}`} initialSort="name" />
      <p className="hint" style={{ marginTop: 10 }}>
        ★ = elected master. Heap/RAM/CPU/disk turn yellow at 75% and red at 90%. Auto-refreshes
        every 15s.
      </p>
    </div>
  );
}
