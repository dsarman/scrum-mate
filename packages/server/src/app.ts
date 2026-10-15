import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.js';
import type { Hub } from './hub.js';

export function createApp(hub: Hub, config: Config): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ ok: true, connections: hub.connectionCount }));

  app.post('/api/rooms', async (c) => {
    const room = await hub.createRoom();
    return c.json({ slug: room.slug }, 201);
  });

  if (config.webDist && existsSync(config.webDist)) {
    const index = readFileSync(join(config.webDist, 'index.html'), 'utf8');
    app.use('/*', serveStatic({ root: config.webDist }));
    // SPA fallback: any unknown non-API path gets the app shell.
    app.get('*', (c) => c.html(index));
  }

  return app;
}
