import { useState } from 'react';
import { useRoomConnection } from '../connection.js';
import { RoomContext } from '../room-context.js';
import { Consolidating } from './Consolidating.js';
import { Estimating } from './Estimating.js';
import { Filling } from './Filling.js';
import { Header } from './Header.js';
import { Summary } from './Summary.js';

export function Room({ slug }: { slug: string }) {
  const { conn, state } = useRoomConnection(slug);

  if (state.status === 'roomNotFound') {
    return (
      <main className="notice">
        <h1>Room not found</h1>
        <p>This room doesn't exist or has expired. Rooms are kept in memory and are dropped after a day of inactivity.</p>
        <a href="/">Create a new room</a>
      </main>
    );
  }
  if (state.status === 'nameRequired') {
    return <NamePrompt onSubmit={(name) => conn.setName(name)} />;
  }
  if (!state.view) {
    return (
      <main className="notice">
        <p>{state.status === 'restarting' ? 'Server is restarting, reconnecting…' : 'Connecting…'}</p>
      </main>
    );
  }

  const view = state.view;
  const me = view.participants.find((p) => p.id === view.me);
  if (!me) return null;

  return (
    <RoomContext.Provider value={{ view, me, isFacilitator: me.isFacilitator, send: (c) => conn.send(c) }}>
      {state.status !== 'connected' && (
        <div className="banner">
          {state.status === 'restarting' ? 'Server is restarting, reconnecting…' : 'Connection lost, reconnecting…'}
        </div>
      )}
      <Header />
      <main>{view.issue ? <Phase phase={view.issue.phase} /> : <p>No issue.</p>}</main>
    </RoomContext.Provider>
  );
}

function Phase({ phase }: { phase: string }) {
  switch (phase) {
    case 'filling':
      return <Filling />;
    case 'consolidating':
      return <Consolidating />;
    case 'consolidated':
    case 'estimated':
      return <Summary />;
    case 'estimating':
      return <Estimating />;
    default:
      return null;
  }
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <main className="notice">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <h1>Your name</h1>
        <p>Shown to the team. This browser will remember you.</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button className="primary" type="submit" disabled={!name.trim()}>
          Join
        </button>
      </form>
    </main>
  );
}
