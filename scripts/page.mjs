import { convert, textOf } from './document.mjs';
export const escapeHTML = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function renderPage(parsed, revision) {
  const document = blocks => ({ ...parsed.document, blocks });
  const fragment = blocks => convert(document(blocks), 'html5');
  const [name, headline, location, contact] = parsed.intro;
  const nameText = escapeHTML(parsed.name);
  const description = escapeHTML(textOf(parsed.body.find(block => block.t === 'Para') || headline).trim());
  const headerText = block => fragment([block]);
  const body = fragment(parsed.body);
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="description" content="' + description + '">',
    '<meta name="resume-source-sha256" content="' + revision + '">',
    '<meta property="og:title" content="' + nameText + ' — Resume">',
    '<meta property="og:description" content="' + description + '">',
    '<meta property="og:type" content="profile">',
    '<title>' + nameText + ' — Resume</title>',
    '<link rel="icon" href="data:,"><link rel="stylesheet" href="styles.css">',
    '<style>:root{--navy:' + parsed.colors.navy + ';--muted:' + parsed.colors.muted + '}</style>',
    '</head><body><a class="skip-link" href="#content">Skip to resume</a>',
    '<nav class="toolbar" aria-label="Resume actions"><div class="toolbar-inner">',
    '<a class="identity" href="#top">' + nameText + '</a>',
    '<a href="resume.md" download="somethea-siek-resume.md">Markdown</a>',
    '<a class="button button-small" href="resume.pdf" download="somethea-siek-resume.pdf">Download PDF <span aria-hidden="true">↓</span></a>',
    '</div></nav><main id="top"><header class="hero">',
    '<p class="eyebrow">RESUME</p><h1>' + nameText + '</h1>',
    '<div class="headline">' + headerText(headline) + '</div>',
    '<div class="hero-details"><div class="location">' + headerText(location) + '</div>',
    '<div class="contact">' + headerText(contact) + '</div></div>',
    '</header><article class="resume-body" id="content" aria-label="Resume">',
    body, '</article></main>',
    '</body></html>',
  ].join('\n');
}
