import { UNKNOWN_CARD } from '@scrum-mate/shared';
import { useRoom } from '../room-context.js';
import { CopyButtons, ChecklistSummary } from './Summary.js';

export function Estimating() {
  const { view, me, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const counting = view.participants.filter((p) => !p.isObserver);
  const votedCount = counting.filter((p) => issue.voted.includes(p.id)).length;

  return (
    <section className="estimating">
      <div className="toolbar">
        <span>
          {votedCount} of {counting.length} voted
        </span>
        {isFacilitator && !issue.votesRevealed && (
          <button className="primary" onClick={() => void send({ type: 'revealVotes' })}>
            Reveal votes
          </button>
        )}
        {isFacilitator && issue.votesRevealed && (
          <button onClick={() => void send({ type: 'revote' })}>Re-vote</button>
        )}
        {isFacilitator && (
          <button onClick={() => void send({ type: 'reopen', phase: issue.teamAnswers && Object.keys(issue.teamAnswers).length ? 'consolidated' : 'filling' })}>
            Back
          </button>
        )}
      </div>

      {!me.isObserver && !issue.votesRevealed && (
        <div className="cards">
          {view.scale.map((v) => (
            <button
              key={v}
              className={`card ${issue.myVote === v ? 'selected' : ''}`}
              onClick={() => void send({ type: 'vote', value: issue.myVote === v ? null : v })}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {issue.votesRevealed && (
        <div className="votes">
          {counting.map((p) => (
            <div key={p.id} className="vote">
              <span className="card small">{issue.votes?.[p.id] ?? '–'}</span>
              <span className="name">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {issue.votesRevealed && isFacilitator && (
        <div className="final">
          <strong>Final estimate</strong>
          {issue.suggestedEstimate && <span className="hint">All agree on {issue.suggestedEstimate}.</span>}
          <div className="cards">
            {view.scale
              .filter((v) => v !== UNKNOWN_CARD)
              .map((v) => (
                <button
                  key={v}
                  className={`card ${issue.suggestedEstimate === v ? 'suggested' : ''}`}
                  onClick={() => void send({ type: 'setFinalEstimate', value: v })}
                >
                  {v}
                </button>
              ))}
          </div>
        </div>
      )}

      {Object.keys(issue.teamAnswers).length > 0 && (
        <details className="section">
          <summary>Consolidated checklist</summary>
          <ChecklistSummary />
          <CopyButtons />
        </details>
      )}
    </section>
  );
}
