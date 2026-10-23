import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from '../scripts/setup.mjs';
import { parseDocument, convert } from '../scripts/document.mjs';
import { build } from '../scripts/build.mjs';
import { check, normalize, digest, pageLimitFromSource } from '../scripts/check.mjs';
import { run } from '../scripts/tools.mjs';

// Synthetic input keeps regression checks independent of the published document.
const source = await readFile(new URL('./fixtures/resume.tex', import.meta.url),'utf8');
const parsed = parseDocument(source);

test('the synthetic fixture produces readable Markdown, four roles and 14 bullets', () => {
  const markdown = convert(parsed.document,'gfm');
  assert.equal((markdown.match(/^### /gm)||[]).length,4);
  assert.equal((markdown.match(/^- /gm)||[]).length,14);
  assert.ok(markdown.includes('AWS cloud engineering'));
  assert.ok(markdown.includes('Example College'));
  assert.doesNotMatch(markdown, /<div|\\role|\\section/);
});

test('new sections and ordinary LaTeX formatting propagate without editing a data file', () => {
  const text=source.replace('\\end{document}', '\\section{Selected Projects}\n\\textbf{Cloud delivery}: Research \\& development, 20\\% improvement.\n\\end{document}');
  const markdown=convert(parseDocument(text).document,'gfm');
  assert.ok(markdown.includes('## Selected Projects'));
  assert.ok(markdown.includes('**Cloud delivery**: Research & development, 20% improvement.'));
});

test('HTML-looking source text remains inert, and unsafe links/unknown commands fail visibly', () => {
  const html=convert(parseDocument(source.replace('AWS cloud engineering','AWS <script>alert(1)</script> cloud engineering')).document,'html5');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<script>/);
  assert.throws(()=>parseDocument(source.replace('mailto:alex@example.com','javascript:alert(1)')), /link scheme/);
  assert.throws(()=>parseDocument(source.replace('tel:+10000000000','tel:no-number')), /phone link/);
  assert.throws(()=>parseDocument(source.replace('Example IT','\\unknownresumecommand{Missing words} Example IT')), /Unsupported LaTeX/);
  assert.throws(()=>parseDocument(source.replace('\\begin{document}','')), /complete document/);
});

test('one LaTeX content edit reaches the real PDF, Markdown and website; failures preserve the last good build', async () => {
  await mkdir(join(root,'.build'),{recursive:true});
  const temp=await mkdtemp(join(root,'.build/test-'));
  const tex=join(temp,'test.tex');const output=join(temp,'dist');
  try {
    await writeFile(tex,source);
    await build({sourcePath:tex,outDir:output});
    const originalPreview=await readFile(join(output,'resume-preview.png'));
    const edited=source.replace('barcode scanning','barcode scanning with verified synchronisation')
      .replace('\\item Lead the afternoon production team, coordinate priorities and communicate operational requirements and risks to management.',
        '\\item Maintain cloud tools.\n\\item Coordinate delivery.');
    await writeFile(tex,edited);
    await build({sourcePath:tex,outDir:output});
    const marker='barcode scanning with verified synchronisation';
    const pdf=run('pdftotext',[join(output,'resume.pdf'),'-']);
    assert.ok(normalize(pdf).includes(normalize(marker)));
    const markdownOutput=await readFile(join(output,'resume.md'),'utf8');
    assert.ok(markdownOutput.includes(marker));
    assert.equal((markdownOutput.match(/^- /gm)||[]).length,15);
    for (const text of [pdf,markdownOutput,await readFile(join(output,'index.html'),'utf8')]) {
      assert.ok(normalize(text).includes(normalize('Maintain cloud tools.')));
    }
    assert.ok((await readFile(join(output,'index.html'),'utf8')).includes(marker));
    assert.ok(markdownOutput.startsWith('[![First page of the latest LaTeX resume](resume-preview.png)](resume.pdf)'));
    const goodPreview=await readFile(join(output,'resume-preview.png'));
    assert.notDeepEqual(goodPreview,originalPreview,'the PDF preview must change after a visible LaTeX edit');
    assert.equal(goodPreview.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    await check({directory:output,sourcePath:tex});
    const good=await readFile(join(output,'resume.pdf'));
    await writeFile(tex,edited.replace('\\begin{document}','\\errmessage{Intentional pipeline test failure}\n\\begin{document}'));
    await assert.rejects(build({sourcePath:tex,outDir:output}), /tectonic failed/);
    assert.deepEqual(await readFile(join(output,'resume.pdf')),good);
    assert.deepEqual(await readFile(join(output,'resume-preview.png')),goodPreview);
    await assert.rejects(check({directory:output,sourcePath:tex}), /stale/);
    await writeFile(tex,edited);
    const markdown=await readFile(join(output,'resume.md'),'utf8');
    await writeFile(join(output,'resume.md'),markdown.replace(marker,'stale output'));
    await assert.rejects(check({directory:output,sourcePath:tex}), /hash mismatch/);
    await writeFile(join(output,'resume.md'),markdown);
    const manifest=JSON.parse(await readFile(join(output,'build.json'),'utf8'));
    manifest.previewOfPdfSha256='stale-pdf-hash';
    await writeFile(join(output,'build.json'),JSON.stringify(manifest));
    await assert.rejects(check({directory:output,sourcePath:tex}), /preview.*PDF hash/);
    manifest.previewOfPdfSha256=manifest.files['resume.pdf'];
    await writeFile(join(output,'build.json'),JSON.stringify(manifest));
    await writeFile(join(output,'resume-preview.png'),'invalid preview');
    await assert.rejects(check({directory:output,sourcePath:tex}), /hash mismatch/);
    await writeFile(join(output,'resume-preview.png'),goodPreview);
    const brokenMarkdown=markdown.replace('badge-pdf.svg','missing-badge.svg');
    await writeFile(join(output,'resume.md'),brokenMarkdown);
    manifest.files['resume.md']=digest(brokenMarkdown);
    await writeFile(join(output,'build.json'),JSON.stringify(manifest));
    await assert.rejects(check({directory:output,sourcePath:tex}), /publication link.*missing-badge/);
    await writeFile(join(output,'resume.md'),markdown);
    manifest.files['resume.md']=digest(markdown);
    manifest.content=[];
    await writeFile(join(output,'build.json'),JSON.stringify(manifest));
    await assert.rejects(check({directory:output,sourcePath:tex}), /authoritative LaTeX/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('unexpected header blocks fail rather than silently losing source content', () => {
  const edited=source.replace('\\section{Profile}', '\\begin{quote}Important additional header content.\\end{quote}\n\\section{Profile}');
  assert.throws(()=>parseDocument(edited), /header.*paragraph/i);
});

test('missing compiler configuration gives an actionable failure', () => {
  const previous=process.env.TECTONIC_PATH;
  process.env.TECTONIC_PATH='/nonexistent-resume-test-compiler';
  try { assert.throws(()=>run('tectonic',['--version']), /Missing tectonic.*TECTONIC_PATH/); }
  finally { if(previous===undefined)delete process.env.TECTONIC_PATH;else process.env.TECTONIC_PATH=previous; }
});

test('missing PDF preview renderer gives an actionable failure', () => {
  const previous=process.env.PDFTOPPM_PATH;
  process.env.PDFTOPPM_PATH='/nonexistent-resume-test-renderer';
  try { assert.throws(()=>run('pdftoppm',['-v']), /Missing pdftoppm.*PDFTOPPM_PATH/); }
  finally { if(previous===undefined)delete process.env.PDFTOPPM_PATH;else process.env.PDFTOPPM_PATH=previous; }
});

test('each LaTeX source controls its page limit without weakening one-page fixtures', () => {
  assert.equal(pageLimitFromSource(source, null), 1);
  assert.equal(pageLimitFromSource('% resume-page-limit: 3\n' + source, null), 3);
  assert.equal(pageLimitFromSource('% resume-page-limit: 3\n' + source, '2'), 2);
  for (const value of ['0', '-1', 'NaN', '2.5', '']) {
    assert.throws(()=>pageLimitFromSource(source, value), /positive whole number/);
    assert.throws(()=>pageLimitFromSource('% resume-page-limit: ' + value + '\n' + source, null), /positive whole number/);
  }
  assert.throws(()=>pageLimitFromSource('% resume-page-limit: 2\n% resume-page-limit: 3\n' + source, null), /only one/);
});

test('a combined location/contact print line preserves both fields in readable formats', () => {
  const line = String.raw`{\small \textbf{Example City \textbar\ Available for opportunities} \textbar\ \href{mailto:alex@example.com}{alex@example.com} \textbar\ \href{tel:+10000000000}{+1 000 000 0000}}\par`;
  const current = source.replace(/\\textbf\{Example City[\s\S]*?(?=\\section\{Profile\})/, () => line + '\n\n');
  const combined = parseDocument(current);
  const markdown = convert(combined.document,'gfm');
  assert.ok(markdown.includes('Example City'));
  assert.ok(markdown.includes('Available for opportunities'));
  assert.ok(markdown.includes('alex@example.com'));
  const html = convert(combined.document,'html5');
  assert.ok(html.includes('href="mailto:alex@example.com"'));
  assert.ok(html.includes('href="tel:+10000000000"'));
});

test('right-aligned contacts retain location and both links', () => {
  const line = String.raw`{\small \textbf{Example City} \hfill \href{mailto:alex@example.com}{alex@example.com} \textbar\ \href{tel:+10000000000}{+1 000 000 0000}}\par`;
  const text = source.replace(/\\textbf\{Example City[\s\S]*?(?=\\section\{Profile\})/, () => line + '\n\n');
  const parsed = parseDocument(text);
  const html = convert(parsed.document,'html5');
  assert.ok(html.includes('Example City'));
  assert.ok(html.includes('href="mailto:alex@example.com"'));
  assert.ok(html.includes('href="tel:+10000000000"'));
});


test('print heading space preserves all semantic job headings', () => {
  const spaced = source.replace(String.raw`\newcommand{\role}[4]{`, String.raw`\newcommand{\role}[4]{\Needspace{6\baselineskip}`);
  const markdown = convert(parseDocument(spaced).document, 'gfm');
  assert.equal(markdown, convert(parsed.document, 'gfm'));
  assert.equal((markdown.match(/^### /gm) || []).length, 4);
});
