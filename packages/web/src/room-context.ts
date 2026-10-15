import type { Command, Participant, RoomView } from '@scrum-mate/shared';
import { createContext, useContext } from 'react';
import type { CommandResult } from './connection.js';

export interface RoomCtx {
  view: RoomView;
  me: Participant;
  isFacilitator: boolean;
  send: (command: Command) => Promise<CommandResult>;
}

export const RoomContext = createContext<RoomCtx | null>(null);

export function useRoom(): RoomCtx {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom outside RoomContext');
  return ctx;
}

export function participantName(view: RoomView, id: string): string {
  return view.participants.find((p) => p.id === id)?.name ?? '?';
}
