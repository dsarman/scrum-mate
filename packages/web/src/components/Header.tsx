import { useState } from 'react';
import { useDebouncedText } from '../hooks.js';
import { useRoom } from '../room-context.js';

const PHASE_LABEL: Record<string, string> = {
  filling: 'Filling',
  consolidating: 'Consolidating',
  consolidated: 'Consolidated',
  estimating: 'Estimating',
  estimated: 'Estimated',
};

export function Header() {
  const { view, me, isFacilitator, send } = useRoom();
  const issue = view.issue;
  const [copied, setCopied] = useState(false);

  const label = useDebouncedText(issue?.label ?? '', (v) => void send({ type: 'setIssueLabel', label: v }));

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header>
      <div className="header-row">
        <div className="issue-label">
          {isFacilitator ? (
            <input
              placeholder="Issue key, e.g. PROJ-123"
              value={label.value}
              onChange={(e) => label.onChange(e.target.value)}
              onBlur={label.onBlur}
              onFocus={label.onFocus}
            />
          ) : (
            <strong>{issue?.label || 'No issue label'}</strong>
          )}
          {issue && <span className={`phase phase-${issue.phase}`}>{PHASE_LABEL[issue.phase]}</span>}
        </div>
        <div className="header-actions">
          <button onClick={copyLink}>{copied ? 'Link copied' : 'Copy room link'}</button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={me.isObserver}
              onChange={(e) => void send({ type: 'setObserver', isObserver: e.target.checked })}
            />
            Observer
          </label>
          {!isFacilitator && view.claimAvailable && (
            <button onClick={() => void send({ type: 'claimFacilitator' })}>Claim facilitator</button>
          )}
        </div>
      </div>
      <Participants />
    </header>
  );
}

function Participants() {
  const { view, me, isFacilitator, send } = useRoom();
  const issue = view.issue;
  return (
    <ul className="participants">
      {view.participants.map((p) => {
        const done = issue?.phase === 'filling' && issue.done.includes(p.id);
        const voted = issue?.phase === 'estimating' && issue.voted.includes(p.id);
        return (
          <li key={p.id} className={[p.connected ? '' : 'offline', p.isObserver ? 'observer' : ''].join(' ')}>
            <span className="dot" />
            <span className="name">{p.name}</span>
            {p.isFacilitator && <span className="tag">facilitator</span>}
            {p.isObserver && <span className="tag">observer</span>}
            {p.id === me.id && <span className="tag me">you</span>}
            {(done || voted) && <span className="check">✓</span>}
            {isFacilitator && !p.isFacilitator && (
              <button className="link" onClick={() => void send({ type: 'grantFacilitator', participantId: p.id })}>
                make facilitator
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
