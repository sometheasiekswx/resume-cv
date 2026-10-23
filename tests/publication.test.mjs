import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFiles, validateSourceFiles } from '../scripts/check-source.mjs';

test('publication source validation rejects unexpected and missing files', () => {
  assert.doesNotThrow(() => validateSourceFiles(sourceFiles));
  assert.throws(() => validateSourceFiles([...sourceFiles, 'unlisted.txt']), /outside.*unlisted/);
  assert.throws(() => validateSourceFiles(sourceFiles.filter(path => path !== 'resume/main.tex')), /Missing.*resume\/main.tex/);
});
