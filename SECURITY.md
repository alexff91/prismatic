# Security Policy

## Threat model

Prismatic is designed so that the worst-case blast radius of the app itself
is as small as possible:

| Property | How it's enforced |
| --- | --- |
| No server-side component | The build output is static HTML/JS/CSS. There is nothing to compromise on "Prismatic's side" because nothing runs anywhere. |
| No third-party requests | Strict CSP in `index.html`: `script-src 'self'`, no CDN assets, no fonts, no analytics, no error reporting. The only open directive is `connect-src`, which is required because cluster URLs are user-supplied at runtime. |
| Cluster traffic goes direct | `fetch` from the browser to the configured cluster with `credentials: omit`, `cache: no-store`, `referrerPolicy: no-referrer`. No proxy ever sees your data. |
| Credentials are not persisted | Held in JS memory. The optional "remember for this tab" writes to `sessionStorage` only (cleared on tab close). Nothing secret is ever written to `localStorage` or disk. |
| Minimal supply chain | Two runtime dependencies (`react`, `react-dom`), lockfile committed, CI installs with `npm ci`. Router, state, JSON engine, and query compiler are first-party code in this repo. |
| No dynamic code | No `eval`, no `new Function`, no remote script loading. Responses are rendered as text/DOM, never executed. |
| Destructive-call guard | The REST console requires explicit confirmation before sending DELETE. |

## What Prismatic cannot protect you from

- **Your cluster's own security.** Prismatic authenticates with whatever
  you give it; use a least-privilege user/API key (read-only roles for
  debugging) rather than admin credentials.
- **Plain HTTP.** If you connect to `http://` endpoints, credentials cross
  the network unencrypted. Use TLS in anything beyond local development.
- **Overly broad CORS.** Allow only the specific origin where you host
  Prismatic — never `*` with credentials on a production cluster.
- **A compromised host serving the app.** If you serve the static files
  yourself (recommended for sensitive environments), they're as
  trustworthy as your host. You can audit and pin a build: the output is
  deterministic from the lockfile.

## Reporting a vulnerability

Please open a [GitHub security advisory](../../security/advisories/new) or
a private report rather than a public issue. Reports are welcome for
anything in the threat model above — especially CSP bypasses, credential
persistence bugs, or supply-chain concerns.
