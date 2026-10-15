import { useEffect, useState } from 'react';
import { Landing } from './components/Landing.js';
import { Room } from './components/Room.js';

/** Two routes: `/` creates rooms, `/r/:slug` is a room. No router library needed. */
export function App() {
  const path = usePath();
  const match = /^\/r\/([A-Za-z0-9_-]+)$/.exec(path);
  if (match) return <Room slug={match[1]!} />;
  return <Landing />;
}

function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
