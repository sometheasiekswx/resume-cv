import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from '../scripts/setup.mjs';
import { build } from '../scripts/build.mjs';
import { prepareVercel, verifyDeployment, vercelFiles } from '../scripts/vercel.mjs';

test('Vercel publishes only a checked build and detects stale or broken live artifacts', async () => {
  await mkdir(join(root, '.build'), { recursive: true });
  const temp = await mkdtemp(join(root, '.build/vercel-test-'));
  const directory = join(temp, 'dist');
  const sourcePath = join(temp, 'resume.tex');
  const destination = join(temp, 'deployment');
  const options = { directory, sourcePath, destination, projectId: 'prj_example', orgId: 'team_example' };
  try {
    const source = await readFile(new URL('./fixtures/resume.tex', import.meta.url), 'utf8');
    await writeFile(sourcePath, source);
    await build({ sourcePath, outDir: directory });
    await prepareVercel(options);
    const output = join(destination, '.vercel/output');
    assert.deepEqual((await readdir(join(output, 'static'))).sort(), [...vercelFiles].sort());
    assert.deepEqual(JSON.parse(await readFile(join(output, 'config.json'))), { version: 3 });
    assert.deepEqual(JSON.parse(await readFile(join(destination, '.vercel/project.json'))), {
      projectId: 'prj_example', orgId: 'team_example',
    });
    await writeFile(join(output, 'static/old-private-file.txt'), 'must never publish');
    await prepareVercel(options);
    assert(!(await readdir(join(output, 'static'))).includes('old-private-file.txt'));
    await writeFile(join(directory, 'private.txt'), 'private');
    await assert.rejects(prepareVercel(options), /allowlist/);
    await rm(join(directory, 'private.txt'));
    await writeFile(sourcePath, source + '\n% changed since build\n');
    await assert.rejects(prepareVercel(options), /stale/);
    await writeFile(sourcePath, source);
    await assert.rejects(prepareVercel({ ...options, destination: root }), /inside .build/);
    await assert.rejects(prepareVercel({ ...options, projectId: '' }), /VERCEL_PROJECT_ID/);

    const fetchImpl = async url => new Response(await readFile(join(directory, url.pathname.split('/').pop() || 'index.html')));
    const result = await verifyDeployment({ url: 'https://resume.example/', directory, fetchImpl });
    assert.equal(result.files, vercelFiles.length);
    await assert.rejects(verifyDeployment({
      url: 'https://resume.example/', directory,
      fetchImpl: async url => url.pathname.endsWith('resume.pdf') ? new Response('old PDF') : fetchImpl(url),
    }), /differs.*resume.pdf/);
    await assert.rejects(verifyDeployment({
      url: 'https://resume.example/', directory, fetchImpl: async () => new Response('login', { status: 401 }),
    }), /HTTP 401/);
    await assert.rejects(verifyDeployment({ url: 'http://resume.example/', directory, fetchImpl }), /HTTPS/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
