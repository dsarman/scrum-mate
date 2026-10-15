import type { Answer, AnswerValue, Question } from '@scrum-mate/shared';
import { useState } from 'react';
import { useDebouncedText } from '../hooks.js';
import { useRoom } from '../room-context.js';
import { AnswerButtons } from './AnswerButtons.js';

export function Filling() {
  const { view, me, isFacilitator, send } = useRoom();
  const issue = view.issue!;
  const isDone = issue.done.includes(me.id);
  const counting = view.participants.filter((p) => !p.isObserver);
  const doneCount = counting.filter((p) => issue.done.includes(p.id)).length;

  return (
    <section className="filling">
      <div className="toolbar">
        <span>
          {doneCount} of {counting.length} done
        </span>
        <button
          className={isDone ? '' : 'primary'}
          onClick={() => void send({ type: 'setDone', done: !isDone })}
        >
          {isDone ? 'Not done yet' : "I'm done"}
        </button>
        {isFacilitator && (
          <>
            <button className="primary" onClick={() => void send({ type: 'reveal' })}>
              Reveal answers
            </button>
            <button onClick={() => void send({ type: 'startEstimation' })}>Skip checklist, estimate</button>
          </>
        )}
      </div>
      <p className="hint">Your answers are private until the facilitator reveals them. They save as you type.</p>
      {view.checklist.sections.map((s) => (
        <div key={s.id} className="section">
          <h2>{s.title}</h2>
          {s.questions.map((q) => (
            <QuestionRow key={q.id} question={q} answer={issue.myAnswers[q.id] ?? { value: null, note: '' }} />
          ))}
        </div>
      ))}
    </section>
  );
}

function QuestionRow({ question, answer }: { question: Question; answer: Answer }) {
  const { view, send } = useRoom();
  // The note draft lives here so a value click always sends the note as typed.
  const [note, setNote] = useState(answer.note);
  const noteField = useDebouncedText(answer.note, (v) =>
    void send({ type: 'setAnswer', questionId: question.id, value: answer.value, note: v }),
  );
  if (noteField.value !== note) setNote(noteField.value);

  const setValue = (value: AnswerValue | null) =>
    void send({ type: 'setAnswer', questionId: question.id, value, note: noteField.value });

  const noteRequired = (answer.value === 'no' || answer.value === 'unclear') && !noteField.value.trim();

  return (
    <div className="question">
      <div className="question-head">
        <span className="qid">{question.id}</span>
        <span className="qtext">{question.text}</span>
      </div>
      {question.hint && <div className="qhint">{question.hint}</div>}
      <AnswerButtons value={answer.value} labels={view.checklist.labels} onChange={setValue} allowClear />
      <textarea
        placeholder={noteRequired ? 'Note required for No / Unclear' : 'Note (optional)'}
        className={noteRequired ? 'warn' : ''}
        rows={1}
        value={noteField.value}
        onChange={(e) => noteField.onChange(e.target.value)}
        onBlur={noteField.onBlur}
        onFocus={noteField.onFocus}
      />
    </div>
  );
}
