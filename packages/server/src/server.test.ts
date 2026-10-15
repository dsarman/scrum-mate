import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from './server.js';
import { InMemoryRoomStore } from './store.js';
import { TestClient } from './test/client.js';

const SECRET_A = 'secret-a-0123456789abcdef';
const SECRET_B = 'secret-b-0123456789abcdef';

let server: RunningServer;
let store: InMemoryRoomStore;
const clients: TestClient[] = [];

async function connect(slug: string): Promise<TestClient> {
  const c = await TestClient.connect(server.port, slug);
  clients.push(c);
  return c;
}

async function createRoomSlug(): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/rooms`, { method: 'POST' });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { slug: string };
  return body.slug;
}

beforeEach(async () => {
  store = new InMemoryRoomStore();
  server = await startServer(
    { port: 0, roomTtlMs: 60_000, sweepIntervalMs: 60_000, webDist: null, checklistFile: null },
    { store },
  );
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await server.close();
});

describe('http', () => {
  it('healthz reports ok', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    expect(await res.json()).toEqual({ ok: true, connections: 0 });
  });

  it('creates a room with an unguessable slug', async () => {
    const slug = await createRoomSlug();
    expect(slug.length).toBeGreaterThanOrEqual(20);
    expect(store.size).toBe(1);
  });
});

describe('websocket', () => {
  it('refuses unknown rooms', async () => {
    const c = await connect('does-not-exist');
    const reply = await c.hello(SECRET_A, 'Ann');
    expect(reply).toEqual({ type: 'roomNotFound' });
    expect((await c.closed).code).toBe(1008);
  });

  it('requires a name for a new participant', async () => {
    const slug = await createRoomSlug();
    const c = await connect(slug);
    expect(await c.hello(SECRET_A)).toEqual({ type: 'nameRequired' });
    // same socket can retry with a name
    const snap = await c.hello(SECRET_A, 'Ann');
    expect(snap.type).toBe('snapshot');
  });

  it('two clients: blind filling, reveal, each sees the right projection', async () => {
    const slug = await createRoomSlug();
    const ann = await connect(slug);
    const bob = await connect(slug);
    await ann.hello(SECRET_A, 'Ann');
    await bob.hello(SECRET_B, 'Bob');

    // both see both participants; Ann (first) is facilitator
    await ann.untilView((v) => v.participants.length === 2);
    await bob.untilView((v) => v.participants.length === 2);
    const annId = ann.view.me;
    const bobId = bob.view.me;
    expect(annId).not.toBe(bobId);
    expect(ann.view.participants.find((p) => p.id === annId)?.isFacilitator).toBe(true);
    expect(bob.view.participants.find((p) => p.id === bobId)?.isFacilitator).toBe(false);

    // Bob answers; Ann sees that nothing leaks
    expect(await bob.command({ type: 'setAnswer', questionId: 'G1', value: 'no', note: 'bob private' })).toMatchObject({ ok: true });
    expect(await bob.command({ type: 'setDone', done: true })).toMatchObject({ ok: true });
    await ann.untilView((v) => v.issue?.done.includes(bobId) ?? false);
    expect(ann.view.issue?.answers).toBeNull();
    expect(JSON.stringify(ann.view)).not.toContain('bob private');
    expect(bob.view.issue?.myAnswers['G1']).toEqual({ value: 'no', note: 'bob private' });

    // Bob cannot reveal; Ann can
    expect(await bob.command({ type: 'reveal' })).toMatchObject({ ok: false, error: 'requires facilitator' });
    expect(await ann.command({ type: 'reveal' })).toMatchObject({ ok: true });
    await bob.untilView((v) => v.issue?.phase === 'consolidating');
    expect(bob.view.issue?.answers?.[bobId]?.['G1']).toEqual({ value: 'no', note: 'bob private' });
    expect(ann.view.issue?.answers?.[bobId]?.['G1']).toEqual({ value: 'no', note: 'bob private' });
  });

  it('rejects connection-level commands from clients', async () => {
    const slug = await createRoomSlug();
    const c = await connect(slug);
    await c.hello(SECRET_A, 'Ann');
    expect(await c.command({ type: 'join', participantId: 'x', name: 'x' })).toMatchObject({ ok: false, error: 'not allowed' });
  });

  it('reconnecting with the same secret resumes the same participant', async () => {
    const slug = await createRoomSlug();
    const first = await connect(slug);
    await first.hello(SECRET_A, 'Ann');
    const id = first.view.me;
    await first.command({ type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' });
    await first.close();

    const bob = await connect(slug);
    await bob.hello(SECRET_B, 'Bob');
    await bob.untilView((v) => v.participants.find((p) => p.id === id)?.connected === false);

    const second = await connect(slug);
    await second.hello(SECRET_A);
    expect(second.view.me).toBe(id);
    expect(second.view.issue?.myAnswers['G1']).toEqual({ value: 'yes', note: '' });
    expect(second.view.participants.find((p) => p.id === id)).toMatchObject({ name: 'Ann', connected: true });
  });

  it('closes on malformed messages', async () => {
    const slug = await createRoomSlug();
    const c = await connect(slug);
    c.send({ type: 'command', commandId: 'x', command: { type: 'reveal' } }); // before hello
    expect((await c.closed).code).toBe(1008);
  });

  it('shutdown tells clients to reconnect', async () => {
    const slug = await createRoomSlug();
    const c = await connect(slug);
    await c.hello(SECRET_A, 'Ann');
    const closed = c.closed;
    server.hub.shutdown();
    expect(await c.until((m) => m.type === 'serverRestarting')).toEqual({ type: 'serverRestarting' });
    expect((await closed).code).toBe(1001);
  });
});
