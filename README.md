# Prismatic

**A browser-native console for Elasticsearch and OpenSearch.** Think of a
desktop cluster IDE — but it's a static web page. No backend, no agent, no
install, no telemetry. Open it, point it at your cluster, debug.

![CI](https://github.com/alexff91/prismatic/actions/workflows/ci.yml/badge.svg)

## Why

Existing tools either require a server-side install (Kibana, OpenSearch
Dashboards), run as desktop apps, or proxy your cluster traffic through
someone else's infrastructure. Prismatic is ~60 KB of gzipped static files
that talk to your cluster **directly from your browser tab**. Your data and
credentials never touch anything else.

## Features

- **Cluster overview** — health, nodes, docs, store size, JVM heap, shard
  states, pending tasks. Auto-refreshing.
- **Nodes** — heap / RAM / CPU / load / disk per node with warning
  thresholds, elected-master marker.
- **Indices** — sortable, filterable list with one-click drilldown into
  mappings, settings, and stats.
- **Shards** — per-index shard grid (primaries/replicas, color-coded
  state). Click any shard to run `_cluster/allocation/explain` and see why
  it is where it is — or why it's unassigned.
- **Search** — a visual query builder (AND / OR / NOT groups; match,
  phrase, term(s), prefix, wildcard, exists, ranges, Lucene query string)
  with **field autocomplete pulled from the live mapping**, a generated-DSL
  preview, and a raw DSL mode for when you want full control.
- **REST console** — any method, any endpoint, with curated suggestions
  for the diagnostic endpoints you actually use (`_cat/*`, `_cluster/*`,
  `_nodes/hot_threads`, `_tasks`, recovery, templates…), per-tab history,
  and a confirmation guard on DELETE.
- **Works with both distributions** — detects Elasticsearch vs OpenSearch
  automatically; everything uses APIs common to both.

## Huge documents are fine

Most JSON viewers `JSON.parse` the whole response and build a DOM node per
JSON node — at 10 MB+ that's seconds of frozen UI. Prismatic ships a
**lazy structural scanner**: the response stays as one immutable string,
and expanding a node scans only that subtree's bytes to find child
offsets — nothing is parsed until a primitive actually appears on screen.
The tree is virtualized, so only the ~40 visible rows exist in the DOM no
matter how big the document is. A 12 MB response indexes in ~100 ms.

## Security model

- **Static files only.** No server component, no API, no database. Host it
  on GitHub Pages, S3, nginx, or open `dist/index.html` from disk.
- **Direct connection.** Requests go from your browser straight to the
  cluster URL you configure (`credentials: omit`, `cache: no-store`,
  `referrerPolicy: no-referrer`). There is no proxy and no middleman.
- **Zero telemetry.** No analytics, no error reporting, no CDN assets, no
  fonts, no beacons. The CSP in `index.html` locks `script-src` to self.
- **Credentials stay in memory.** They are never written to localStorage.
  Opt-in "remember for this tab" uses sessionStorage, which the browser
  clears when the tab closes.
- **Minimal supply chain.** Exactly two runtime dependencies: `react` and
  `react-dom`. Everything else — router, state, JSON engine, query
  compiler, virtualization — is in this repo where you can read it.

See [SECURITY.md](SECURITY.md) for the full threat model.

## Quick start

### Use it without installing anything

Once GitHub Pages is enabled for this repo, the latest `main` is served at
the project's Pages URL — open it and add your cluster.

### Run locally

```bash
npm ci
npm run dev        # dev server on http://localhost:5173
# or
npm run build      # static files in dist/ — serve them with anything
```

### Let the browser reach your cluster (CORS)

Prismatic calls your cluster from the browser, so the cluster must allow
the app's origin. Add to `elasticsearch.yml` / `opensearch.yml`:

```yaml
http.cors.enabled: true
http.cors.allow-origin: "https://<origin-where-you-serve-prismatic>"
http.cors.allow-headers: X-Requested-With, Content-Type, Authorization
```

For local experiments:

```bash
docker run --rm -p 9200:9200 -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  -e http.cors.enabled=true \
  -e "http.cors.allow-origin=http://localhost:5173" \
  -e "http.cors.allow-headers=X-Requested-With,Content-Type,Authorization" \
  docker.elastic.co/elasticsearch/elasticsearch:8.17.0
```

> **No CORS access?** Serve Prismatic's `dist/` from the same origin as
> your cluster behind your existing reverse proxy. Same-origin requests
> need no CORS, and since the app is pure static files this is a one-line
> nginx `location`.

## Development

```bash
npm run dev          # hot-reload dev server
npm test             # vitest unit tests
npm run lint         # eslint
npx tsc -b           # typecheck
npm run build        # production build
```

CI runs lint, typecheck, tests, and build on every push and PR.

## License

[MIT](LICENSE)
