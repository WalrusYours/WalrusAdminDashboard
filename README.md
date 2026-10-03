# WALRUS Admin Dashboard

Operator UI for a WALRUS server: upload and publish the YAML schema, tune signal weights
and knobs, manage tenants and API keys, watch the precompute job.

React 19, Vite, Tailwind 4, TypeScript. Dark theme on warm near-black surfaces with the
coral accent of the WALRUS logo.

> **Runs on a mock for now.** `src/api/mock.ts` is an in-browser stand-in for the WALRUS
> admin API (state in `localStorage`, "Reset demo data" in the sidebar). It uses the same
> validation and diff logic the server will. A live client only needs to implement the
> `WalrusApi` interface in `src/api/types.ts`.

## Run

```
npm install
npm run dev        # http://localhost:5174
npm run build
npm run lint
```

With Docker (from the repo root): `docker compose --profile demo up --build dashboard`,
then open http://localhost:3001.

## Pages

| Page | What it does |
|------|--------------|
| Overview | server health, active schema summary, similarity precompute status and trigger |
| Schema | upload or edit YAML, live validation, diff vs the active version (additive or breaking), dry run, apply, version history |
| Weights | edit each signal's default weight, try the user knobs and presets, see the resolved weights, save presets; edits go into the schema draft |
| Tenants & keys | switch tenant, create tenants, issue scoped keys (secret shown once), revoke |

## How it works

- `src/lib/schema.ts` parses, validates, diffs and edits schema YAML. Edits use the `yaml`
  document API, so comments and formatting survive.
- `src/lib/expr.ts` evaluates knob expressions (`1 - x`, `lerp(0.2, 4, x)`, `min`, `max`)
  with the server's grammar, to preview how a knob resolves into signal weights.
- The Schema and Weights pages share one draft (`src/context/DraftProvider.tsx`). Moving a
  slider changes the draft; publishing it is a separate, reviewed step on the Schema page.

## How it is wired to its engine

Like a control plane bound to its own backend, the dashboard is deployed together with one
WALRUS engine and cannot be pointed elsewhere from the browser:

- Docker: nginx forwards `/api/` to `WALRUS_UPSTREAM` (set in the root `docker-compose.yml`;
  template in `deploy/default.conf.template`). The browser only talks to its own origin.
- Dev: Vite proxies `/api` to `WALRUS_URL` (default http://localhost:8080).
- The engine's `/v1/health` returns `instance_id` and `instance_name`; the sidebar shows
  "Managing engine" so the operator can see which engine this is.

## Security note

This is an operator tool. With a live engine the operator signs in with the admin key and
the browser keeps only a short-lived `HttpOnly` session cookie, never the key. Serve it only
on a trusted network and never to end users.
