import { serve, type ServerType } from '@hono/node-server';
import type { Checklist } from '@scrum-mate/shared';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { Hub } from './hub.js';
import { InMemoryRoomStore, type RoomStore } from './store.js';

export interface RunningServer {
  port: number;
  hub: Hub;
  store: RoomStore;
  close(): Promise<void>;
}

const WS_PATH = /^\/ws\/([A-Za-z0-9_-]+)$/;

/** Start HTTP + WebSocket on `config.port` (0 picks a free port). */
export function startServer(
  config: Config,
  deps: {
    store?: RoomStore;
    checklist?: Checklist;
    log?: (msg: string, data?: Record<string, unknown>) => void;
  } = {},
): Promise<RunningServer> {
  const log = deps.log ?? (() => {});
  const store = deps.store ?? new InMemoryRoomStore();
  const hub = new Hub({ store, log, ...(deps.checklist ? { checklist: deps.checklist } : {}) });
  const app = createApp(hub, config);

  const wss = new WebSocketServer({ noServer: true });

  const sweep = setInterval(() => {
    void store.expireIdle(new Date(Date.now() - config.roomTtlMs)).then((n) => {
      if (n > 0) log('rooms expired', { count: n });
    });
  }, config.sweepIntervalMs);
  sweep.unref();

  return new Promise((resolve) => {
    const server: ServerType = serve({ fetch: app.fetch, port: config.port }, (info) => {
      log('listening', { port: info.port });
      resolve({
        port: info.port,
        hub,
        store,
        close: async () => {
          clearInterval(sweep);
          hub.shutdown();
          wss.close();
          await new Promise<void>((res) => server.close(() => res()));
        },
      });
    });

    server.on('upgrade', (req: IncomingMessage, socket, head) => {
      const match = WS_PATH.exec(req.url ?? '');
      if (!match) {
        socket.destroy();
        return;
      }
      const slug = match[1]!;
      wss.handleUpgrade(req, socket, head, (ws) => hub.attach(ws, slug));
    });
  });
}
