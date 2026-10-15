import { ANSWER_VALUES, type AnswerValue, type ChecklistLabels } from '@scrum-mate/shared';

export function AnswerButtons({
  value,
  labels,
  onChange,
  disabled,
  allowClear,
}: {
  value: AnswerValue | null;
  labels: ChecklistLabels;
  onChange: (v: AnswerValue | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  return (
    <div className="answer-buttons" role="radiogroup">
      {ANSWER_VALUES.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={`answer answer-${v} ${value === v ? 'selected' : ''}`}
          disabled={disabled}
          onClick={() => onChange(allowClear && value === v ? null : v)}
        >
          {labels.answers[v]}
        </button>
      ))}
    </div>
  );
}
