/**
 * The browser is the identity. A random secret is generated once and kept in
 * localStorage together with the display name. Users never see the secret.
 */

export interface Identity {
  secret: string;
  name: string | null;
}

const KEY = 'scrum-mate:identity';

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (typeof parsed.secret === 'string' && parsed.secret.length >= 16) {
        return { secret: parsed.secret, name: typeof parsed.name === 'string' ? parsed.name : null };
      }
    }
  } catch {
    /* fall through */
  }
  const fresh: Identity = { secret: randomSecret(), name: null };
  saveIdentity(fresh);
  return fresh;
}

export function saveIdentity(identity: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    /* private mode: identity lives for this page load only */
  }
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
