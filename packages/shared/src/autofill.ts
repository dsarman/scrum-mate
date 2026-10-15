import { allQuestions } from './checklist.js';
import type {
  AnswerValue,
  Checklist,
  Issue,
  Participant,
  ParticipantId,
  QuestionId,
  TeamAnswer,
} from './types.js';
import { UNKNOWN_CARD } from './types.js';

/** Participants whose answers and votes count. */
export function countingParticipants(
  participants: Record<ParticipantId, Participant>,
): ParticipantId[] {
  return Object.values(participants)
    .filter((p) => !p.isObserver)
    .map((p) => p.id);
}

/**
 * The auto-fill rule (DESIGN.md section 6): among non-observer participants who have a
 * value for the question, at least two values exist and they are all equal.
 */
export function agreedValue(
  issue: Issue,
  questionId: QuestionId,
  counting: ParticipantId[],
): AnswerValue | null {
  const values: AnswerValue[] = [];
  for (const pid of counting) {
    const v = issue.answers[pid]?.[questionId]?.value;
    if (v) values.push(v);
  }
  if (values.length < 2) return null;
  const first = values[0]!;
  return values.every((v) => v === first) ? first : null;
}

/**
 * Compute team answers at reveal. Rows the facilitator already decided (for example after
 * a reopen) are kept; everything else is replaced by the auto-fill result or cleared.
 */
export function autoFill(
  issue: Issue,
  checklist: Checklist,
  participants: Record<ParticipantId, Participant>,
): Record<QuestionId, TeamAnswer> {
  const counting = countingParticipants(participants);
  const result: Record<QuestionId, TeamAnswer> = {};
  for (const q of allQuestions(checklist)) {
    const existing = issue.teamAnswers[q.id];
    if (existing?.source === 'facilitator') {
      result[q.id] = existing;
      continue;
    }
    const value = agreedValue(issue, q.id, counting);
    if (value) {
      result[q.id] = { value, note: '', source: 'auto', concerns: [] };
    }
  }
  return result;
}

/**
 * Pre-fill for the final estimate: all non-observer votes agree, at least two of them,
 * and the agreed card is not the unknown card.
 */
export function suggestedEstimate(
  issue: Issue,
  participants: Record<ParticipantId, Participant>,
): string | null {
  const votes = countingParticipants(participants)
    .map((pid) => issue.votes[pid])
    .filter((v): v is string => typeof v === 'string');
  if (votes.length < 2) return null;
  const first = votes[0]!;
  if (first === UNKNOWN_CARD) return null;
  return votes.every((v) => v === first) ? first : null;
}

/** A team answer of No or Unclear must carry a note. */
export function needsNote(answer: TeamAnswer): boolean {
  return (answer.value === 'no' || answer.value === 'unclear') && answer.note.trim() === '';
}
