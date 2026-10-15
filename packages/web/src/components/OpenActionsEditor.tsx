import { IMPACTS, type OpenAction } from '@scrum-mate/shared';
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../room-context.js';

const EMPTY: OpenAction = { action: '', owner: '', due: '', impact: 'none' };

export function OpenActionsEditor() {
  const { view, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const L = view.checklist.labels;

  // Local draft of the whole table, sent as one command after a short idle period.
  const [rows, setRows] = useState<OpenAction[]>(issue.openActions);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirty.current) setRows(issue.openActions);
  }, [issue.openActions]);

  const update = (next: OpenAction[]) => {
    setRows(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      void send({ type: 'setOpenActions', openActions: next.filter((r) => r.action.trim()) });
    }, 500);
  };

  const patch = (i: number, p: Partial<OpenAction>) => update(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  return (
    <div className="section open-actions">
      <h2>{L.openActions.title}</h2>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{L.openActions.action}</th>
              <th>{L.openActions.owner}</th>
              <th>{L.openActions.due}</th>
              <th>{L.openActions.impact}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input disabled={!isFacilitator} value={r.action} onChange={(e) => patch(i, { action: e.target.value })} />
                </td>
                <td>
                  <input disabled={!isFacilitator} value={r.owner} onChange={(e) => patch(i, { owner: e.target.value })} />
                </td>
                <td>
                  <input disabled={!isFacilitator} value={r.due} onChange={(e) => patch(i, { due: e.target.value })} />
                </td>
                <td>
                  <select
                    disabled={!isFacilitator}
                    value={r.impact}
                    onChange={(e) => patch(i, { impact: e.target.value as OpenAction['impact'] })}
                  >
                    {IMPACTS.map((im) => (
                      <option key={im} value={im}>
                        {L.impacts[im]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {isFacilitator && (
                    <button className="link" onClick={() => update(rows.filter((_, idx) => idx !== i))}>
                      remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isFacilitator && <button onClick={() => update([...rows, EMPTY])}>Add action</button>}
    </div>
  );
}
