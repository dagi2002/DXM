/**
 * Structured JSON logger — zero dependencies.
 * Outputs one JSON line per log entry to stdout/stderr.
 */

type Meta = Record<string, unknown>;

function write(level: string, msg: string, meta?: Meta): void {
  const entry = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta });
  if (level === 'error') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export const logger = {
  info:  (msg: string, meta?: Meta) => write('info', msg, meta),
  warn:  (msg: string, meta?: Meta) => write('warn', msg, meta),
  error: (msg: string, meta?: Meta) => write('error', msg, meta),
};
