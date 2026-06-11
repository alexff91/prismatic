import { useRoute } from '../lib/router';
import { useConnections } from '../state/connections';

const NAV = [
  { route: '/overview', label: 'Overview', icon: '◈' },
  { route: '/nodes', label: 'Nodes', icon: '⬡' },
  { route: '/indices', label: 'Indices', icon: '▤' },
  { route: '/shards', label: 'Shards', icon: '▦' },
  { route: '/search', label: 'Search', icon: '⌕' },
  { route: '/console', label: 'REST Console', icon: '⌘' },
  { route: '/connections', label: 'Connections', icon: '⇄' },
];

export function Sidebar() {
  const route = useRoute();
  const { active, activeInfo } = useConnections();

  return (
    <aside className="sidebar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7c5cff" />
              <stop offset="1" stopColor="#00d4aa" />
            </linearGradient>
          </defs>
          <path
            d="M16 2 L29 26 L3 26 Z"
            fill="none"
            stroke="url(#bg)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M16 9 L16 26 M16 14 L23.5 26 M16 14 L8.5 26"
            stroke="url(#bg)"
            strokeWidth="1.2"
            opacity="0.7"
          />
        </svg>
        Prismatic
      </div>
      <nav>
        {NAV.map((item) => (
          <a
            key={item.route}
            href={`#${item.route}`}
            className={route.startsWith(item.route) ? 'active' : ''}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="conn-footer">
        {active ? (
          <>
            <div>
              <span
                className={`status-dot ${activeInfo ? 'status-green' : 'status-yellow'}`}
              />
              {active.name}
            </div>
            <div className="mono" style={{ marginTop: 4 }}>
              {activeInfo
                ? `${activeInfo.distribution} ${activeInfo.version}`
                : active.url}
            </div>
          </>
        ) : (
          <div>No cluster connected</div>
        )}
      </div>
    </aside>
  );
}
