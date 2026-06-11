import { useRoute } from './lib/router';
import { useConnections } from './state/connections';
import { Sidebar } from './components/Sidebar';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { OverviewPage } from './pages/OverviewPage';
import { NodesPage } from './pages/NodesPage';
import { IndicesPage } from './pages/IndicesPage';
import { ShardsPage } from './pages/ShardsPage';
import { SearchPage } from './pages/SearchPage';
import { ConsolePage } from './pages/ConsolePage';

export default function App() {
  const route = useRoute();
  const { active } = useConnections();

  // Everything except connection management needs an active cluster.
  const needsCluster = !route.startsWith('/connections');
  const page =
    needsCluster && !active ? (
      <ConnectionsPage />
    ) : route.startsWith('/connections') ? (
      <ConnectionsPage />
    ) : route.startsWith('/nodes') ? (
      <NodesPage />
    ) : route.startsWith('/indices') ? (
      <IndicesPage />
    ) : route.startsWith('/shards') ? (
      <ShardsPage />
    ) : route.startsWith('/search') ? (
      <SearchPage />
    ) : route.startsWith('/console') ? (
      <ConsolePage />
    ) : (
      <OverviewPage />
    );

  return (
    <div className="app">
      <Sidebar />
      <main className="main">{page}</main>
    </div>
  );
}
