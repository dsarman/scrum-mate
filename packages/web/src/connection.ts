import type { ClientMessage, Command, RoomView, ServerMessage } from '@scrum-mate/shared';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { loadIdentity, saveIdentity, type Identity } from './identity.js';

export type Status =
  | 'connecting'
  | 'nameRequired'
  | 'connected'
  | 'disconnected'
  | 'restarting'
  | 'roomNotFound';

export interface ConnectionState {
  status: Status;
  view: RoomView | null;
}

export type CommandResult = { ok: true } | { ok: false; error: string };

/**
 * One WebSocket to one room. Reconnects with backoff, re-sends hello, and resolves
 * each command with the server's result. The latest snapshot is the whole UI state.
 */
export class RoomConnection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = { status: 'connecting', view: null };
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, (r: CommandResult) => void>();
  private identity: Identity;
  private attempt = 0;
  private stopped = false;
  private seq = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly slug: string) {
    this.identity = loadIdentity();
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  getState = (): ConnectionState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Supply a display name (first visit) and retry hello on the open socket. */
  setName(name: string): void {
    this.identity = { ...this.identity, name };
    saveIdentity(this.identity);
    this.sendHello();
  }

  send(command: Command): Promise<CommandResult> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.state.status !== 'connected') {
      return Promise.resolve({ ok: false, error: 'not connected' });
    }
    const commandId = `c${++this.seq}`;
    return new Promise((resolve) => {
      this.pending.set(commandId, resolve);
      this.transmit({ type: 'command', commandId, command });
    });
  }

  // ---------------------------------------------------------------------------

  private open(): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/${this.slug}`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.sendHello();
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending('connection closed');
      if (this.stopped || this.state.status === 'roomNotFound') return;
      if (this.state.status !== 'restarting') this.setState({ status: 'disconnected' });
      this.scheduleReconnect();
    };
  }

  private sendHello(): void {
    const msg: ClientMessage =
      this.identity.name === null
        ? { type: 'hello', secret: this.identity.secret }
        : { type: 'hello', secret: this.identity.secret, name: this.identity.name };
    this.transmit(msg);
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'snapshot':
        this.setState({ status: 'connected', view: msg.view });
        break;
      case 'result': {
        const resolve = this.pending.get(msg.commandId);
        this.pending.delete(msg.commandId);
        resolve?.(msg.ok ? { ok: true } : { ok: false, error: msg.error });
        break;
      }
      case 'nameRequired':
        this.setState({ status: 'nameRequired' });
        break;
      case 'roomNotFound':
        this.setState({ status: 'roomNotFound', view: null });
        break;
      case 'serverRestarting':
        this.setState({ status: 'restarting' });
        break;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(10_000, 1000 * 2 ** this.attempt++);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private failPending(error: string): void {
    for (const resolve of this.pending.values()) resolve({ ok: false, error });
    this.pending.clear();
  }

  private transmit(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private setState(patch: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
}

export function useRoomConnection(slug: string): { conn: RoomConnection; state: ConnectionState } {
  const conn = useMemo(() => new RoomConnection(slug), [slug]);
  useEffect(() => {
    conn.start();
    return () => conn.stop();
  }, [conn]);
  const state = useSyncExternalStore(conn.subscribe, conn.getState);
  return { conn, state };
}
