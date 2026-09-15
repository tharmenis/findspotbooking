// Minimal structured logger. Swap for pino/winston if observability needs
// grow (06-express-app-structure.md leaves this to implementer's judgment).
const LEVELS = ['debug', 'info', 'warn', 'error'];

function levelIndex(level) {
  return Math.max(0, LEVELS.indexOf(level));
}

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

function log(level, message, extra) {
  if (levelIndex(level) < levelIndex(configuredLevel)) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
  };
  if (extra !== undefined) {
    if (extra instanceof Error) {
      entry.error = { message: extra.message, stack: extra.stack };
    } else {
      entry.extra = extra;
    }
  }
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg, extra) => log('debug', msg, extra),
  info: (msg, extra) => log('info', msg, extra),
  warn: (msg, extra) => log('warn', msg, extra),
  error: (msg, extra) => log('error', msg, extra),
};
