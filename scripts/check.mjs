import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './tools.mjs';
import { root } from './setup.mjs';
import { expectedText, parseDocument } from './document.mjs';
import { publicFiles } from './publication.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// Read the document page budget, with an optional environment override.
export function pageLimitFromSource(source, override = process.env.MAX_PDF_PAGES) {
  const declarations = [...source.matchAll(/^%\s*resume-page-limit:\s*(.*?)\s*$/gm)];
  if (declarations.length > 1) throw new Error('Use only one resume-page-limit directive in the LaTeX source.');
  const value = String(override ?? declarations[0]?.[1] ?? '1');
  const limit = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(limit)) throw new Error('The resume page limit must be a positive whole number (resume-page-limit or MAX_PDF_PAGES).');
  return limit;
}
export async function check({ directory = join(root, 'dist'), sourcePath = join(root, 'resume/main.tex'), parsed } = {}) {
  const metadata = JSON.parse(await readFile(join(directory, 'build.json'), 'utf8'));
  const source = await readFile(sourcePath);
  if (metadata.sourceSha256 !== digest(source)) throw new Error('Generated outputs are stale: the LaTeX has changed. Rebuild before publishing.');
  const allowed = [...publicFiles.keys()].sort();
  const files = (await readdir(directory)).sort();
  if (JSON.stringify(files) !== JSON.stringify(allowed)) throw new Error('Publication directory does not match the public-file allowlist.');
  const hashedFiles = allowed.filter(name => name !== 'build.json');
  if (JSON.stringify(Object.keys(metadata.files).sort()) !== JSON.stringify(hashedFiles)) throw new Error('The build manifest has an incomplete file list.');
  for (const [name, checksum] of Object.entries(metadata.files)) {
    if (!allowed.includes(name) || digest(await readFile(join(directory, name))) !== checksum) throw new Error('Generated file hash mismatch: ' + name);
  }
  const pdf = await readFile(join(directory, 'resume.pdf'));
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The PDF is missing or invalid.');
  if (metadata.previewOfPdfSha256 !== digest(pdf)) throw new Error('The preview does not match the published PDF hash.');
  const preview = await readFile(join(directory, 'resume-preview.png'));
  if (preview.length < 24 || preview.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || preview.toString('ascii',12,16) !== 'IHDR') throw new Error('The resume preview is not a PNG image.');
  const width = preview.readUInt32BE(16), height = preview.readUInt32BE(20);
  if (width < 800 || height !== 1800 || Math.abs(width / height - 1 / Math.sqrt(2)) > .005) throw new Error('The resume preview must be a readable portrait A4 image.');
  const info = run('pdfinfo', [join(directory, 'resume.pdf')]);
  const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  const pageLimit = pageLimitFromSource(source.toString());
  if (!pageCount || pageCount > pageLimit) throw new Error('Resume PDF has ' + pageCount + ' pages. Keep it readable within ' + pageLimit + ' page(s), or intentionally update the source page limit.');
  if (!/Page size:\s+595[\d.]* x 841[\d.]* pts \(A4\)/.test(info)) throw new Error('Use A4 paper for the resume PDF.');
  const pdfText = run('pdftotext', [join(directory, 'resume.pdf'), '-']);
  const markdown = await readFile(join(directory, 'resume.md'), 'utf8');
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  if (!markdown.startsWith('[![First page of the latest LaTeX resume](resume-preview.png)](resume.pdf)')) throw new Error('Markdown must start with the clickable PDF preview.');
  function checkTarget(target) {
    if (/^(#|data:|https?:|mailto:|tel:)/.test(target)) return;
    if (!allowed.includes(target)) throw new Error('Broken or nonrelative publication link: ' + target);
  }
  const markdownAST = JSON.parse(run('pandoc', ['--sandbox', '--from=gfm', '--to=json'], {input:markdown}));
  function visitLinks(node) {
    if (Array.isArray(node)) { node.forEach(visitLinks); return; }
    if (!node || typeof node !== 'object') return;
    if (node.t === 'Link' || node.t === 'Image') checkTarget(node.c[2][0]);
    Object.values(node).forEach(visitLinks);
  }
  visitLinks(markdownAST);
  const markdownText = run('pandoc', ['--sandbox', '--from=gfm', '--to=plain'], { input: markdown });
  const htmlText = run('pandoc', ['--sandbox', '--from=html', '--to=plain'], { input: html });
  const chunks = expectedText((parsed || parseDocument(source.toString())).document);
  if (JSON.stringify(metadata.content) !== JSON.stringify(chunks)) throw new Error('The build manifest does not match the authoritative LaTeX content.');
  for (const [format, text] of [['PDF', pdfText], ['Markdown', markdownText], ['Website', htmlText]]) {
    const normalized = normalize(text);
    for (const chunk of chunks) {
      if (!normalized.includes(normalize(chunk))) throw new Error(format + ' is missing source content: ' + chunk.slice(0, 130));
    }
  }
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    checkTarget(target);
  }
  return { sourceSha256: metadata.sourceSha256, pages: pageCount, contentChunks: chunks.length, files };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check().then(result => console.log('Verified PDF, Markdown and website:', result))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
