import {
  DEFAULT_CHECKLIST,
  ClientMessageSchema,
  SYSTEM,
  apply,
  createRoom,
  project,
  registerSecret,
  type Checklist,
  type ClientMessage,
  type Command,
  type ParticipantId,
  type Room,
  type ServerMessage,
} from '@scrum-mate/shared';
import type { WebSocket } from 'ws';
import { newId, newSlug } from './ids.js';
import type { RoomStore } from './store.js';

/**
 * The hub owns every live connection. It resolves secrets to participants, runs
 * commands through the shared reducer, saves the result, and pushes each viewer its
 * projection. All work on one room is serialised through a per-room queue so two
 * messages can never interleave between get and save.
 */

interface Connection {
  socket: WebSocket;
  roomId: string;
  participantId: ParticipantId;
}

export interface HubOptions {
  store: RoomStore;
  /** The checklist new rooms are created with. */
  checklist?: Checklist;
  now?: () => string;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

export class Hub {
  private readonly store: RoomStore;
  private readonly checklist: Checklist;
  private readonly now: () => string;
  private readonly log: (msg: string, data?: Record<string, unknown>) => void;
  private readonly connections = new Set<Connection>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(opts: HubOptions) {
    this.store = opts.store;
    this.checklist = opts.checklist ?? DEFAULT_CHECKLIST;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.log = opts.log ?? (() => {});
  }

  // ---------------------------------------------------------------------------
  // Rooms
  // ---------------------------------------------------------------------------

  async createRoom(): Promise<Room> {
    const room = createRoom({
      id: newId(),
      slug: newSlug(),
      checklist: this.checklist,
      firstIssueId: newId(),
      now: this.now(),
    });
    await this.store.save(room);
    this.log('room created', { roomId: room.id });
    return room;
  }

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  /** Attach a freshly accepted socket for the room at `slug`. */
  attach(socket: WebSocket, slug: string): void {
    let conn: Connection | null = null;

    socket.on('message', (raw) => {
      let parsed: ClientMessage;
      try {
        parsed = ClientMessageSchema.parse(JSON.parse(raw.toString()));
      } catch {
        socket.close(1003, 'invalid message');
        return;
      }

      if (parsed.type === 'hello') {
        if (conn) return; // already joined; ignore
        void this.handleHello(socket, slug, parsed).then((c) => {
          conn = c;
        });
        return;
      }

      if (!conn) {
        socket.close(1008, 'hello first');
        return;
      }
      void this.handleCommand(conn, parsed.commandId, parsed.command);
    });

    socket.on('close', () => {
      if (conn) void this.handleClose(conn);
    });
  }

  private async handleHello(
    socket: WebSocket,
    slug: string,
    msg: Extract<ClientMessage, { type: 'hello' }>,
  ): Promise<Connection | null> {
    const room = await this.store.getBySlug(slug);
    if (!room) {
      send(socket, { type: 'roomNotFound' });
      socket.close(1008, 'room not found');
      return null;
    }

    return this.withRoom(room.id, async (current) => {
      if (!current) {
        send(socket, { type: 'roomNotFound' });
        socket.close(1008, 'room not found');
        return null;
      }

      let next = current;
      let participantId = next.secrets[msg.secret];
      let name = msg.name;
      if (!participantId) {
        if (!name) {
          send(socket, { type: 'nameRequired' });
          return null;
        }
        participantId = newId();
        next = registerSecret(next, msg.secret, participantId);
      }
      name ??= next.participants[participantId]?.name ?? 'Anonymous';

      const r = apply(next, { type: 'join', participantId, name }, { actorId: SYSTEM, now: this.now() });
      if (!r.ok) {
        socket.close(1011, r.error);
        return null;
      }
      await this.store.save(r.state);

      const conn: Connection = { socket, roomId: r.state.id, participantId };
      this.connections.add(conn);
      this.broadcast(r.state);
      return conn;
    });
  }

  private async handleCommand(conn: Connection, commandId: string, command: Command): Promise<void> {
    // Connection-level commands are never accepted from clients.
    if (command.type === 'join' || command.type === 'disconnect') {
      send(conn.socket, { type: 'result', commandId, ok: false, error: 'not allowed' });
      return;
    }

    await this.withRoom(conn.roomId, async (room) => {
      if (!room) {
        send(conn.socket, { type: 'roomNotFound' });
        return;
      }
      const r = apply(room, command, { actorId: conn.participantId, now: this.now() });
      if (!r.ok) {
        send(conn.socket, { type: 'result', commandId, ok: false, error: r.error });
        return;
      }
      await this.store.save(r.state);
      send(conn.socket, { type: 'result', commandId, ok: true });
      this.broadcast(r.state);
    });
  }

  private async handleClose(conn: Connection): Promise<void> {
    this.connections.delete(conn);
    // Another tab of the same participant may still be open.
    const stillConnected = [...this.connections].some(
      (c) => c.roomId === conn.roomId && c.participantId === conn.participantId,
    );
    if (stillConnected) return;

    await this.withRoom(conn.roomId, async (room) => {
      if (!room) return;
      const r = apply(
        room,
        { type: 'disconnect', participantId: conn.participantId },
        { actorId: SYSTEM, now: this.now() },
      );
      if (!r.ok) return;
      await this.store.save(r.state);
      this.broadcast(r.state);
    });
  }

  // ---------------------------------------------------------------------------
  // Fan-out
  // ---------------------------------------------------------------------------

  private broadcast(room: Room): void {
    const now = this.now();
    for (const c of this.connections) {
      if (c.roomId !== room.id) continue;
      send(c.socket, { type: 'snapshot', view: project(room, c.participantId, now) });
    }
  }

  /** Tell every client to reconnect later, then close all sockets. */
  shutdown(): void {
    for (const c of this.connections) {
      send(c.socket, { type: 'serverRestarting' });
      c.socket.close(1001, 'server restarting');
    }
    this.connections.clear();
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  // ---------------------------------------------------------------------------
  // Serialisation
  // ---------------------------------------------------------------------------

  /** Run `fn` with the latest room state, one at a time per room. */
  private withRoom<T>(roomId: string, fn: (room: Room | undefined) => Promise<T>): Promise<T> {
    const prev = this.queues.get(roomId) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => fn(await this.store.get(roomId)));
    this.queues.set(roomId, next);
    void next.finally(() => {
      if (this.queues.get(roomId) === next) this.queues.delete(roomId);
    });
    return next;
  }
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}
