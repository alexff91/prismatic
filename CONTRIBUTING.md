# Contributing

Thanks for your interest! Prismatic aims to stay small, auditable, and
dependency-light — please keep that in mind when proposing changes.

## Ground rules

- **No new runtime dependencies** without prior discussion in an issue.
  The two-dependency supply chain (`react`, `react-dom`) is a feature.
- **No network calls to anything except the user's cluster.** No CDNs,
  no fonts, no telemetry, ever.
- **Both distributions matter.** Stick to APIs that exist on both
  Elasticsearch and OpenSearch, or feature-detect.
- **Big payloads must stay smooth.** Anything that touches response
  rendering should go through the lazy JSON engine, not `JSON.parse`.

## Workflow

```bash
npm ci
npm run dev      # hot-reload dev server
npm test         # unit tests (vitest)
npm run lint     # eslint
npx tsc -b       # typecheck
npm run build    # production build
```

A local cluster for testing:

```bash
docker run --rm -p 9200:9200 -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  -e http.cors.enabled=true \
  -e "http.cors.allow-origin=http://localhost:5173" \
  -e "http.cors.allow-headers=X-Requested-With,Content-Type,Authorization" \
  docker.elastic.co/elasticsearch/elasticsearch:8.17.0
```

(or `opensearchproject/opensearch:2` with `-e DISABLE_SECURITY_PLUGIN=true`.)

## Pull requests

1. Fork, branch, make your change.
2. Add or update tests for behavior changes — the JSON scanner and query
   compiler have thorough suites; follow their style.
3. Make sure `npm run lint && npx tsc -b && npm test && npm run build`
   all pass (CI runs exactly this).
4. Open a PR with a clear description of the problem and the approach.
