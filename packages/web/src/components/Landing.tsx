import { useState } from 'react';
import { navigate } from '../App.js';

export function Landing() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { slug } = (await res.json()) as { slug: string };
      navigate(`/r/${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setBusy(false);
    }
  };

  return (
    <main className="landing">
      <h1>Scrum Mate</h1>
      <p>Refinement checklist and planning poker for one team. Create a room and share the link.</p>
      <button className="primary" onClick={create} disabled={busy}>
        {busy ? 'Creating…' : 'Create a room'}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
