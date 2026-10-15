import { buildModel } from '@scrum-mate/shared';
import { useState } from 'react';
import { copyForJira, copyMarkdown, exportInput } from '../clipboard.js';
import { useRoom } from '../room-context.js';

/** Read-only result for the consolidated and estimated phases. */
export function Summary() {
  const { view, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const L = view.checklist.labels;

  return (
    <section className="summary">
      <div className="toolbar">
        <CopyButtons />
        {isFacilitator && issue.phase === 'consolidated' && (
          <>
            <button className="primary" onClick={() => void send({ type: 'startEstimation' })}>
              Start estimation
            </button>
            <button onClick={() => void send({ type: 'reopen', phase: 'consolidating' })}>Back to consolidation</button>
          </>
        )}
        {isFacilitator && issue.phase === 'estimated' && (
          <>
            <button className="primary" onClick={() => void send({ type: 'nextIssue', issueId: crypto.randomUUID() })}>
              Next issue
            </button>
            <button onClick={() => void send({ type: 'reopen', phase: 'estimating' })}>Back to estimation</button>
          </>
        )}
      </div>
      {issue.finalEstimate && (
        <p className="estimate">
          {L.estimateTitle}: <strong>{issue.finalEstimate}</strong>
        </p>
      )}
      <ChecklistSummary />
    </section>
  );
}

export function ChecklistSummary() {
  const { view } = useRoom();
  const L = view.checklist.labels;
  const input = exportInput(view);
  if (!input) return null;
  const m = buildModel(input);
  return (
    <div className="checklist-summary">
      <table>
        <thead>
          <tr>
            <th>{L.columns.number}</th>
            <th>{L.columns.question}</th>
            <th>{L.columns.answer}</th>
            <th>{L.columns.note}</th>
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.question}</td>
              <td>{r.answer}</td>
              <td className="pre">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m.outcome && (
        <p>
          <strong>{L.outcomeTitle}:</strong> {m.outcome}
        </p>
      )}
      {m.justification.trim() && (
        <p>
          <strong>{L.justificationTitle}:</strong> {m.justification}
        </p>
      )}
      {m.openActions.length > 0 && (
        <>
          <p>
            <strong>{L.openActions.title}</strong>
          </p>
          <table>
            <thead>
              <tr>
                <th>{L.openActions.action}</th>
                <th>{L.openActions.owner}</th>
                <th>{L.openActions.due}</th>
                <th>{L.openActions.impact}</th>
              </tr>
            </thead>
            <tbody>
              {m.openActions.map((a, i) => (
                <tr key={i}>
                  <td>{a.action}</td>
                  <td>{a.owner}</td>
                  <td>{a.due}</td>
                  <td>{a.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function CopyButtons() {
  const { view } = useRoom();
  const [status, setStatus] = useState<string | null>(null);
  const input = exportInput(view);
  if (!input) return null;

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      setStatus(`${label} copied`);
    } catch {
      setStatus('Copy failed');
    }
    setTimeout(() => setStatus(null), 1500);
  };

  return (
    <span className="copy-buttons">
      <button onClick={() => void run('Jira', () => copyForJira(input))}>Copy for Jira</button>
      <button onClick={() => void run('Markdown', () => copyMarkdown(input))}>Copy as Markdown</button>
      {status && <span className="hint">{status}</span>}
    </span>
  );
}
