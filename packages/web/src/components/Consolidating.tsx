import {
  OUTCOMES,
  needsNote,
  type AnswerValue,
  type Question,
  type TeamAnswer,
} from '@scrum-mate/shared';
import { useState } from 'react';
import { useDebouncedText } from '../hooks.js';
import { participantName, useRoom } from '../room-context.js';
import { AnswerButtons } from './AnswerButtons.js';
import { OpenActionsEditor } from './OpenActionsEditor.js';

/**
 * The facilitator's screen is shared on the call, so this view is the team's view.
 * Non-facilitators see the same thing read-only.
 */
export function Consolidating() {
  const { view, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const questions = view.checklist.sections.flatMap((s) => s.questions);
  const undecided = questions.filter((q) => !issue.teamAnswers[q.id]).length;
  const missingNotes = Object.values(issue.teamAnswers).filter(needsNote).length;

  return (
    <section className="consolidating">
      <div className="toolbar">
        <span>
          {undecided} undecided · {missingNotes} missing notes
        </span>
        {isFacilitator && (
          <>
            <button className="primary" onClick={() => void send({ type: 'finishConsolidation' })}>
              Finish consolidation
            </button>
            <button onClick={() => void send({ type: 'reopen', phase: 'filling' })}>Back to filling</button>
          </>
        )}
      </div>
      {view.checklist.sections.map((s) => (
        <div key={s.id} className="section">
          <h2>{s.title}</h2>
          {s.questions.map((q) => (
            <Row key={q.id} question={q} team={issue.teamAnswers[q.id]} />
          ))}
        </div>
      ))}
      <OutcomeEditor />
      <OpenActionsEditor />
    </section>
  );
}

function Row({ question, team }: { question: Question; team: TeamAnswer | undefined }) {
  const { view, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const L = view.checklist.labels;
  const auto = team?.source === 'auto';
  const [expanded, setExpanded] = useState(false);
  const open = !auto || expanded;

  const noteField = useDebouncedText(team?.note ?? '', (v) => {
    if (team) void send({ type: 'setTeamAnswer', questionId: question.id, value: team.value, note: v });
  });

  const setValue = (value: AnswerValue | null) =>
    void send({ type: 'setTeamAnswer', questionId: question.id, value, note: noteField.value });

  const spread = view.participants.map((p) => ({
    p,
    answer: issue.answers?.[p.id]?.[question.id] ?? null,
  }));

  return (
    <div className={`question ${auto ? 'auto' : ''} ${!team ? 'undecided' : ''}`}>
      <div className="question-head" onClick={() => auto && setExpanded(!expanded)}>
        <span className="qid">{question.id}</span>
        <span className="qtext">{question.text}</span>
        {team && (
          <span className={`answer-chip answer-${team.value}`}>
            {L.answers[team.value]}
            {auto && ' · all agree'}
          </span>
        )}
        {team && needsNote(team) && <span className="warn-tag">{L.needsNote}</span>}
        {auto && <span className="expander">{expanded ? '▾' : '▸'}</span>}
      </div>
      {open && (
        <>
          <ul className="spread">
            {spread.map(({ p, answer }) => (
              <li key={p.id} className={p.isObserver ? 'observer' : ''}>
                <span className={`answer-chip answer-${answer?.value ?? 'none'}`}>
                  {answer?.value ? L.answers[answer.value] : L.noAnswer}
                </span>
                <span className="name">{p.name}</span>
                {answer?.note && (
                  <span className="note">
                    {answer.note}
                    {isFacilitator && team && (
                      <button
                        className="link"
                        onClick={() =>
                          void send({ type: 'addConcern', questionId: question.id, participantId: p.id, text: answer.note })
                        }
                      >
                        record as concern
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="team-answer">
            <strong>Team answer</strong>
            <AnswerButtons
              value={team?.value ?? null}
              labels={L}
              onChange={setValue}
              disabled={!isFacilitator}
              allowClear
            />
            <textarea
              rows={1}
              placeholder={team && needsNote(team) ? 'Note required for No / Unclear' : 'Team note'}
              className={team && needsNote(team) ? 'warn' : ''}
              disabled={!isFacilitator || !team}
              value={noteField.value}
              onChange={(e) => noteField.onChange(e.target.value)}
              onBlur={noteField.onBlur}
              onFocus={noteField.onFocus}
            />
            {team && team.concerns.length > 0 && (
              <ul className="concerns">
                {team.concerns.map((c, i) => (
                  <li key={i}>
                    <em>{L.concernPrefix}</em> ({participantName(view, c.participantId)}): {c.text}
                    {isFacilitator && (
                      <button
                        className="link"
                        onClick={() => void send({ type: 'removeConcern', questionId: question.id, index: i })}
                      >
                        remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OutcomeEditor() {
  const { view, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const L = view.checklist.labels;
  const justification = useDebouncedText(issue.justification, (v) =>
    void send({ type: 'setOutcome', outcome: issue.outcome, justification: v }),
  );
  return (
    <div className="section outcome">
      <h2>{L.outcomeTitle}</h2>
      <div className="answer-buttons">
        {OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            className={`answer outcome-${o} ${issue.outcome === o ? 'selected' : ''}`}
            disabled={!isFacilitator}
            onClick={() => void send({ type: 'setOutcome', outcome: o, justification: justification.value })}
          >
            {L.outcomes[o]}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        placeholder={L.justificationTitle}
        disabled={!isFacilitator}
        value={justification.value}
        onChange={(e) => justification.onChange(e.target.value)}
        onBlur={justification.onBlur}
        onFocus={justification.onFocus}
      />
    </div>
  );
}
