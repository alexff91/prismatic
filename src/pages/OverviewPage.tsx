import { useEffect } from 'react';
import { fetchClusterInfo } from '../lib/client';
import { formatBytes } from '../lib/lazyjson/scanner';
import { useClusterData } from '../lib/useClusterData';
import { useConnections } from '../state/connections';

interface ClusterHealth {
  cluster_name: string;
  status: 'green' | 'yellow' | 'red';
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
  number_of_pending_tasks: number;
  active_shards_percent_as_number: number;
}

interface ClusterStats {
  indices?: {
    count?: number;
    docs?: { count?: number };
    store?: { size_in_bytes?: number };
  };
  nodes?: {
    versions?: string[];
    jvm?: { mem?: { heap_used_in_bytes?: number; heap_max_in_bytes?: number } };
  };
}

export function OverviewPage() {
  const { active, activeInfo, setActiveInfo } = useConnections();
  const health = useClusterData<ClusterHealth>('/_cluster/health', { pollMs: 10_000 });
  const stats = useClusterData<ClusterStats>('/_cluster/stats');

  useEffect(() => {
    if (active && !activeInfo) {
      fetchClusterInfo(active).then(setActiveInfo).catch(() => setActiveInfo(null));
    }
  }, [active, activeInfo, setActiveInfo]);

  if (health.error) return <ErrorView title="Overview" message={health.error} />;
  if (!health.data) return <Loading title="Overview" />;

  const h = health.data;
  const s = stats.data;
  const heapUsed = s?.nodes?.jvm?.mem?.heap_used_in_bytes;
  const heapMax = s?.nodes?.jvm?.mem?.heap_max_in_bytes;

  return (
    <div>
      <h1 className="page-title">
        <span className={`status-dot status-${h.status}`} />
        {h.cluster_name}
        {activeInfo && (
          <span className="pill" style={{ marginLeft: 10 }}>
            {activeInfo.distribution} {activeInfo.version}
          </span>
        )}
      </h1>

      <div className="cards">
        <Card label="Status" value={h.status} />
        <Card label="Nodes" value={`${h.number_of_nodes} (${h.number_of_data_nodes} data)`} />
        <Card label="Indices" value={s?.indices?.count ?? '…'} />
        <Card label="Documents" value={s?.indices?.docs?.count?.toLocaleString() ?? '…'} />
        <Card
          label="Store size"
          value={s?.indices?.store?.size_in_bytes != null ? formatBytes(s.indices.store.size_in_bytes) : '…'}
        />
        <Card
          label="JVM heap"
          value={
            heapUsed != null && heapMax != null
              ? `${formatBytes(heapUsed)} / ${formatBytes(heapMax)}`
              : '…'
          }
        />
      </div>

      <h2 style={{ fontSize: 16 }}>Shard health</h2>
      <div className="cards">
        <Card label="Active shards" value={h.active_shards} />
        <Card label="Primary shards" value={h.active_primary_shards} />
        <Card label="Relocating" value={h.relocating_shards} />
        <Card label="Initializing" value={h.initializing_shards} />
        <Card label="Unassigned" value={h.unassigned_shards} alert={h.unassigned_shards > 0} />
        <Card label="Active %" value={`${h.active_shards_percent_as_number.toFixed(1)}%`} />
        <Card
          label="Pending tasks"
          value={h.number_of_pending_tasks}
          alert={h.number_of_pending_tasks > 0}
        />
      </div>
      <p className="hint">Health auto-refreshes every 10s. Data never leaves this browser tab.</p>
    </div>
  );
}

function Card({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value" style={alert ? { color: 'var(--red)' } : undefined}>
        {value}
      </div>
    </div>
  );
}

export function Loading({ title }: { title: string }) {
  return (
    <div>
      <h1 className="page-title">{title}</h1>
      <p className="hint">Loading…</p>
    </div>
  );
}

export function ErrorView({ title, message }: { title: string; message: string }) {
  return (
    <div>
      <h1 className="page-title">{title}</h1>
      <div className="error-banner">{message}</div>
    </div>
  );
}
