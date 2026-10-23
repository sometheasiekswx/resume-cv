import { convert } from './document.mjs';

export function renderMarkdown(parsed) {
  return [
    '[![First page of the latest LaTeX resume](resume-preview.png)](resume.pdf)',
    '*A preview of the first page. Select the image to open the complete PDF.*',
    '[![Read online](badge-website.svg)](index.html) [![Download PDF](badge-pdf.svg)](resume.pdf) [![LaTeX source](badge-source.svg)](https://github.com/sometheasiekswx/resume-cv/blob/main/resume/main.tex)',
    '---',
    convert(parsed.document, 'gfm').trim(),
    '---',
    '[Read online](index.html) · [Download PDF](resume.pdf) · [Edit LaTeX](https://github.com/sometheasiekswx/resume-cv/edit/main/resume/main.tex)',
    '',
  ].join('\n\n');
}

export function presentationAssets(colors) {
  // Static labels, controlled hex colours; no remote badge service or fonts.
  const badge = (label, width, primary = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="36" viewBox="0 0 ${width} 36" role="img" aria-label="${label}"><rect x=".5" y=".5" width="${width - 1}" height="35" rx="7" fill="${primary ? colors.navy : '#f8fafb'}" stroke="${primary ? colors.navy : '#d8dee2'}"/><text x="${width / 2}" y="22" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="12" font-weight="600" fill="${primary ? '#fff' : '#17384d'}">${label}</text></svg>\n`;
  return {
    'badge-website.svg': badge('Read online ↗', 126, true),
    'badge-pdf.svg': badge('Download PDF ↓', 142),
    'badge-source.svg': badge('LaTeX source', 120),
    'workflow.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" viewBox="0 0 800 220" role="img" aria-labelledby="title desc">
<title id="title">Edit once. Publish everywhere.</title><desc id="desc">Edit resume/main.tex. GitHub Actions builds and checks the PDF, preview image, Markdown and website, then publishes them together.</desc>
<rect width="800" height="220" rx="12" fill="#f8fafb"/>
<g font-family="system-ui,-apple-system,Segoe UI,sans-serif">
<text x="32" y="36" fill="${colors.muted}" font-size="10" font-weight="600" letter-spacing="2">ONE SOURCE · EVERY FORMAT</text>
<path d="M240 116H288M496 116H544" fill="none" stroke="#a7b4bc"/>
<path d="m282 112 6 4-6 4m256-8 6 4-6 4" fill="none" stroke="#a7b4bc"/>
<rect x="32" y="68" width="208" height="96" rx="8" fill="${colors.navy}"/>
<text x="48" y="96" fill="#cbd7df" font-size="10" letter-spacing="1">01 / EDIT</text>
<text x="48" y="128" fill="white" font-size="19" font-family="ui-monospace,monospace">resume/main.tex</text>
<rect x="288" y="68" width="208" height="96" rx="8" fill="white" stroke="#d8dee2"/>
<text x="304" y="96" fill="${colors.muted}" font-size="10" letter-spacing="1">02 / VERIFY</text>
<text x="304" y="128" fill="#20252a" font-size="17">Build · test · check</text>
<rect x="544" y="68" width="224" height="96" rx="8" fill="white" stroke="#d8dee2"/>
<text x="560" y="96" fill="${colors.muted}" font-size="10" letter-spacing="1">03 / PUBLISH</text>
<text x="560" y="122" fill="#20252a" font-size="17">PDF · Markdown · Web</text>
<text x="560" y="144" fill="${colors.muted}" font-size="11">With a fresh PDF preview</text>
<text x="32" y="196" fill="${colors.muted}" font-size="11">Commit on GitHub to publish. Save locally to preview.</text>
</g></svg>\n`,
  };
}
