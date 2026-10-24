import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './setup.mjs';

export const sourceFiles = [
  '.github/workflows/pages.yml', '.gitignore', 'README.md', 'package.json',
  'resume/main.tex', 'scripts/build.mjs', 'scripts/check.mjs',
  'scripts/check-source.mjs', 'scripts/dev.mjs', 'scripts/document.mjs',
  'scripts/page.mjs', 'scripts/presentation.mjs', 'scripts/publication.mjs',
  'scripts/setup.mjs', 'scripts/tools.mjs', 'scripts/vercel.mjs', 'site/styles.css',
  'tests/fixtures/resume.tex', 'tests/pipeline.test.mjs', 'tests/publication.test.mjs', 'tests/vercel.test.mjs',
];

export function validateSourceFiles(paths) {
  const allowed = new Set(sourceFiles);
  const unexpected = paths.filter(path => !allowed.has(path));
  if (unexpected.length) throw new Error('Files outside the publication source contract: ' + unexpected.join(', '));
  const missing = sourceFiles.filter(path => !paths.includes(path));
  if (missing.length) throw new Error('Missing publication source files: ' + missing.join(', '));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    validateSourceFiles(paths);
    console.log('Publication source contract verified (' + paths.length + ' files).');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
