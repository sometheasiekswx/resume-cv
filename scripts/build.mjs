import { mkdir, mkdtemp, readFile, writeFile, copyFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './setup.mjs';
import { run } from './tools.mjs';
import { parseDocument, expectedText } from './document.mjs';
import { renderPage } from './page.mjs';
import { renderMarkdown, presentationAssets } from './presentation.mjs';
import { publicFiles } from './publication.mjs';
import { check, digest } from './check.mjs';

export async function build({ sourcePath = join(root, 'resume/main.tex'), outDir = join(root, 'dist') } = {}) {
  // Render every format from the same immutable source snapshot.
  const source = await readFile(sourcePath, 'utf8');
  const parsed = parseDocument(source);
  const hash = digest(source);
  await mkdir(join(root, '.build'), { recursive: true });
  const temp = await mkdtemp(join(root, '.build/run-'));
  const stage = join(temp, 'site');
  try {
    await mkdir(stage);
    await writeFile(join(temp, 'resume.tex'), source);
    await writeFile(join(stage, 'resume.md'), renderMarkdown(parsed));
    await writeFile(join(stage, 'index.html'), renderPage(parsed, hash));
    await copyFile(join(root, 'site/styles.css'), join(stage, 'styles.css'));
    await writeFile(join(stage, '.nojekyll'), '');
    for (const [name, svg] of Object.entries(presentationAssets(parsed.colors))) await writeFile(join(stage, name), svg);
    run('tectonic', ['--untrusted', '--keep-logs', '--outdir', temp, join(temp, 'resume.tex')], { cwd: temp });
    const log = await readFile(join(temp, 'resume.log'), 'utf8');
    if (/Overfull \\[hv]box/.test(log)) throw new Error('LaTeX reports overflowing text. Fix the layout before publishing.');
    await copyFile(join(temp, 'resume.pdf'), join(stage, 'resume.pdf'));
    run('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1800', '-png', join(stage, 'resume.pdf'), join(stage, 'resume-preview')]);
    const files = {};
    for (const name of [...publicFiles.keys()].filter(name => name !== 'build.json')) files[name] = digest(await readFile(join(stage, name)));
    await writeFile(join(stage, 'build.json'), JSON.stringify({
      source: 'resume/main.tex', sourceSha256: hash,
      commit: process.env.GITHUB_SHA || null, files, previewOfPdfSha256: files['resume.pdf'], content: expectedText(parsed.document),
    }, null, 2) + '\n');
    // Check the stage and current source before replacing a previously good build.
    const result = await check({ directory: stage, sourcePath, parsed });
    const destination = resolve(outDir);
    if (destination !== join(root, 'dist') && !destination.startsWith(join(root, '.build') + '/')) throw new Error('Build destination must be dist/ or an isolated directory under .build/.');
    const backup = join(temp, 'previous');
    let previous = false;
    try { await rename(destination, backup); previous = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(stage, destination); }
    catch (error) {
      if (previous) await rename(backup, destination);
      throw error;
    }
    console.log('Built PDF, Markdown and website (' + result.pages + ' A4 page; source ' + hash.slice(0, 12) + ').');
    return result;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch(error => { console.error(error.message); process.exitCode = 1; });
}
