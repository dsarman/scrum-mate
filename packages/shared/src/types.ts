/**
 * Domain model. These names are the ubiquitous language of the codebase.
 * See DESIGN.md section 4.
 */

export type ParticipantId = string;
export type IssueId = string;
export type QuestionId = string;

export const ANSWER_VALUES = ['yes', 'no', 'unclear', 'na'] as const;
export type AnswerValue = (typeof ANSWER_VALUES)[number];

export const PHASES = ['filling', 'consolidating', 'consolidated', 'estimating', 'estimated'] as const;
export type Phase = (typeof PHASES)[number];

export const OUTCOMES = ['ready', 'ready_with_actions', 'not_ready'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const IMPACTS = ['blocks_estimate', 'blocks_dev', 'none'] as const;
export type Impact = (typeof IMPACTS)[number];

/** The card that means "I don't know". Always allowed as a vote, never as a final estimate. */
export const UNKNOWN_CARD = '?';
export const DEFAULT_SCALE: readonly string[] = ['1', '3', '5', '8', '13', UNKNOWN_CARD];

/** Minutes without a connected facilitator before anyone may claim the role. */
export const FACILITATOR_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export interface Question {
  id: QuestionId;
  text: string;
  hint?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  questions: Question[];
}

/** Labels in the checklist's own language, used by the export. */
export interface ChecklistLabels {
  answers: Record<AnswerValue, string>;
  outcomes: Record<Outcome, string>;
  impacts: Record<Impact, string>;
  columns: { number: string; question: string; answer: string; note: string };
  openActions: { title: string; action: string; owner: string; due: string; impact: string };
  outcomeTitle: string;
  justificationTitle: string;
  estimateTitle: string;
  concernPrefix: string;
  needsNote: string;
  noAnswer: string;
}

export interface Checklist {
  id: string;
  version: number;
  title: string;
  labels: ChecklistLabels;
  sections: ChecklistSection[];
}

export interface Participant {
  /** Public. Appears in snapshots and exports. */
  id: ParticipantId;
  name: string;
  isFacilitator: boolean;
  /** Self-set. Excluded from done-counts, auto-fill and vote agreement. */
  isObserver: boolean;
  connected: boolean;
}

export interface Answer {
  /** null means "no value yet", which is distinct from 'na'. Notes may exist without a value. */
  value: AnswerValue | null;
  note: string;
}

export interface Concern {
  participantId: ParticipantId;
  text: string;
}

export interface TeamAnswer {
  value: AnswerValue;
  note: string;
  source: 'auto' | 'facilitator';
  concerns: Concern[];
}

export interface OpenAction {
  action: string;
  owner: string;
  due: string;
  impact: Impact;
}

export interface Issue {
  id: IssueId;
  label: string;
  phase: Phase;
  createdAt: string;

  /** Individual answers. Hidden until reveal, frozen after. */
  answers: Record<ParticipantId, Record<QuestionId, Answer>>;
  done: ParticipantId[];

  /** Consolidation. Written by auto-fill at reveal and by the facilitator. */
  teamAnswers: Record<QuestionId, TeamAnswer>;
  outcome: Outcome | null;
  justification: string;
  openActions: OpenAction[];

  /** Estimation. */
  votes: Record<ParticipantId, string>;
  votesRevealed: boolean;
  finalEstimate: string | null;
}

export interface Room {
  /** Internal, stable. */
  id: string;
  /** Unguessable. The URL and the only access control. */
  slug: string;
  /** The checklist is embedded so the room carries the exact version it was created with. */
  checklist: Checklist;
  scale: string[];
  createdAt: string;
  /** Drives expiry. */
  lastActivityAt: string;
  participants: Record<ParticipantId, Participant>;
  /**
   * Participant secret -> participant id. Held server-side and in the owner's localStorage.
   * Never included in any projection.
   */
  secrets: Record<string, ParticipantId>;
  /** Set when the last connected facilitator disconnects; cleared when one connects. */
  facilitatorAbsentSince: string | null;
  currentIssueId: IssueId | null;
  /** The MVP UI shows only the current issue. Earlier issues stay here for a later history view. */
  issues: Record<IssueId, Issue>;
}
