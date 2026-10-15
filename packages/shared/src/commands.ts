import { z } from 'zod';
import { ANSWER_VALUES, IMPACTS, OUTCOMES, PHASES } from './types.js';

/**
 * Commands are what clients (and the server itself, for connection events) send to the
 * reducer. They are validated with these schemas at the server boundary.
 * See DESIGN.md section 9.
 */

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(60);
const note = z.string().max(2000);

export const OpenActionSchema = z.object({
  action: z.string().max(500),
  owner: z.string().max(100),
  due: z.string().max(100),
  impact: z.enum(IMPACTS),
});

export const CommandSchema = z.discriminatedUnion('type', [
  // --- connection (system-issued) ---
  z.object({ type: z.literal('join'), participantId: id, name }),
  z.object({ type: z.literal('disconnect'), participantId: id }),

  // --- participant ---
  z.object({ type: z.literal('setName'), name }),
  z.object({ type: z.literal('setObserver'), isObserver: z.boolean() }),
  z.object({ type: z.literal('grantFacilitator'), participantId: id }),
  z.object({ type: z.literal('claimFacilitator') }),

  // --- issue ---
  z.object({ type: z.literal('setIssueLabel'), label: z.string().max(200) }),
  z.object({ type: z.literal('nextIssue'), issueId: id, label: z.string().max(200).optional() }),
  z.object({ type: z.literal('reopen'), phase: z.enum(PHASES) }),

  // --- filling ---
  z.object({
    type: z.literal('setAnswer'),
    questionId: id,
    value: z.enum(ANSWER_VALUES).nullable(),
    note,
  }),
  z.object({ type: z.literal('setDone'), done: z.boolean() }),
  z.object({ type: z.literal('reveal') }),

  // --- consolidating ---
  z.object({
    type: z.literal('setTeamAnswer'),
    questionId: id,
    value: z.enum(ANSWER_VALUES).nullable(),
    note,
  }),
  z.object({ type: z.literal('addConcern'), questionId: id, participantId: id, text: note }),
  z.object({ type: z.literal('removeConcern'), questionId: id, index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('setOutcome'),
    outcome: z.enum(OUTCOMES).nullable(),
    justification: z.string().max(1000),
  }),
  z.object({ type: z.literal('setOpenActions'), openActions: z.array(OpenActionSchema).max(50) }),
  z.object({ type: z.literal('finishConsolidation') }),

  // --- estimating ---
  z.object({ type: z.literal('startEstimation') }),
  z.object({ type: z.literal('vote'), value: z.string().max(10).nullable() }),
  z.object({ type: z.literal('revealVotes') }),
  z.object({ type: z.literal('revote') }),
  z.object({ type: z.literal('setFinalEstimate'), value: z.string().max(10) }),
]);

export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command['type'];
