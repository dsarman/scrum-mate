import { describe, expect, it } from 'vitest';
import { agreedValue, countingParticipants, needsNote, suggestedEstimate } from './autofill.js';
import { currentIssue } from './reducer.js';
import { ctx, roomWith, run } from './test/fixtures.js';

describe('agreedValue', () => {
  it('requires at least two values', () => {
    let room = roomWith('ann', 'bob');
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('ann'));
    expect(agreedValue(currentIssue(room)!, 'G1', countingParticipants(room.participants))).toBeNull();
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('bob'));
    expect(agreedValue(currentIssue(room)!, 'G1', countingParticipants(room.participants))).toBe('yes');
  });

  it('ignores missing values but not N/A', () => {
    let room = roomWith('ann', 'bob', 'cat');
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'na', note: '' }, ctx('ann'));
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'na', note: '' }, ctx('bob'));
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: null, note: 'later' }, ctx('cat'));
    expect(agreedValue(currentIssue(room)!, 'G1', countingParticipants(room.participants))).toBe('na');
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('cat'));
    expect(agreedValue(currentIssue(room)!, 'G1', countingParticipants(room.participants))).toBeNull();
  });

  it('ignores observers', () => {
    let room = roomWith('ann', 'bob', 'obs');
    room = run(room, { type: 'setObserver', isObserver: true }, ctx('obs'));
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('ann'));
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('bob'));
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'no', note: '' }, ctx('obs'));
    expect(agreedValue(currentIssue(room)!, 'G1', countingParticipants(room.participants))).toBe('yes');
  });
});

describe('suggestedEstimate', () => {
  function withVotes(votes: Record<string, string>, observers: string[] = []) {
    let room = roomWith('ann', 'bob', 'cat');
    for (const o of observers) room = run(room, { type: 'setObserver', isObserver: true }, ctx(o));
    room = run(room, { type: 'startEstimation' }, ctx('ann'));
    for (const [pid, v] of Object.entries(votes)) room = run(room, { type: 'vote', value: v }, ctx(pid));
    return room;
  }

  it('suggests when all counting votes agree', () => {
    const room = withVotes({ ann: '5', bob: '5', cat: '5' });
    expect(suggestedEstimate(currentIssue(room)!, room.participants)).toBe('5');
  });

  it('does not suggest on disagreement, a single vote, or the unknown card', () => {
    expect(suggestedEstimate(currentIssue(withVotes({ ann: '5', bob: '8' }))!, withVotes({}).participants)).toBeNull();
    expect(suggestedEstimate(currentIssue(withVotes({ ann: '5' }))!, withVotes({}).participants)).toBeNull();
    expect(suggestedEstimate(currentIssue(withVotes({ ann: '?', bob: '?' }))!, withVotes({}).participants)).toBeNull();
  });

  it('ignores observers who have not voted', () => {
    const room = withVotes({ ann: '3', bob: '3' }, ['cat']);
    expect(suggestedEstimate(currentIssue(room)!, room.participants)).toBe('3');
  });
});

describe('needsNote', () => {
  it('flags No and Unclear without a note', () => {
    expect(needsNote({ value: 'no', note: '', source: 'auto', concerns: [] })).toBe(true);
    expect(needsNote({ value: 'unclear', note: '  ', source: 'auto', concerns: [] })).toBe(true);
    expect(needsNote({ value: 'no', note: 'because', source: 'facilitator', concerns: [] })).toBe(false);
    expect(needsNote({ value: 'yes', note: '', source: 'auto', concerns: [] })).toBe(false);
    expect(needsNote({ value: 'na', note: '', source: 'auto', concerns: [] })).toBe(false);
  });
});
