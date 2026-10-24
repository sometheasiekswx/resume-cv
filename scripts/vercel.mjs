import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './setup.mjs';
import { check, digest } from './check.mjs';
import { publicFiles } from './publication.mjs';

// GitHub Pages alone needs its hidden Jekyll marker.
export const vercelFiles = [...publicFiles.keys()].filter(name => name !== '.nojekyll');

export async function prepareVercel({
  directory = join(root, 'dist'), sourcePath = join(root, 'resume/main.tex'),
  destination = join(root, '.build/vercel'),
  projectId = process.env.VERCEL_PROJECT_ID, orgId = process.env.VERCEL_ORG_ID,
} = {}) {
  if (!/^prj_[\w]+$/.test(projectId || '') || !/^team_[\w]+$/.test(orgId || '')) {
    throw new Error('Set VERCEL_PROJECT_ID and VERCEL_ORG_ID for the existing Vercel project.');
  }
  if (!resolve(destination).startsWith(join(root, '.build') + '/')) {
    throw new Error('Vercel staging must stay inside .build/.');
  }
  await check({ directory, sourcePath });
  // Recreate staging so files from an older deployment cannot leak into it.
  await rm(destination, { recursive: true, force: true });
  const output = join(destination, '.vercel/output');
  await mkdir(join(output, 'static'), { recursive: true });
  for (const name of vercelFiles) await copyFile(join(directory, name), join(output, 'static', name));
  await writeFile(join(output, 'config.json'), JSON.stringify({ version: 3 }) + '\n');
  await writeFile(join(destination, '.vercel/project.json'), JSON.stringify({ projectId, orgId }) + '\n');
  return { destination, files: vercelFiles };
}

export async function verifyDeployment({ url, directory = join(root, 'dist'), fetchImpl = fetch } = {}) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('Use the public HTTPS deployment URL without credentials, query or fragment.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  for (const name of vercelFiles) {
    const response = await fetchImpl(new URL(name === 'index.html' ? '' : name, base), { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) throw new Error('Live publication unavailable: ' + name + ' (HTTP ' + response.status + ').');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== digest(await readFile(join(directory, name)))) {
      throw new Error('Live publication differs from the checked build: ' + name);
    }
  }
  return { url: base.href, files: vercelFiles.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const execute = async () => {
    if (process.argv[2] === 'prepare') {
      console.log('Prepared checked static Vercel output:', await prepareVercel());
    } else if (process.argv[2] === 'verify') {
      await check();
      // Allow the production alias a short time to propagate after deployment.
      for (let attempt = 0; ; attempt++) {
        try { console.log('Verified live deployment:', await verifyDeployment({ url: process.argv[3] })); break; }
        catch (error) {
          if (attempt === 5) throw error;
          await new Promise(done => setTimeout(done, 5000));
        }
      }
    } else throw new Error('Usage: node scripts/vercel.mjs prepare | verify <public-https-url>');
  };
  execute().catch(error => { console.error(error.message); process.exitCode = 1; });
}
