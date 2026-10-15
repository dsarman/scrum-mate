# Scrum Mate

Refinement checklist and planning poker for a scrum team. See `DESIGN.md` for the
decisions and the architecture.

## Layout

```
packages/shared   domain types, Zod schemas, pure reducer, projection, export, checklist seed
packages/server   Node + Hono + ws; in-memory room store; serves the built web app
packages/web      React + Vite
```

## Develop

```sh
pnpm install
pnpm test                       # shared + server tests
pnpm typecheck

pnpm --filter @scrum-mate/server dev   # http://localhost:3000
pnpm --filter @scrum-mate/web dev      # http://localhost:5173, proxies /api and /ws to :3000
```

## Build and run

```sh
pnpm build
WEB_DIST=packages/web/dist PORT=3000 node packages/server/dist/main.js
```

Environment: `PORT` (3000), `ROOM_TTL_HOURS` (24), `SWEEP_INTERVAL_MINUTES` (10),
`WEB_DIST` (unset = no static files), `CHECKLIST_FILE` (unset = bundled default).

State is in memory. A restart drops every room.

## Container

```sh
docker build -t scrum-mate .
docker run --rm -p 3000:3000 scrum-mate
# with your own checklist:
docker run --rm -p 3000:3000 \
  -v "$PWD/private/team.checklist.json:/checklist.json:ro" \
  -e CHECKLIST_FILE=/checklist.json scrum-mate
```

The image is a two-stage build: the first stage installs everything and builds all
packages, the runtime stage installs only the server's production dependencies and
copies the server bundle and the built web app. It runs as the unprivileged `node`
user on port 3000 with a `/healthz` health check. State is in memory, so run exactly
one replica.

## Your team's checklist

The repository ships a generic checklist in `packages/shared/src/checklists/default.ts`.
To use your own, write a JSON file with the same shape (labels included, so the export
comes out in your language) and point `CHECKLIST_FILE` at it. The file is validated at
startup. Keep team checklists out of the repository: the `private/` folder is ignored
for exactly that.

```sh
CHECKLIST_FILE=private/team.checklist.json node packages/server/dist/main.js
```
