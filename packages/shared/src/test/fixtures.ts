import { DEFAULT_CHECKLIST } from '../checklists/default.js';
import type { Command } from '../commands.js';
import { SYSTEM, apply, createRoom, type Ctx } from '../reducer.js';
import type { AnswerValue, ParticipantId, Room } from '../types.js';

export const T0 = '2026-10-15T09:00:00.000Z';

export function at(minutesAfterT0: number): string {
  return new Date(Date.parse(T0) + minutesAfterT0 * 60_000).toISOString();
}

export function ctx(actorId: ParticipantId | typeof SYSTEM, now = T0): Ctx {
  return { actorId, now };
}

/** Apply a command that must succeed; throws otherwise so tests fail loudly. */
export function run(room: Room, cmd: Command, c: Ctx): Room {
  const r = apply(room, cmd, c);
  if (!r.ok) throw new Error(`apply(${cmd.type}) failed: ${r.error}`);
  return r.state;
}

/** Apply a command that must fail; returns the error message. */
export function reject(room: Room, cmd: Command, c: Ctx): string {
  const r = apply(room, cmd, c);
  if (r.ok) throw new Error(`apply(${cmd.type}) unexpectedly succeeded`);
  return r.error;
}

export function emptyRoom(): Room {
  return createRoom({
    id: 'room-1',
    slug: 'slug-1',
    checklist: DEFAULT_CHECKLIST,
    firstIssueId: 'issue-1',
    now: T0,
  });
}

/** A room where `names[0]` joined first and is therefore facilitator. */
export function roomWith(...names: string[]): Room {
  let room = emptyRoom();
  for (const n of names) {
    room = run(room, { type: 'join', participantId: n, name: n }, ctx(SYSTEM));
  }
  return room;
}

export function answerAll(room: Room, pid: ParticipantId, value: AnswerValue, note = ''): Room {
  for (const s of room.checklist.sections) {
    for (const q of s.questions) {
      room = run(room, { type: 'setAnswer', questionId: q.id, value, note }, ctx(pid));
    }
  }
  return room;
}

export const QUESTION_IDS = DEFAULT_CHECKLIST.sections.flatMap((s) => s.questions.map((q) => q.id));
