import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { root } from './setup.mjs';

export function executable(name) {
  const variable = name.toUpperCase() + '_PATH';
  const candidates = process.env[variable] ? [process.env[variable]] : [
    join(root, '.tools/bin', name),
    ...(process.env.PATH || '').split(delimiter).map(dir => join(dir, name)),
    // Optional discovery of the desktop app's bundled Poppler, not a requirement.
    ...(['pdftotext', 'pdfinfo', 'pdftoppm'].includes(name) ? [
      join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin', name),
    ] : []),
  ];
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Try next. */ }
  }
  throw new Error('Missing ' + name + '. Run npm run setup; install Poppler for PDF checks, or set ' + variable + '.');
}

export function run(name, args, options = {}) {
  const result = spawnSync(executable(name), args, {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(name + ' failed: ' + (result.error?.message || result.stderr || result.stdout).slice(-7000));
  }
  return result.stdout;
}
