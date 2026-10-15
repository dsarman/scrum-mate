export interface Config {
  port: number;
  /** Rooms with no activity for this long are dropped. */
  roomTtlMs: number;
  /** How often the expiry sweep runs. */
  sweepIntervalMs: number;
  /** Directory with the built web app, or null to serve no static files. */
  webDist: string | null;
  /** JSON file with the team's checklist, or null for the bundled default. */
  checklistFile: string | null;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: intFrom(env['PORT'], 3000),
    roomTtlMs: intFrom(env['ROOM_TTL_HOURS'], 24) * 60 * 60 * 1000,
    sweepIntervalMs: intFrom(env['SWEEP_INTERVAL_MINUTES'], 10) * 60 * 1000,
    webDist: env['WEB_DIST'] ?? null,
    checklistFile: env['CHECKLIST_FILE'] ?? null,
  };
}

function intFrom(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
