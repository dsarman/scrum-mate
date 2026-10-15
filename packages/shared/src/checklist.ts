import { z } from 'zod';
import type { Checklist, Question, QuestionId } from './types.js';
import { ANSWER_VALUES, IMPACTS, OUTCOMES } from './types.js';

export function allQuestions(checklist: Checklist): Question[] {
  return checklist.sections.flatMap((s) => s.questions);
}

export function hasQuestion(checklist: Checklist, questionId: QuestionId): boolean {
  return allQuestions(checklist).some((q) => q.id === questionId);
}

const text = z.string().min(1).max(500);

/** Validates a checklist loaded from a file. Question ids must be unique. */
export const ChecklistSchema = z
  .object({
    id: z.string().min(1).max(64),
    version: z.number().int().positive(),
    title: text,
    labels: z.object({
      answers: z.object(Object.fromEntries(ANSWER_VALUES.map((v) => [v, text])) as Record<(typeof ANSWER_VALUES)[number], typeof text>),
      outcomes: z.object(Object.fromEntries(OUTCOMES.map((v) => [v, text])) as Record<(typeof OUTCOMES)[number], typeof text>),
      impacts: z.object(Object.fromEntries(IMPACTS.map((v) => [v, text])) as Record<(typeof IMPACTS)[number], typeof text>),
      columns: z.object({ number: text, question: text, answer: text, note: text }),
      openActions: z.object({ title: text, action: text, owner: text, due: text, impact: text }),
      outcomeTitle: text,
      justificationTitle: text,
      estimateTitle: text,
      concernPrefix: text,
      needsNote: text,
      noAnswer: text,
    }),
    sections: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          title: text,
          questions: z
            .array(z.object({ id: z.string().min(1).max(16), text, hint: text.optional() }))
            .min(1),
        }),
      )
      .min(1),
  })
  .superRefine((c, ctx) => {
    const ids = c.sections.flatMap((s) => s.questions.map((q) => q.id));
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate question id ${dup}` });
  });

export function parseChecklist(input: unknown): Checklist {
  return ChecklistSchema.parse(input) as Checklist;
}
