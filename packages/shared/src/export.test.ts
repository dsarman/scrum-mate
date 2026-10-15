import { describe, expect, it } from 'vitest';
import { buildModel, renderHtml, renderMarkdown, renderText } from './export.js';
import { currentIssue } from './reducer.js';
import { answerAll, ctx, roomWith, run } from './test/fixtures.js';

function consolidatedRoom() {
  let room = roomWith('ann', 'bob');
  room = answerAll(room, 'ann', 'yes');
  room = answerAll(room, 'bob', 'yes');
  room = run(room, { type: 'setAnswer', questionId: 'T4', value: 'no', note: 'breaks | v1' }, ctx('bob'));
  room = run(room, { type: 'setAnswer', questionId: 'B3', value: 'na', note: '' }, ctx('ann'));
  room = run(room, { type: 'setAnswer', questionId: 'B3', value: 'na', note: '' }, ctx('bob'));
  room = run(room, { type: 'reveal' }, ctx('ann'));
  room = run(room, { type: 'setTeamAnswer', questionId: 'T4', value: 'no', note: 'Accepted <break>' }, ctx('ann'));
  room = run(room, { type: 'addConcern', questionId: 'T4', participantId: 'bob', text: 'breaks | v1' }, ctx('ann'));
  room = run(room, { type: 'setTeamAnswer', questionId: 'D2', value: 'unclear', note: '' }, ctx('ann'));
  room = run(room, { type: 'setOutcome', outcome: 'ready_with_actions', justification: 'D2 is being clarified.' }, ctx('ann'));
  room = run(
    room,
    { type: 'setOpenActions', openActions: [{ action: 'Confirm owner of dependency', owner: 'ann', due: '2026-10-20', impact: 'blocks_dev' }] },
    ctx('ann'),
  );
  room = run(room, { type: 'finishConsolidation' }, ctx('ann'));
  room = run(room, { type: 'setIssueLabel', label: 'PROJ-123' }, ctx('ann'));
  room = run(room, { type: 'startEstimation' }, ctx('ann'));
  room = run(room, { type: 'setFinalEstimate', value: '5' }, ctx('ann'));
  return room;
}

function input() {
  const room = consolidatedRoom();
  return { issue: currentIssue(room)!, checklist: room.checklist, participants: room.participants };
}

describe('buildModel', () => {
  it('renders every row in checklist order with labels from the checklist', () => {
    const m = buildModel(input());
    expect(m.rows.map((r) => r.id)).toEqual(['G1', 'G2', 'B1', 'B2', 'B3', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'D1', 'D2', 'Q1', 'Q2', 'Q3']);
    expect(m.rows.find((r) => r.id === 'G1')?.answer).toBe('Yes');
    expect(m.rows.find((r) => r.id === 'B3')?.answer).toBe('N/A');
    expect(m.rows.find((r) => r.id === 'T4')?.note).toBe('Accepted <break>\nConcern (bob): breaks | v1');
    expect(m.rows.find((r) => r.id === 'D2')?.note).toContain('note missing');
    expect(m.title).toBe('Refinement Checklist — PROJ-123');
    expect(m.outcome).toBe('Ready to estimate with open actions');
    expect(m.estimate).toBe('5');
  });
});

describe('renderers', () => {
  it('html escapes and uses real tables', () => {
    const html = renderHtml(input());
    expect(html).toContain('<table>');
    expect(html).toContain('Accepted &lt;break&gt;<br>Concern (bob): breaks | v1');
    expect(html).toMatchSnapshot();
  });

  it('markdown escapes pipes', () => {
    const md = renderMarkdown(input());
    expect(md).toContain('breaks \\| v1');
    expect(md).toMatchSnapshot();
  });

  it('plain text is readable', () => {
    const txt = renderText(input());
    expect(txt).toContain('T4  No  Are the API changes backward compatible?');
    expect(txt).toMatchSnapshot();
  });
});
