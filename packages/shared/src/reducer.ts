import { autoFill } from './autofill.js';
import { hasQuestion } from './checklist.js';
import type { Command } from './commands.js';
import type {
  Checklist,
  Issue,
  IssueId,
  Participant,
  ParticipantId,
  Phase,
  Room,
} from './types.js';
import { DEFAULT_SCALE, FACILITATOR_CLAIM_TIMEOUT_MS, PHASES, UNKNOWN_CARD } from './types.js';

/** The reducer never generates ids or reads the clock; the caller supplies both. */
export const SYSTEM = 'system' as const;

export interface Ctx {
  actorId: ParticipantId | typeof SYSTEM;
  /** ISO timestamp. */
  now: string;
}

export type ApplyResult = { ok: true; state: Room } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createIssue(id: IssueId, label: string, now: string): Issue {
  return {
    id,
    label,
    phase: 'filling',
    createdAt: now,
    answers: {},
    done: [],
    teamAnswers: {},
    outcome: null,
    justification: '',
    openActions: [],
    votes: {},
    votesRevealed: false,
    finalEstimate: null,
  };
}

export function createRoom(args: {
  id: string;
  slug: string;
  checklist: Checklist;
  firstIssueId: IssueId;
  now: string;
  scale?: readonly string[];
}): Room {
  const issue = createIssue(args.firstIssueId, '', args.now);
  return {
    id: args.id,
    slug: args.slug,
    checklist: args.checklist,
    scale: [...(args.scale ?? DEFAULT_SCALE)],
    createdAt: args.now,
    lastActivityAt: args.now,
    participants: {},
    secrets: {},
    facilitatorAbsentSince: null,
    currentIssueId: issue.id,
    issues: { [issue.id]: issue },
  };
}

/** Register a secret for a participant id. Done by the server before `join`. */
export function registerSecret(room: Room, secret: string, participantId: ParticipantId): Room {
  return { ...room, secrets: { ...room.secrets, [secret]: participantId } };
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export function apply(room: Room, cmd: Command, ctx: Ctx): ApplyResult {
  const r = applyInner(room, cmd, ctx);
  if (!r.ok) return r;
  return { ok: true, state: { ...r.state, lastActivityAt: ctx.now } };
}

const fail = (error: string): ApplyResult => ({ ok: false, error });
const ok = (state: Room): ApplyResult => ({ ok: true, state });

function applyInner(room: Room, cmd: Command, ctx: Ctx): ApplyResult {
  switch (cmd.type) {
    // --- connection ---
    case 'join':
      return join(room, cmd.participantId, cmd.name, ctx);
    case 'disconnect':
      return disconnect(room, cmd.participantId, ctx);

    // --- participant ---
    case 'setName':
      return withActor(room, ctx, (p) => ok(putParticipant(room, { ...p, name: cmd.name })));
    case 'setObserver':
      return withActor(room, ctx, (p) =>
        ok(putParticipant(room, { ...p, isObserver: cmd.isObserver })),
      );
    case 'grantFacilitator':
      return withFacilitator(room, ctx, () => {
        const target = room.participants[cmd.participantId];
        if (!target) return fail('unknown participant');
        return ok(
          clearAbsence(putParticipant(room, { ...target, isFacilitator: true }), target.connected),
        );
      });
    case 'claimFacilitator':
      return withActor(room, ctx, (p) => {
        if (p.isFacilitator) return ok(room);
        if (!claimAvailable(room, ctx.now)) return fail('a facilitator is present');
        return ok(clearAbsence(putParticipant(room, { ...p, isFacilitator: true }), p.connected));
      });

    // --- issue ---
    case 'setIssueLabel':
      return withFacilitator(room, ctx, () => withIssue(room, (i) => ok(putIssue(room, { ...i, label: cmd.label }))));
    case 'nextIssue':
      return withFacilitator(room, ctx, () => {
        if (room.issues[cmd.issueId]) return fail('issue id already exists');
        const issue = createIssue(cmd.issueId, cmd.label ?? '', ctx.now);
        return ok({
          ...room,
          currentIssueId: issue.id,
          issues: { ...room.issues, [issue.id]: issue },
        });
      });
    case 'reopen':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (phaseIndex(cmd.phase) >= phaseIndex(i.phase)) {
            return fail('reopen must move to an earlier phase');
          }
          const next: Issue = { ...i, phase: cmd.phase };
          if (phaseIndex(cmd.phase) < phaseIndex('estimated')) next.finalEstimate = null;
          return ok(putIssue(room, next));
        }),
      );

    // --- filling ---
    case 'setAnswer':
      return withActor(room, ctx, (p) =>
        withIssue(room, (i) => {
          if (i.phase !== 'filling') return fail('answers are frozen');
          if (!hasQuestion(room.checklist, cmd.questionId)) return fail('unknown question');
          const mine = { ...(i.answers[p.id] ?? {}), [cmd.questionId]: { value: cmd.value, note: cmd.note } };
          return ok(putIssue(room, { ...i, answers: { ...i.answers, [p.id]: mine } }));
        }),
      );
    case 'setDone':
      return withActor(room, ctx, (p) =>
        withIssue(room, (i) => {
          if (i.phase !== 'filling') return fail('answers are frozen');
          const done = i.done.filter((id) => id !== p.id);
          if (cmd.done) done.push(p.id);
          return ok(putIssue(room, { ...i, done }));
        }),
      );
    case 'reveal':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'filling') return fail('not in filling phase');
          const teamAnswers = autoFill(i, room.checklist, room.participants);
          return ok(putIssue(room, { ...i, phase: 'consolidating', teamAnswers }));
        }),
      );

    // --- consolidating ---
    case 'setTeamAnswer':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'consolidating') return fail('not in consolidating phase');
          if (!hasQuestion(room.checklist, cmd.questionId)) return fail('unknown question');
          const teamAnswers = { ...i.teamAnswers };
          if (cmd.value === null) {
            delete teamAnswers[cmd.questionId];
          } else {
            teamAnswers[cmd.questionId] = {
              value: cmd.value,
              note: cmd.note,
              source: 'facilitator',
              concerns: i.teamAnswers[cmd.questionId]?.concerns ?? [],
            };
          }
          return ok(putIssue(room, { ...i, teamAnswers }));
        }),
      );
    case 'addConcern':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'consolidating') return fail('not in consolidating phase');
          const row = i.teamAnswers[cmd.questionId];
          if (!row) return fail('team answer not set');
          if (!room.participants[cmd.participantId]) return fail('unknown participant');
          const concerns = [...row.concerns, { participantId: cmd.participantId, text: cmd.text }];
          return ok(putIssue(room, { ...i, teamAnswers: { ...i.teamAnswers, [cmd.questionId]: { ...row, concerns } } }));
        }),
      );
    case 'removeConcern':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'consolidating') return fail('not in consolidating phase');
          const row = i.teamAnswers[cmd.questionId];
          if (!row || cmd.index >= row.concerns.length) return fail('no such concern');
          const concerns = row.concerns.filter((_, idx) => idx !== cmd.index);
          return ok(putIssue(room, { ...i, teamAnswers: { ...i.teamAnswers, [cmd.questionId]: { ...row, concerns } } }));
        }),
      );
    case 'setOutcome':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (!isConsolidationPhase(i.phase)) return fail('not consolidating');
          return ok(putIssue(room, { ...i, outcome: cmd.outcome, justification: cmd.justification }));
        }),
      );
    case 'setOpenActions':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (!isConsolidationPhase(i.phase)) return fail('not consolidating');
          return ok(putIssue(room, { ...i, openActions: cmd.openActions }));
        }),
      );
    case 'finishConsolidation':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'consolidating') return fail('not in consolidating phase');
          return ok(putIssue(room, { ...i, phase: 'consolidated' }));
        }),
      );

    // --- estimating ---
    case 'startEstimation':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          // From 'filling' the checklist is skipped; from 'consolidated' it is the normal path.
          if (i.phase !== 'filling' && i.phase !== 'consolidated') {
            return fail('estimation can start from filling or consolidated');
          }
          return ok(putIssue(room, { ...i, phase: 'estimating' }));
        }),
      );
    case 'vote':
      return withActor(room, ctx, (p) =>
        withIssue(room, (i) => {
          if (i.phase !== 'estimating') return fail('not in estimating phase');
          if (i.votesRevealed) return fail('votes are revealed');
          if (p.isObserver) return fail('observers do not vote');
          const votes = { ...i.votes };
          if (cmd.value === null) {
            delete votes[p.id];
          } else {
            if (!room.scale.includes(cmd.value)) return fail('value not in scale');
            votes[p.id] = cmd.value;
          }
          return ok(putIssue(room, { ...i, votes }));
        }),
      );
    case 'revealVotes':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'estimating') return fail('not in estimating phase');
          return ok(putIssue(room, { ...i, votesRevealed: true }));
        }),
      );
    case 'revote':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'estimating') return fail('not in estimating phase');
          return ok(putIssue(room, { ...i, votes: {}, votesRevealed: false }));
        }),
      );
    case 'setFinalEstimate':
      return withFacilitator(room, ctx, () =>
        withIssue(room, (i) => {
          if (i.phase !== 'estimating') return fail('not in estimating phase');
          if (!room.scale.includes(cmd.value) || cmd.value === UNKNOWN_CARD) {
            return fail('final estimate must be a number from the scale');
          }
          return ok(putIssue(room, { ...i, phase: 'estimated', finalEstimate: cmd.value }));
        }),
      );
  }
}

// ---------------------------------------------------------------------------
// Connection handling
// ---------------------------------------------------------------------------

function join(room: Room, participantId: ParticipantId, name: string, ctx: Ctx): ApplyResult {
  if (ctx.actorId !== SYSTEM) return fail('join is system-issued');
  const existing = room.participants[participantId];
  const participant: Participant = existing
    ? { ...existing, name, connected: true }
    : {
        id: participantId,
        name,
        // The first participant to join an unfacilitated room becomes facilitator.
        isFacilitator: !Object.values(room.participants).some((p) => p.isFacilitator),
        isObserver: false,
        connected: true,
      };
  return ok(clearAbsence(putParticipant(room, participant), participant.isFacilitator));
}

function disconnect(room: Room, participantId: ParticipantId, ctx: Ctx): ApplyResult {
  if (ctx.actorId !== SYSTEM) return fail('disconnect is system-issued');
  const existing = room.participants[participantId];
  if (!existing) return fail('unknown participant');
  let next = putParticipant(room, { ...existing, connected: false });
  if (existing.isFacilitator && !anyFacilitatorConnected(next) && next.facilitatorAbsentSince === null) {
    next = { ...next, facilitatorAbsentSince: ctx.now };
  }
  return ok(next);
}

/** Anyone may claim the role when no facilitator exists or none has been connected for the timeout. */
export function claimAvailable(room: Room, now: string): boolean {
  const facilitators = Object.values(room.participants).filter((p) => p.isFacilitator);
  if (facilitators.length === 0) return true;
  if (anyFacilitatorConnected(room)) return false;
  if (room.facilitatorAbsentSince === null) return false;
  return Date.parse(now) - Date.parse(room.facilitatorAbsentSince) >= FACILITATOR_CLAIM_TIMEOUT_MS;
}

function anyFacilitatorConnected(room: Room): boolean {
  return Object.values(room.participants).some((p) => p.isFacilitator && p.connected);
}

/** Clear the absence marker when a connected facilitator appears. */
function clearAbsence(room: Room, facilitatorConnected: boolean): Room {
  if (!facilitatorConnected) return room;
  return room.facilitatorAbsentSince === null ? room : { ...room, facilitatorAbsentSince: null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withActor(room: Room, ctx: Ctx, f: (p: Participant) => ApplyResult): ApplyResult {
  if (ctx.actorId === SYSTEM) return fail('requires a participant');
  const p = room.participants[ctx.actorId];
  if (!p) return fail('unknown participant');
  return f(p);
}

function withFacilitator(room: Room, ctx: Ctx, f: (p: Participant) => ApplyResult): ApplyResult {
  return withActor(room, ctx, (p) => (p.isFacilitator ? f(p) : fail('requires facilitator')));
}

function withIssue(room: Room, f: (i: Issue) => ApplyResult): ApplyResult {
  const issue = room.currentIssueId ? room.issues[room.currentIssueId] : undefined;
  if (!issue) return fail('no current issue');
  return f(issue);
}

function putParticipant(room: Room, p: Participant): Room {
  return { ...room, participants: { ...room.participants, [p.id]: p } };
}

function putIssue(room: Room, i: Issue): Room {
  return { ...room, issues: { ...room.issues, [i.id]: i } };
}

export function currentIssue(room: Room): Issue | null {
  return room.currentIssueId ? (room.issues[room.currentIssueId] ?? null) : null;
}

function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

function isConsolidationPhase(phase: Phase): boolean {
  return phase === 'consolidating' || phase === 'consolidated';
}
