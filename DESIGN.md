# Scrum Mate — Design

Status: agreed design for the MVP, 2026-10-15. All three packages are implemented.
`shared` and `server` have automated tests; `web` was verified by driving two
participants through the full flow in a real browser.

## 1. Problem

The team refines issues with a checklist of around twenty yes/no/unclear questions
grouped into sections (goal, behaviour, technical confidence, dependencies, testability).
Today each member pastes a filled copy of the table into a Jira comment, and the
facilitator merges five to eight tables by hand into one consolidated checklist. Then the team
estimates in Thunderdome and the facilitator types the estimate into Jira.

The manual merge is the pain. The tool exists to replace it.

## 2. Goals and non-goals

Priorities, in order:

1. **Consolidation.** Everyone fills the checklist blind, answers are revealed together,
   the facilitator walks the rows, agreed rows are pre-filled, disagreements are decided
   by the facilitator, dissent can be recorded. The result is copied into Jira.
2. **Continuity.** Not in the MVP, but the data model must not block it: history of
   issues per room, same person recognised across sessions.
3. **Estimation.** Planning poker, same reveal mechanics, replaces Thunderdome.

Explicitly out of scope for the MVP, with the door kept open:

- Any persistence beyond process memory.
- Jira integration (intake or write-back). Output is copied to the clipboard.
- Login, SSO, user accounts.
- Checklist editing UI. The checklist is data: a generic default is bundled, and a
  team's own checklist is a JSON file loaded at server start (`CHECKLIST_FILE`).
  Team checklists are not part of the repository.
- Issue history view, multiple issues per room.
- AI features (pre-analysis, AI-generated checklists).
- CI, container registry, deployment manifests.
- Internationalisation. UI is English; checklist content is whatever the seed says.

## 3. Decisions and rationale

| # | Decision | Why |
| --- | --- | --- |
| D1 | Build a tool rather than a template | Blind fill plus automatic merge is not achievable with a Jira or Confluence template. |
| D2 | Facilitator has final authority per row; dissent recorded optionally | Matches how the meeting runs. Re-vote mechanics would double the interaction model for no gain. |
| D3 | Checklist is versioned data, not code, and team checklists live outside the repo | A second team is realistic, and a team's checklist is internal material. The repo ships a generic default and a Zod schema; the real one is a local JSON file. |
| D4 | Login-less; room slug is the only access control | Low-sensitivity internal tool. Thunderdome guest-mode ergonomics. |
| D5 | Room is a persistent-shaped entity holding one current issue | Keeps the team's "one thing at a time" habit while leaving issue history as a later list view, not a remodel. |
| D6 | In-memory store behind a `RoomStore` interface | Kubernetes deployment where PVCs are awkward. SQLite dropped as a target; Postgres is the eventual store. |
| D7 | Pod restart loses live rooms | Accepted. Deploy outside meeting hours. Client-side rehydration is a known later option. |
| D8 | Server-authoritative commands, full per-viewer snapshot on every change | Simplest consistent model, trivial reconnect, hidden answers never leave the server. |
| D9 | TypeScript monorepo, shared types and reducer | Client and server must agree on state shape and protocol; sharing the code is the cheapest guarantee. |
| D10 | Facilitator's screen is the shared display | Meetings run over video call with screen share. Consolidation view must be legible at call resolution. |

## 4. Domain model

Names here are the ubiquitous language of the codebase.

```ts
type AnswerValue = 'yes' | 'no' | 'unclear' | 'na';

interface Checklist {
  id: string;
  version: number;
  title: string;
  sections: { id: string; title: string; questions: Question[] }[];
}

interface Question { id: string; text: string; hint?: string }

interface Room {
  id: string;             // internal, stable
  slug: string;           // unguessable, the URL, the only access control
  checklist: Checklist;   // embedded, so the room carries the exact version it was created with
  scale: string[];        // default ['1','3','5','8','13','?']
  createdAt: string;
  lastActivityAt: string; // drives expiry
  participants: Record<ParticipantId, Participant>;
  secrets: Record<string, ParticipantId>; // secret -> id; stripped by the projection
  facilitatorAbsentSince: string | null;  // set when the last connected facilitator leaves
  currentIssueId: IssueId | null;
  issues: Record<IssueId, Issue>;   // MVP UI shows only currentIssueId
}

interface Participant {
  id: ParticipantId;      // public, appears in snapshots and exports
  name: string;
  isFacilitator: boolean;
  isObserver: boolean;    // self-set; excluded from done-counts, auto-fill, votes
  connected: boolean;
}
// Each participant's secret lives in `Room.secrets` and in the owner's
// localStorage. It is never included in any projection.

type Phase = 'filling' | 'consolidating' | 'consolidated' | 'estimating' | 'estimated';

interface Issue {
  id: IssueId;
  label?: string;         // Jira key or free text
  phase: Phase;

  // individual answers, hidden until reveal, frozen after.
  // value null = "no value yet" (distinct from 'na'); a note may exist without a value
  answers: Record<ParticipantId, Record<QuestionId, { value: AnswerValue | null; note: string }>>;
  done: ParticipantId[];

  // consolidation, written at reveal and by the facilitator
  teamAnswers: Record<QuestionId, TeamAnswer>;
  outcome?: 'ready' | 'ready_with_actions' | 'not_ready';
  justification?: string;
  openActions: { action: string; owner: string; due: string; impact: 'blocks_estimate' | 'blocks_dev' | 'none' }[];

  // estimation
  votes: Record<ParticipantId, string>;
  votesRevealed: boolean;
  finalEstimate?: string; // must be a value from room.scale
}

interface TeamAnswer {
  value: AnswerValue;
  note: string;
  source: 'auto' | 'facilitator';
  concerns: { participantId: ParticipantId; text: string }[];
}
```

Invariants enforced by the reducer:

- Every entity has a UUID assigned at creation. Nothing is keyed by name or index.
- A room is never deleted because its last socket closed. Expiry is by `lastActivityAt`.
- `finalEstimate` is a member of `room.scale`.
- A `TeamAnswer` with value `no` or `unclear` and an empty note is legal in state but
  flagged "needs note" in the UI and the export.

## 5. Issue lifecycle

```
filling ──reveal──▶ consolidating ──finish──▶ consolidated ──startEstimation──▶ estimating ──setFinal──▶ estimated
   ▲                     │                        │                                 │
   └──────reopen─────────┴────────────────────────┴─────────────────────────────────┘
```

- **filling.** Open from the moment the issue is created so people can answer during
  the analyst's presentation. Answers save live on every change and are visible only
  to their author. Each participant can toggle Done; the Done list (names only) is
  visible to everyone.
- **reveal.** Facilitator action, allowed at any time. Individual answers freeze.
  The server computes auto-fill (section 6) and writes `teamAnswers`.
- **consolidating.** Facilitator walks the rows. Rows with `source: 'auto'` are collapsed.
  For the rest the facilitator sets value and note, optionally attaching concerns taken
  from submitted notes. Facilitator fills outcome, justification, open actions.
- **consolidated.** Export is available. Estimation can start regardless of outcome;
  the outcome is shown next to the estimate. Estimation can also start directly from
  `filling`, which skips the checklist for an issue that doesn't need it.
- **estimating.** Votes save hidden. Facilitator reveals. "Re-vote" clears votes and
  hides again (overwrite, no round history). Facilitator sets `finalEstimate`,
  pre-filled when all non-observer votes agree.
- **estimated.** Export includes the estimate. "Next issue" creates a fresh issue and
  makes it current; the previous one stays in `issues`.
- **reopen.** Any phase can be moved backwards by the facilitator. No data is deleted;
  returning to `filling` unfreezes individual answers so a late joiner can be added.

All transitions are explicit facilitator commands. The only automatic write is the
auto-fill at reveal.

## 6. Auto-fill rule

At reveal, for each question: take the values of non-observer participants who have a
value for that question (missing is not a value and is distinct from `na`). If there are
at least two and they are all equal, write `{ value, note: '', source: 'auto', concerns: [] }`.
Otherwise leave the row for the facilitator. Notes are never merged automatically.

## 7. Roles and identity

- **Participant identity.** On first visit the browser generates a random 128-bit
  secret and stores it in localStorage with the chosen display name. The secret is
  sent once on connect and resolves to a participant. A new browser or cleared storage
  means a new participant with the same name; the facilitator ignores or removes the
  ghost. Users never see or type the secret.
- **Facilitator.** Flag on a participant. The room creator gets it. Any facilitator can
  grant it. If no facilitator has been connected for a timeout (minutes), any
  participant can claim it. No separate facilitator link.
- **Observer.** Self-set toggle, visible to all. Excluded from done-counts, auto-fill,
  and vote agreement. Independent of facilitator.
- **Room access.** Anyone with the slug can join. That is the whole access model.

## 8. Export

One "Copy for Jira" action writes two clipboard flavours:

- `text/html`: a real table, which Jira Cloud's editor pastes as a table.
- `text/plain`: a readable fallback.

A separate "Copy as Markdown" action exists for Confluence or chat.

Content, in order: issue label; the full checklist table (all rows, including N/A) with
question, team value, team note; concerns rendered inside the note as
`Concern (Name): …`; outcome; justification; open actions table; final estimate if set.
Rows needing a note are rendered with a visible marker.

## 9. Architecture

### Repository

```
packages/shared   domain types, Zod schemas (state, commands, messages, checklist),
                  pure reducer, projection, auto-fill, export rendering, default checklist
packages/server   Node, Hono or Fastify, `ws`; RoomStore interface + in-memory impl;
                  serves built web assets; /healthz; SIGTERM handling
packages/web      React + Vite; one store mirroring the latest snapshot;
                  one view per phase; clipboard export
```

pnpm workspaces, Vitest everywhere, one Dockerfile that builds all three and ships the
server with the web assets. Single process, single container.

### State synchronisation

- Clients send **commands** (`setAnswer`, `setDone`, `reveal`, `setTeamAnswer`,
  `addConcern`, `setOutcome`, `setOpenActions`, `startEstimation`, `vote`,
  `revealVotes`, `revote`, `setFinalEstimate`, `nextIssue`, `reopen`,
  `grantFacilitator`, `claimFacilitator`, `setObserver`, `setName`).
- Each command carries a client-generated `commandId`. The server replies with
  `{ ok: true }` or `{ ok: false, commandId, error }` so the client can surface a
  rejection without an RPC layer.
- The server applies `apply(state, command, actorId) -> state | error`, a pure function
  in `shared`. Role and phase checks live there.
- After every successful apply, the server sends each connected client
  `project(state, viewerId)`. The projection is the security boundary: before reveal it
  contains the viewer's own answers and everyone's Done flags, never other answers;
  before vote reveal, only the viewer's own vote. Secrets are never projected.
- Reconnect: client sends its secret, receives the current projection. No replay.
- Snapshots are small (20 rows times a handful of people); no delta optimisation
  until measured.
- Participant inputs (notes, answers) are locally controlled with a short debounce
  before the command is sent, so typing never waits on the server. Everything else
  renders from the snapshot.

### Store

```ts
interface RoomStore {
  get(roomId): Promise<Room | undefined>;
  getBySlug(slug): Promise<Room | undefined>;
  save(room): Promise<void>;
  expireIdle(olderThan: Date): Promise<void>;
}
```

In-memory `Map` for the MVP. Saving after every apply is already the write pattern a
database implementation needs. Postgres is the intended next implementation; SQLite is
possible but a poor fit for the Kubernetes target.

### Operations

- Kubernetes, `replicas: 1`, no HPA, memory limit set.
- `/healthz` for probes.
- On SIGTERM the server sends `serverRestarting` to all clients, then closes. Clients
  reconnect with backoff; if the room is unknown they show "room lost" and a link to
  create a new one.
- Rooms expire after 24 hours idle.
- Restart during a meeting loses the meeting. Accepted (D7).

## 10. Testing

| Layer | Approach |
| --- | --- |
| Reducer, projection, auto-fill | Heavy, table-driven unit tests: every transition, every role check, hidden-data leakage. |
| Export | Snapshot tests of HTML, plain text, Markdown for a fixed consolidated issue. |
| Server | One integration test with two real WebSocket clients: join, answer, reveal, assert projections. |
| Browser | None in the MVP. Add Playwright when a UI regression costs a meeting. |

## 11. Doors kept open

| Future | What the MVP does to keep it possible |
| --- | --- |
| Persistence (Postgres) | `RoomStore` interface, save-after-apply, UUIDs everywhere, time-based expiry. |
| Issue history / continuity | Issues are records in the room; a history view is a list over existing data. Participant IDs are stable per browser. |
| Second team | Checklist is data with an ID and version, validated by a schema and loaded from a file; each room embeds the checklist it was created with. |
| Jira intake | `Issue.label` holds the key; a description field can be added to `Issue` without remodel. |
| AI participant | Pipeline is participant-agnostic; a synthetic participant would flow through answers, reveal, auto-fill and export unchanged. |
| Pod-restart resilience | Clients already hold their own answers locally; rehydration from clients is possible on top of stable IDs. |
| Real auth | Replace how the participant secret is issued; nothing else changes. |
