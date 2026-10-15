import { describe, expect, it } from 'vitest';
import { SYSTEM, apply, claimAvailable, currentIssue } from './reducer.js';
import { FACILITATOR_CLAIM_TIMEOUT_MS } from './types.js';
import { QUESTION_IDS, T0, answerAll, at, ctx, emptyRoom, reject, roomWith, run } from './test/fixtures.js';

describe('join and roles', () => {
  it('first joiner becomes facilitator, later joiners do not', () => {
    const room = roomWith('ann', 'bob');
    expect(room.participants['ann']?.isFacilitator).toBe(true);
    expect(room.participants['bob']?.isFacilitator).toBe(false);
  });

  it('join is system-only', () => {
    const room = roomWith('ann');
    expect(reject(room, { type: 'join', participantId: 'x', name: 'x' }, ctx('ann'))).toMatch(/system/);
  });

  it('rejoin keeps the participant and updates the name', () => {
    let room = roomWith('ann');
    room = run(room, { type: 'disconnect', participantId: 'ann' }, ctx(SYSTEM));
    expect(room.participants['ann']?.connected).toBe(false);
    room = run(room, { type: 'join', participantId: 'ann', name: 'Ann B.' }, ctx(SYSTEM));
    expect(room.participants['ann']).toMatchObject({ connected: true, name: 'Ann B.', isFacilitator: true });
  });

  it('facilitator can grant the role; others cannot', () => {
    let room = roomWith('ann', 'bob', 'cat');
    expect(reject(room, { type: 'grantFacilitator', participantId: 'cat' }, ctx('bob'))).toMatch(/facilitator/);
    room = run(room, { type: 'grantFacilitator', participantId: 'cat' }, ctx('ann'));
    expect(room.participants['cat']?.isFacilitator).toBe(true);
  });

  it('claim is only available after the facilitator has been absent for the timeout', () => {
    let room = roomWith('ann', 'bob');
    expect(claimAvailable(room, T0)).toBe(false);
    expect(reject(room, { type: 'claimFacilitator' }, ctx('bob'))).toMatch(/present/);

    room = run(room, { type: 'disconnect', participantId: 'ann' }, ctx(SYSTEM, at(1)));
    expect(room.facilitatorAbsentSince).toBe(at(1));
    expect(claimAvailable(room, at(2))).toBe(false);

    const later = new Date(Date.parse(at(1)) + FACILITATOR_CLAIM_TIMEOUT_MS).toISOString();
    expect(claimAvailable(room, later)).toBe(true);
    room = run(room, { type: 'claimFacilitator' }, ctx('bob', later));
    expect(room.participants['bob']?.isFacilitator).toBe(true);
    expect(room.facilitatorAbsentSince).toBeNull();
  });

  it('facilitator reconnecting clears the absence marker', () => {
    let room = roomWith('ann');
    room = run(room, { type: 'disconnect', participantId: 'ann' }, ctx(SYSTEM, at(1)));
    room = run(room, { type: 'join', participantId: 'ann', name: 'ann' }, ctx(SYSTEM, at(2)));
    expect(room.facilitatorAbsentSince).toBeNull();
  });

  it('observer toggle is self-set', () => {
    const room = run(roomWith('ann', 'bob'), { type: 'setObserver', isObserver: true }, ctx('bob'));
    expect(room.participants['bob']?.isObserver).toBe(true);
  });

  it('every successful command bumps lastActivityAt', () => {
    const room = run(roomWith('ann'), { type: 'setName', name: 'Ann' }, ctx('ann', at(5)));
    expect(room.lastActivityAt).toBe(at(5));
  });
});

describe('filling', () => {
  it('participants can answer and mark done while filling', () => {
    let room = roomWith('ann', 'bob');
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('bob'));
    room = run(room, { type: 'setAnswer', questionId: 'G2', value: null, note: 'early note' }, ctx('bob'));
    room = run(room, { type: 'setDone', done: true }, ctx('bob'));
    const issue = currentIssue(room)!;
    expect(issue.answers['bob']).toEqual({ G1: { value: 'yes', note: '' }, G2: { value: null, note: 'early note' } });
    expect(issue.done).toEqual(['bob']);
  });

  it('rejects unknown questions', () => {
    expect(reject(roomWith('ann'), { type: 'setAnswer', questionId: 'X9', value: 'yes', note: '' }, ctx('ann'))).toMatch(/unknown question/);
  });

  it('setDone is idempotent', () => {
    let room = roomWith('ann');
    room = run(room, { type: 'setDone', done: true }, ctx('ann'));
    room = run(room, { type: 'setDone', done: true }, ctx('ann'));
    expect(currentIssue(room)!.done).toEqual(['ann']);
    room = run(room, { type: 'setDone', done: false }, ctx('ann'));
    expect(currentIssue(room)!.done).toEqual([]);
  });

  it('only the facilitator can reveal', () => {
    expect(reject(roomWith('ann', 'bob'), { type: 'reveal' }, ctx('bob'))).toMatch(/facilitator/);
  });
});

describe('reveal and consolidation', () => {
  function revealedRoom() {
    let room = roomWith('ann', 'bob', 'cat');
    room = answerAll(room, 'ann', 'yes');
    room = answerAll(room, 'bob', 'yes');
    room = answerAll(room, 'cat', 'yes');
    room = run(room, { type: 'setAnswer', questionId: 'T4', value: 'no', note: 'breaks v1' }, ctx('cat'));
    room = run(room, { type: 'setAnswer', questionId: 'T6', value: null, note: '' }, ctx('cat'));
    return run(room, { type: 'reveal' }, ctx('ann'));
  }

  it('reveal freezes individual answers and auto-fills agreed rows', () => {
    const room = revealedRoom();
    const issue = currentIssue(room)!;
    expect(issue.phase).toBe('consolidating');
    expect(issue.teamAnswers['G1']).toEqual({ value: 'yes', note: '', source: 'auto', concerns: [] });
    expect(issue.teamAnswers['T4']).toBeUndefined(); // disagreement
    expect(issue.teamAnswers['T6']).toMatchObject({ value: 'yes', source: 'auto' }); // 2 of 3 answered, agree
    expect(reject(room, { type: 'setAnswer', questionId: 'G1', value: 'no', note: '' }, ctx('bob'))).toMatch(/frozen/);
    expect(reject(room, { type: 'setDone', done: true }, ctx('bob'))).toMatch(/frozen/);
  });

  it('facilitator sets disagreement rows and can attach concerns', () => {
    let room = revealedRoom();
    room = run(room, { type: 'setTeamAnswer', questionId: 'T4', value: 'no', note: 'accepted break' }, ctx('ann'));
    room = run(room, { type: 'addConcern', questionId: 'T4', participantId: 'cat', text: 'breaks v1' }, ctx('ann'));
    let ta = currentIssue(room)!.teamAnswers['T4']!;
    expect(ta).toEqual({ value: 'no', note: 'accepted break', source: 'facilitator', concerns: [{ participantId: 'cat', text: 'breaks v1' }] });

    // overriding an auto row flips the source and keeps concerns
    room = run(room, { type: 'setTeamAnswer', questionId: 'T4', value: 'unclear', note: 'tbd' }, ctx('ann'));
    ta = currentIssue(room)!.teamAnswers['T4']!;
    expect(ta.source).toBe('facilitator');
    expect(ta.concerns).toHaveLength(1);

    room = run(room, { type: 'removeConcern', questionId: 'T4', index: 0 }, ctx('ann'));
    expect(currentIssue(room)!.teamAnswers['T4']!.concerns).toEqual([]);
  });

  it('non-facilitators cannot consolidate', () => {
    const room = revealedRoom();
    expect(reject(room, { type: 'setTeamAnswer', questionId: 'T4', value: 'no', note: '' }, ctx('bob'))).toMatch(/facilitator/);
    expect(reject(room, { type: 'finishConsolidation' }, ctx('bob'))).toMatch(/facilitator/);
  });

  it('outcome and open actions can be set while consolidating or consolidated', () => {
    let room = revealedRoom();
    room = run(room, { type: 'setOutcome', outcome: 'ready_with_actions', justification: 'one dep open' }, ctx('ann'));
    room = run(room, { type: 'finishConsolidation' }, ctx('ann'));
    room = run(
      room,
      { type: 'setOpenActions', openActions: [{ action: 'ask infra', owner: 'ann', due: 'Fri', impact: 'blocks_dev' }] },
      ctx('ann'),
    );
    const issue = currentIssue(room)!;
    expect(issue.phase).toBe('consolidated');
    expect(issue.outcome).toBe('ready_with_actions');
    expect(issue.openActions).toHaveLength(1);
  });

  it('reopen to filling keeps answers, and a second reveal keeps facilitator rows', () => {
    let room = revealedRoom();
    room = run(room, { type: 'setTeamAnswer', questionId: 'T4', value: 'no', note: 'decided' }, ctx('ann'));
    room = run(room, { type: 'reopen', phase: 'filling' }, ctx('ann'));
    expect(currentIssue(room)!.answers['cat']?.['T4']?.value).toBe('no');

    // late joiner answers, reveal again
    room = run(room, { type: 'join', participantId: 'dan', name: 'dan' }, ctx(SYSTEM));
    room = answerAll(room, 'dan', 'yes');
    room = run(room, { type: 'reveal' }, ctx('ann'));
    const ta = currentIssue(room)!.teamAnswers;
    expect(ta['T4']).toMatchObject({ value: 'no', note: 'decided', source: 'facilitator' });
    expect(ta['G1']).toMatchObject({ source: 'auto' });
  });

  it('reopen must go backwards', () => {
    const room = revealedRoom();
    expect(reject(room, { type: 'reopen', phase: 'consolidating' }, ctx('ann'))).toMatch(/earlier/);
    expect(reject(room, { type: 'reopen', phase: 'estimating' }, ctx('ann'))).toMatch(/earlier/);
  });
});

describe('estimation', () => {
  function estimatingRoom() {
    let room = roomWith('ann', 'bob', 'cat');
    room = run(room, { type: 'reveal' }, ctx('ann'));
    room = run(room, { type: 'finishConsolidation' }, ctx('ann'));
    return run(room, { type: 'startEstimation' }, ctx('ann'));
  }

  it('can skip the checklist by starting estimation from filling', () => {
    const room = run(roomWith('ann'), { type: 'startEstimation' }, ctx('ann'));
    expect(currentIssue(room)!.phase).toBe('estimating');
  });

  it('cannot start estimation mid-consolidation', () => {
    const room = run(roomWith('ann'), { type: 'reveal' }, ctx('ann'));
    expect(reject(room, { type: 'startEstimation' }, ctx('ann'))).toMatch(/filling or consolidated/);
  });

  it('votes must be on the scale, observers cannot vote, and votes freeze on reveal', () => {
    let room = estimatingRoom();
    expect(reject(room, { type: 'vote', value: '4' }, ctx('bob'))).toMatch(/scale/);
    room = run(room, { type: 'setObserver', isObserver: true }, ctx('cat'));
    expect(reject(room, { type: 'vote', value: '5' }, ctx('cat'))).toMatch(/observers/);
    room = run(room, { type: 'vote', value: '5' }, ctx('bob'));
    room = run(room, { type: 'vote', value: '?' }, ctx('ann'));
    room = run(room, { type: 'revealVotes' }, ctx('ann'));
    expect(reject(room, { type: 'vote', value: '8' }, ctx('bob'))).toMatch(/revealed/);
  });

  it('revote clears votes and hides them again', () => {
    let room = estimatingRoom();
    room = run(room, { type: 'vote', value: '5' }, ctx('bob'));
    room = run(room, { type: 'revealVotes' }, ctx('ann'));
    room = run(room, { type: 'revote' }, ctx('ann'));
    expect(currentIssue(room)!).toMatchObject({ votes: {}, votesRevealed: false });
  });

  it('final estimate must be a number from the scale and moves to estimated', () => {
    let room = estimatingRoom();
    expect(reject(room, { type: 'setFinalEstimate', value: '?' }, ctx('ann'))).toMatch(/number/);
    expect(reject(room, { type: 'setFinalEstimate', value: '21' }, ctx('ann'))).toMatch(/number/);
    room = run(room, { type: 'setFinalEstimate', value: '8' }, ctx('ann'));
    expect(currentIssue(room)!).toMatchObject({ phase: 'estimated', finalEstimate: '8' });
  });

  it('reopening an estimated issue clears the final estimate but keeps votes', () => {
    let room = estimatingRoom();
    room = run(room, { type: 'vote', value: '5' }, ctx('bob'));
    room = run(room, { type: 'setFinalEstimate', value: '5' }, ctx('ann'));
    room = run(room, { type: 'reopen', phase: 'estimating' }, ctx('ann'));
    expect(currentIssue(room)!).toMatchObject({ phase: 'estimating', finalEstimate: null, votes: { bob: '5' } });
  });
});

describe('issues', () => {
  it('nextIssue keeps the previous issue as a record', () => {
    let room = roomWith('ann');
    room = run(room, { type: 'setIssueLabel', label: 'PROJ-1' }, ctx('ann'));
    room = run(room, { type: 'nextIssue', issueId: 'issue-2', label: 'PROJ-2' }, ctx('ann'));
    expect(room.currentIssueId).toBe('issue-2');
    expect(Object.keys(room.issues)).toEqual(['issue-1', 'issue-2']);
    expect(room.issues['issue-1']?.label).toBe('PROJ-1');
    expect(currentIssue(room)!).toMatchObject({ label: 'PROJ-2', phase: 'filling' });
  });

  it('nextIssue rejects duplicate ids', () => {
    expect(reject(roomWith('ann'), { type: 'nextIssue', issueId: 'issue-1' }, ctx('ann'))).toMatch(/exists/);
  });

  it('a fresh room has an empty filling issue', () => {
    const issue = currentIssue(emptyRoom())!;
    expect(issue.phase).toBe('filling');
    expect(QUESTION_IDS).toHaveLength(16);
  });

  it('apply never mutates its input', () => {
    const before = roomWith('ann');
    const frozen = JSON.stringify(before);
    apply(before, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: '' }, ctx('ann'));
    apply(before, { type: 'reveal' }, ctx('ann'));
    expect(JSON.stringify(before)).toBe(frozen);
  });
});
