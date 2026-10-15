import { parseChecklist, type Checklist } from '@scrum-mate/shared';
import { readFileSync } from 'node:fs';
import { configFromEnv } from './config.js';
import { startServer } from './server.js';

const log = (msg: string, data: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...data }));
};

const config = configFromEnv();

let checklist: Checklist | undefined;
if (config.checklistFile) {
  checklist = parseChecklist(JSON.parse(readFileSync(config.checklistFile, 'utf8')));
  log('checklist loaded', { file: config.checklistFile, id: checklist.id, version: checklist.version });
} else {
  log('using bundled default checklist');
}

const running = await startServer(config, { log, ...(checklist ? { checklist } : {}) });

const stop = async (signal: string) => {
  log('shutting down', { signal });
  await running.close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
