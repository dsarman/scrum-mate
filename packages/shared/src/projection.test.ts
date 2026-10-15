import { describe, expect, it } from 'vitest';
import { project } from './projection.js';
import { registerSecret } from './reducer.js';
import { T0, ctx, roomWith, run } from './test/fixtures.js';

describe('project', () => {
  it('never includes secrets', () => {
    const room = registerSecret(roomWith('ann', 'bob'), 'super-secret-value', 'ann');
    const view = project(room, 'bob', T0);
    expect(JSON.stringify(view)).not.toContain('super-secret-value');
    expect(view).not.toHaveProperty('secrets');
  });

  it('hides other answers while filling, shows own answers and done flags', () => {
    let room = roomWith('ann', 'bob');
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'no', note: 'ann private' }, ctx('ann'));
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: 'bob private' }, ctx('bob'));
    room = run(room, { type: 'setDone', done: true }, ctx('ann'));

    const bobView = project(room, 'bob', T0);
    expect(bobView.issue?.answers).toBeNull();
    expect(bobView.issue?.myAnswers).toEqual({ G1: { value: 'yes', note: 'bob private' } });
    expect(bobView.issue?.done).toEqual(['ann']);
    expect(JSON.stringify(bobView)).not.toContain('ann private');

    // the facilitator is not privileged before reveal either
    const annView = project(room, 'ann', T0);
    expect(annView.issue?.answers).toBeNull();
    expect(JSON.stringify(annView)).not.toContain('bob private');
  });

  it('shows all answers after reveal', () => {
    let room = roomWith('ann', 'bob');
    room = run(room, { type: 'setAnswer', questionId: 'G1', value: 'yes', note: 'bob note' }, ctx('bob'));
    room = run(room, { type: 'reveal' }, ctx('ann'));
    const view = project(room, 'ann', T0);
    expect(view.issue?.answers?.['bob']?.['G1']).toEqual({ value: 'yes', note: 'bob note' });
  });

  it('hides votes until revealed but shows who voted', () => {
    let room = roomWith('ann', 'bob');
    room = run(room, { type: 'startEstimation' }, ctx('ann'));
    room = run(room, { type: 'vote', value: '8' }, ctx('bob'));

    let view = project(room, 'ann', T0);
    expect(view.issue?.votes).toBeNull();
    expect(view.issue?.voted).toEqual(['bob']);
    expect(view.issue?.myVote).toBeNull();
    expect(JSON.stringify(view.issue)).not.toContain('"8"');
    expect(view.issue?.suggestedEstimate).toBeNull();

    expect(project(room, 'bob', T0).issue?.myVote).toBe('8');

    room = run(room, { type: 'vote', value: '8' }, ctx('ann'));
    room = run(room, { type: 'revealVotes' }, ctx('ann'));
    view = project(room, 'bob', T0);
    expect(view.issue?.votes).toEqual({ bob: '8', ann: '8' });
    expect(view.issue?.suggestedEstimate).toBe('8');
  });

  it('reports claim availability for the viewer', () => {
    const room = roomWith('ann', 'bob');
    expect(project(room, 'bob', T0).claimAvailable).toBe(false);
  });
});
