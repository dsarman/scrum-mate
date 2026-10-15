import {
  renderHtml,
  renderMarkdown,
  renderText,
  type ExportInput,
  type Issue,
  type Participant,
  type RoomView,
} from '@scrum-mate/shared';

/** The export renderers take a full Issue; rebuild one from the projection. */
export function exportInput(view: RoomView): ExportInput | null {
  const iv = view.issue;
  if (!iv) return null;
  const issue: Issue = {
    id: iv.id,
    label: iv.label,
    phase: iv.phase,
    createdAt: '',
    answers: iv.answers ?? {},
    done: iv.done,
    teamAnswers: iv.teamAnswers,
    outcome: iv.outcome,
    justification: iv.justification,
    openActions: iv.openActions,
    votes: iv.votes ?? {},
    votesRevealed: iv.votesRevealed,
    finalEstimate: iv.finalEstimate,
  };
  const participants: Record<string, Participant> = {};
  for (const p of view.participants) participants[p.id] = p;
  return { issue, checklist: view.checklist, participants };
}

/** HTML + plain text on the clipboard: Jira Cloud pastes the table, everything else gets text. */
export async function copyForJira(input: ExportInput): Promise<void> {
  const html = renderHtml(input);
  const text = renderText(input);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export async function copyMarkdown(input: ExportInput): Promise<void> {
  await navigator.clipboard.writeText(renderMarkdown(input));
}
