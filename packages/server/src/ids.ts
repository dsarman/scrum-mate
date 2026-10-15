import { randomBytes, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** 128 bits of randomness, URL-safe. Used for room slugs. */
export function newSlug(): string {
  return randomBytes(16).toString('base64url');
}
