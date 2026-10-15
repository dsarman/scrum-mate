import { needsNote } from './autofill.js';
import type { Checklist, Issue, Participant, ParticipantId, TeamAnswer } from './types.js';

/**
 * Renders a consolidated issue for pasting into Jira Cloud (HTML + plain text) or into
 * Confluence and chat (Markdown). See DESIGN.md section 8.
 */

export interface ExportInput {
  issue: Issue;
  checklist: Checklist;
  participants: Record<ParticipantId, Participant>;
}

interface Row {
  id: string;
  question: string;
  answer: string;
  note: string;
}

interface Model {
  title: string;
  rows: Row[];
  outcome: string | null;
  justification: string;
  openActions: { action: string; owner: string; due: string; impact: string }[];
  estimate: string | null;
}

/** The language-neutral shape all three renderers share. */
export function buildModel({ issue, checklist, participants }: ExportInput): Model {
  const L = checklist.labels;
  const rows: Row[] = checklist.sections.flatMap((s) =>
    s.questions.map((q) => {
      const ta = issue.teamAnswers[q.id];
      return {
        id: q.id,
        question: q.text,
        answer: ta ? L.answers[ta.value] : L.noAnswer,
        note: ta ? renderNote(ta, participants, L.concernPrefix, L.needsNote) : '',
      };
    }),
  );
  return {
    title: issue.label ? `${checklist.title} — ${issue.label}` : checklist.title,
    rows,
    outcome: issue.outcome ? L.outcomes[issue.outcome] : null,
    justification: issue.justification,
    openActions: issue.openActions.map((a) => ({ ...a, impact: L.impacts[a.impact] })),
    estimate: issue.finalEstimate,
  };
}

function renderNote(
  ta: TeamAnswer,
  participants: Record<ParticipantId, Participant>,
  concernPrefix: string,
  needsNoteLabel: string,
): string {
  const lines: string[] = [];
  if (needsNote(ta)) lines.push(`⚠ ${needsNoteLabel}`);
  else if (ta.note.trim()) lines.push(ta.note.trim());
  for (const c of ta.concerns) {
    const name = participants[c.participantId]?.name ?? c.participantId;
    lines.push(`${concernPrefix} (${name}): ${c.text}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------

export function renderHtml(input: ExportInput): string {
  const L = input.checklist.labels;
  const m = buildModel(input);
  const out: string[] = [];
  out.push(`<h3>${esc(m.title)}</h3>`);
  out.push('<table><thead><tr>');
  for (const h of [L.columns.number, L.columns.question, L.columns.answer, L.columns.note]) {
    out.push(`<th>${esc(h)}</th>`);
  }
  out.push('</tr></thead><tbody>');
  for (const r of m.rows) {
    out.push(
      `<tr><td>${esc(r.id)}</td><td>${esc(r.question)}</td><td>${esc(r.answer)}</td><td>${escMultiline(r.note)}</td></tr>`,
    );
  }
  out.push('</tbody></table>');
  if (m.outcome) out.push(`<p><strong>${esc(L.outcomeTitle)}:</strong> ${esc(m.outcome)}</p>`);
  if (m.justification.trim()) {
    out.push(`<p><strong>${esc(L.justificationTitle)}:</strong> ${esc(m.justification.trim())}</p>`);
  }
  if (m.openActions.length > 0) {
    out.push(`<p><strong>${esc(L.openActions.title)}</strong></p>`);
    out.push('<table><thead><tr>');
    for (const h of [L.openActions.action, L.openActions.owner, L.openActions.due, L.openActions.impact]) {
      out.push(`<th>${esc(h)}</th>`);
    }
    out.push('</tr></thead><tbody>');
    for (const a of m.openActions) {
      out.push(`<tr><td>${esc(a.action)}</td><td>${esc(a.owner)}</td><td>${esc(a.due)}</td><td>${esc(a.impact)}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  if (m.estimate) out.push(`<p><strong>${esc(L.estimateTitle)}:</strong> ${esc(m.estimate)}</p>`);
  return out.join('\n');
}

export function renderMarkdown(input: ExportInput): string {
  const L = input.checklist.labels;
  const m = buildModel(input);
  const out: string[] = [];
  out.push(`### ${m.title}`, '');
  out.push(`| ${L.columns.number} | ${L.columns.question} | ${L.columns.answer} | ${L.columns.note} |`);
  out.push('| --- | --- | --- | --- |');
  for (const r of m.rows) {
    out.push(`| ${md(r.id)} | ${md(r.question)} | ${md(r.answer)} | ${md(r.note)} |`);
  }
  if (m.outcome) out.push('', `**${L.outcomeTitle}:** ${m.outcome}`);
  if (m.justification.trim()) out.push('', `**${L.justificationTitle}:** ${m.justification.trim()}`);
  if (m.openActions.length > 0) {
    out.push('', `**${L.openActions.title}**`, '');
    out.push(`| ${L.openActions.action} | ${L.openActions.owner} | ${L.openActions.due} | ${L.openActions.impact} |`);
    out.push('| --- | --- | --- | --- |');
    for (const a of m.openActions) {
      out.push(`| ${md(a.action)} | ${md(a.owner)} | ${md(a.due)} | ${md(a.impact)} |`);
    }
  }
  if (m.estimate) out.push('', `**${L.estimateTitle}:** ${m.estimate}`);
  return out.join('\n') + '\n';
}

export function renderText(input: ExportInput): string {
  const L = input.checklist.labels;
  const m = buildModel(input);
  const out: string[] = [];
  out.push(m.title, '');
  for (const r of m.rows) {
    out.push(`${r.id}  ${r.answer}  ${r.question}`);
    for (const line of r.note.split('\n').filter(Boolean)) out.push(`      ${line}`);
  }
  if (m.outcome) out.push('', `${L.outcomeTitle}: ${m.outcome}`);
  if (m.justification.trim()) out.push(`${L.justificationTitle}: ${m.justification.trim()}`);
  if (m.openActions.length > 0) {
    out.push('', `${L.openActions.title}:`);
    for (const a of m.openActions) {
      out.push(`- ${a.action} | ${a.owner} | ${a.due} | ${a.impact}`);
    }
  }
  if (m.estimate) out.push('', `${L.estimateTitle}: ${m.estimate}`);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escMultiline(s: string): string {
  return s.split('\n').map(esc).join('<br>');
}

function md(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
