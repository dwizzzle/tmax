import { appendFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB — rotate when exceeded
const FLUSH_INTERVAL = 500; // ms — batch writes to reduce I/O
let logPath = '';
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let rotating = false;

export function initDiagLogger(): string {
  logPath = join(app.getPath('userData'), 'tmax-diag.log');
  diagLog('app:start', { version: app.getVersion(), time: new Date().toISOString() });
  return logPath;
}

export function getDiagLogPath(): string {
  return logPath;
}

function sanitize(s: string, maxLen = 40): string {
  return s.slice(0, maxLen).replace(/[\x00-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

async function flush(): Promise<void> {
  if (buffer.length === 0 || !logPath || rotating) return;
  const lines = buffer.join('');
  buffer = [];
  try {
    const s = await stat(logPath).catch(() => null);
    if (s && s.size > MAX_SIZE) {
      rotating = true;
      await writeFile(logPath, `--- log rotated at ${new Date().toISOString()} ---\n`);
      rotating = false;
    }
    await appendFile(logPath, lines);
  } catch { /* ignore write errors */ }
}

export function diagLog(event: string, data?: Record<string, unknown>): void {
  if (!logPath) return;
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const payload = data ? ' ' + JSON.stringify(data) : '';
  buffer.push(`${ts} ${event}${payload}\n`);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL);
  }
}

export { sanitize };
