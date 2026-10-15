import type { Checklist } from '../types.js';

/**
 * A generic refinement checklist bundled as the default. Teams load their own
 * checklist from a JSON file (see `CHECKLIST_FILE` in the server config); this one
 * documents the shape and makes a fresh install usable.
 */
export const DEFAULT_CHECKLIST: Checklist = {
  id: 'default',
  version: 1,
  title: 'Refinement Checklist',
  labels: {
    answers: { yes: 'Yes', no: 'No', unclear: 'Unclear', na: 'N/A' },
    outcomes: {
      ready: 'Ready to estimate',
      ready_with_actions: 'Ready to estimate with open actions',
      not_ready: 'Not ready to estimate',
    },
    impacts: {
      blocks_estimate: 'Blocks estimate',
      blocks_dev: 'Blocks development',
      none: 'Does not block',
    },
    columns: { number: '#', question: 'Question', answer: 'Answer', note: 'Note' },
    openActions: {
      title: 'Open actions',
      action: 'Action or decision',
      owner: 'Owner',
      due: 'Due',
      impact: 'Impact',
    },
    outcomeTitle: 'Refinement outcome',
    justificationTitle: 'Justification',
    estimateTitle: 'Estimate',
    concernPrefix: 'Concern',
    needsNote: 'note missing',
    noAnswer: '—',
  },
  sections: [
    {
      id: 'goal',
      title: '1. Goal and scope',
      questions: [
        { id: 'G1', text: 'Is the expected benefit or outcome for the user, stakeholder or system clear?' },
        { id: 'G2', text: 'Is it clear what the ticket includes and what is out of scope?' },
      ],
    },
    {
      id: 'behaviour',
      title: '2. Expected behaviour',
      questions: [
        {
          id: 'B1',
          text: 'Is the required behaviour described concretely and verifiably?',
          hint: 'E.g. acceptance criteria, concrete examples, or a technical verification plan.',
        },
        {
          id: 'B2',
          text: 'Is it clear how the system should behave in relevant edge cases?',
          hint: 'E.g. boundary, error, empty and recovery states.',
        },
        {
          id: 'B3',
          text: 'For UI changes, is a sufficiently concrete UI/UX design available?',
          hint: 'E.g. content, interactions, states and responsive variants. Use N/A for changes without UI.',
        },
      ],
    },
    {
      id: 'technical',
      title: '3. Technical confidence',
      questions: [
        { id: 'T1', text: 'Are the affected systems and components known well enough to estimate?' },
        {
          id: 'T2',
          text: 'Is the likely approach known well enough to estimate?',
          hint: 'A detailed implementation design is not required.',
        },
        {
          id: 'T3',
          text: 'Are the required API and integration changes clear enough to estimate?',
          hint: 'E.g. contracts, third parties, error responses and API documentation.',
        },
        { id: 'T4', text: 'Are the API changes backward compatible?' },
        {
          id: 'T5',
          text: 'Is the impact on data and the database clear enough to estimate?',
          hint: 'E.g. schema, existing data, migrations and validation. Consider rolling deployment and rollback.',
        },
        {
          id: 'T6',
          text: 'Is it clear how the change and its failure will be observable in production?',
          hint: 'E.g. logs, metrics, tracing and alerts according to risk.',
        },
      ],
    },
    {
      id: 'dependencies',
      title: '4. Dependencies',
      questions: [
        {
          id: 'D1',
          text: 'Are all external dependencies and required inputs identified?',
          hint: 'E.g. other teams, tickets, third parties, decisions, approvals, test environments.',
        },
        { id: 'D2', text: 'Does every unresolved dependency have a known status, owner and deadline?' },
      ],
    },
    {
      id: 'testability',
      title: '5. Completion and testability',
      questions: [
        {
          id: 'Q1',
          text: 'Are the relevant failure scenarios that must be verified identified?',
          hint: 'This question is about what must be tested. B2 is about how the system should behave.',
        },
        { id: 'Q2', text: 'Is the impact on existing functionality and the regression scope clear?' },
        { id: 'Q3', text: 'Is the required test data identified and available or realistically obtainable?' },
      ],
    },
  ],
};
