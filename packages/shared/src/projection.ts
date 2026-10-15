import { suggestedEstimate } from './autofill.js';
import { claimAvailable, currentIssue } from './reducer.js';
import type {
  Answer,
  Checklist,
  Issue,
  IssueId,
  OpenAction,
  Outcome,
  Participant,
  ParticipantId,
  Phase,
  QuestionId,
  Room,
  TeamAnswer,
} from './types.js';

/**
 * What one viewer is allowed to see. This is the security boundary: hidden answers and
 * votes, and all secrets, never leave the server. See DESIGN.md section 9.
 */
export interface RoomView {
  roomId: string;
  slug: string;
  checklist: Checklist;
  scale: string[];
  me: ParticipantId;
  participants: Participant[];
  /** True when the viewer may claim the facilitator role right now. */
  claimAvailable: boolean;
  issue: IssueView | null;
}

export interface IssueView {
  id: IssueId;
  label: string;
  phase: Phase;

  myAnswers: Record<QuestionId, Answer>;
  done: ParticipantId[];
  /** Everyone's answers. null while filling. */
  answers: Record<ParticipantId, Record<QuestionId, Answer>> | null;

  teamAnswers: Record<QuestionId, TeamAnswer>;
  outcome: Outcome | null;
  justification: string;
  openActions: OpenAction[];

  myVote: string | null;
  /** Who has voted, always visible. */
  voted: ParticipantId[];
  /** Everyone's votes. null until revealed. */
  votes: Record<ParticipantId, string> | null;
  votesRevealed: boolean;
  suggestedEstimate: string | null;
  finalEstimate: string | null;
}

export function project(room: Room, viewerId: ParticipantId, now: string): RoomView {
  const issue = currentIssue(room);
  return {
    roomId: room.id,
    slug: room.slug,
    checklist: room.checklist,
    scale: room.scale,
    me: viewerId,
    participants: Object.values(room.participants),
    claimAvailable: claimAvailable(room, now),
    issue: issue ? projectIssue(issue, room, viewerId) : null,
  };
}

function projectIssue(issue: Issue, room: Room, viewerId: ParticipantId): IssueView {
  const revealed = issue.phase !== 'filling';
  return {
    id: issue.id,
    label: issue.label,
    phase: issue.phase,

    myAnswers: issue.answers[viewerId] ?? {},
    done: issue.done,
    answers: revealed ? issue.answers : null,

    teamAnswers: issue.teamAnswers,
    outcome: issue.outcome,
    justification: issue.justification,
    openActions: issue.openActions,

    myVote: issue.votes[viewerId] ?? null,
    voted: Object.keys(issue.votes),
    votes: issue.votesRevealed ? issue.votes : null,
    votesRevealed: issue.votesRevealed,
    suggestedEstimate: issue.votesRevealed ? suggestedEstimate(issue, room.participants) : null,
    finalEstimate: issue.finalEstimate,
  };
}
