import { z } from 'zod';
import { CommandSchema } from './commands.js';
import type { RoomView } from './projection.js';

/**
 * WebSocket message envelopes. Client -> server messages are validated with these
 * schemas; server -> client messages are typed only.
 */

export const ClientMessageSchema = z.discriminatedUnion('type', [
  /** First message on a connection. `name` is required only for a new participant. */
  z.object({
    type: z.literal('hello'),
    secret: z.string().min(16).max(128),
    name: z.string().trim().min(1).max(60).optional(),
  }),
  z.object({
    type: z.literal('command'),
    commandId: z.string().min(1).max(64),
    command: CommandSchema,
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type ServerMessage =
  | { type: 'snapshot'; view: RoomView }
  | { type: 'result'; commandId: string; ok: true }
  | { type: 'result'; commandId: string; ok: false; error: string }
  | { type: 'roomNotFound' }
  | { type: 'nameRequired' }
  | { type: 'serverRestarting' };
