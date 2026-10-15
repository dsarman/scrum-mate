import type { ClientMessage, Command, RoomView, ServerMessage } from '@scrum-mate/shared';
import WebSocket from 'ws';

/** A minimal test client: sends hello/commands, records every server message. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  private readonly socket: WebSocket;
  private waiters: ((m: ServerMessage) => void)[] = [];
  private seq = 0;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(msg);
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w(msg);
    });
  }

  static async connect(port: number, slug: string): Promise<TestClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/${slug}`);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new TestClient(socket);
  }

  send(msg: ClientMessage): void {
    this.socket.send(JSON.stringify(msg));
  }

  /** Send hello and wait for the first snapshot (or a refusal). */
  async hello(secret: string, name?: string): Promise<ServerMessage> {
    const p = this.next();
    this.send(name === undefined ? { type: 'hello', secret } : { type: 'hello', secret, name });
    return p;
  }

  /** Send a command and wait for its result. */
  async command(command: Command): Promise<Extract<ServerMessage, { type: 'result' }>> {
    const commandId = `c${++this.seq}`;
    const p = this.until((m) => m.type === 'result' && m.commandId === commandId);
    this.send({ type: 'command', commandId, command });
    return (await p) as Extract<ServerMessage, { type: 'result' }>;
  }

  /** The most recent snapshot received. */
  get view(): RoomView {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (m.type === 'snapshot') return m.view;
    }
    throw new Error('no snapshot received');
  }

  next(): Promise<ServerMessage> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async until(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(pred);
      if (found) return found;
      if (Date.now() > deadline) throw new Error('timed out waiting for message');
      await Promise.race([this.next(), new Promise((r) => setTimeout(r, 50))]);
    }
  }

  /** Wait until the latest snapshot satisfies `pred`. */
  async untilView(pred: (v: RoomView) => boolean, timeoutMs = 2000): Promise<RoomView> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (pred(this.view)) return this.view;
      } catch {
        /* no snapshot yet */
      }
      if (Date.now() > deadline) throw new Error('timed out waiting for view');
      await Promise.race([this.next(), new Promise((r) => setTimeout(r, 50))]);
    }
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }

  get closed(): Promise<{ code: number }> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve({ code: -1 });
    return new Promise((resolve) => this.socket.once('close', (code) => resolve({ code })));
  }
}
