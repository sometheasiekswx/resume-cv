import { run } from './tools.mjs';

const str = text => ({ t: 'Str', c: text });
const space = () => ({ t: 'Space' });
const header = (level, id, inlines) => ({ t: 'Header', c: [level, [id, [], []], inlines] });
const paragraph = inlines => ({ t: 'Para', c: inlines });
const isNeedspace = raw => /^\\Needspace\{[1-9]\d*\\baselineskip\}\s*$/.test(raw);
const div = (classes, blocks) => ({ t: 'Div', c: [['', classes, []], blocks] });
export function textOf(value) {
  if (Array.isArray(value)) return value.map(textOf).join('');
  if (!value || typeof value !== 'object') return '';
  if (value.t === 'Str') return value.c;
  if (['Space', 'SoftBreak', 'LineBreak'].includes(value.t)) return ' ';
  if (value.t === 'Code' || value.t === 'CodeBlock') return value.c[1];
  if (value.t === 'Link' || value.t === 'Image') return textOf(value.c[1]);
  if (value.t === 'Span') return textOf(value.c[1]);
  if (value.t === 'Header') return textOf(value.c[2]);
  return textOf(value.c);
}

// Pandoc expands the source's own macros. Keep semantic content, intentionally
// translate PDF layout instructions, and reject unknown/raw commands.
export function clean(value) {
  if (Array.isArray(value)) return value.flatMap(item => {
    const result = clean(item);
    return result === null ? [] : [result];
  });
  if (!value || typeof value !== 'object') return value;
  if (value.t === 'RawInline' || value.t === 'RawBlock') {
    const [format, raw] = value.c;
    if (format !== 'latex') throw new Error('Unsupported raw content: ' + format);
    if (isNeedspace(raw)) return null;
    if (/^\\textbar\s*$/.test(raw)) return str('|');
    if (/^\\hfill\s*$/.test(raw)) return { t: 'LineBreak' };
    if (/^\\(?:vspace|hspace)\*?\{[^{}]*\}\s*$/.test(raw)) return null;
    if (/^\\fontsize\{[\d.]+\}\{[\d.]+\}\s*$/.test(raw)) return null;
    if (/^\\(?:color\{[a-zA-Z]+\}|selectfont|small|large|Large|LARGE|huge|Huge|normalsize)\s*$/.test(raw)) return null;
    throw new Error('Unsupported LaTeX in readable content: ' + raw + '. Use ordinary text, sections, lists, emphasis and links, or extend the converter explicitly.');
  }
  if (['Image', 'Math', 'Table', 'Figure', 'Note', 'Cite'].includes(value.t)) {
    throw new Error('Unsupported resume element: ' + value.t + '. It must be supported in PDF, Markdown and HTML before publishing.');
  }
  if (value.t === 'Link' && !/^(https?:|mailto:|tel:|#)/i.test(value.c[2][0])) {
    throw new Error('Unsupported link scheme: ' + value.c[2][0]);
  }
  if (value.t === 'Link') {
    const url = value.c[2][0];
    if (url.startsWith('mailto:') && !/^mailto:[^\s?@]+@[^\s?@]+\.[^\s?@]+$/.test(url)) throw new Error('Invalid email link: ' + url);
    if (url.startsWith('tel:') && !/^tel:\+?\d{7,15}$/.test(url)) throw new Error('Use an international phone link, for example tel:+61426994974.');
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
}

function flattenSpans(nodes) {
  return nodes.flatMap(node => node.t === 'Span' ? flattenSpans(node.c[1]) : [node]);
}

// The existing \role macro is retained in the editable PDF. Its expanded
// paragraph can become an accessible job heading without a second data file.
function roleFrom(block, next, index) {
  if (block.t !== 'Para' || next?.t !== 'BulletList') return null;
  const nodes = flattenSpans(block.c).filter(node => !(node.t === 'RawInline' && node.c[0] === 'latex' && isNeedspace(node.c[1])));
  const fills = nodes.flatMap((n, i) => n.t === 'RawInline' && /^\\hfill\s*$/.test(n.c[1]) ? [i] : []);
  const line = nodes.findIndex(n => n.t === 'LineBreak');
  if (fills.length !== 2 || line < fills[0] || line > fills[1] || nodes[0]?.t !== 'Strong') return null;
  const title = clean(nodes.slice(0, fills[0]));
  const dates = clean(nodes.slice(fills[0] + 1, line));
  const company = clean(nodes.slice(line + 1, fills[1]));
  const location = clean(nodes.slice(fills[1] + 1));
  return div(['role-heading'], [
    div(['role-title-row'], [header(3, 'role-' + index, title), paragraph(dates)]),
    paragraph([{ t: 'Strong', c: company }, space(), str('·'), space(), ...location]),
  ]);
}

export function parseDocument(source) {
  if (!source.includes('\\begin{document}') || !source.includes('\\end{document}')) {
    throw new Error('The LaTeX source must contain a complete document environment.');
  }
  const parsed = JSON.parse(run('pandoc', ['--sandbox', '--from=latex+raw_tex', '--to=json'], { input: source }));
  const firstSection = parsed.blocks.findIndex(b => b.t === 'Header');
  if (firstSection < 0) throw new Error('Add at least one LaTeX section.');
  const intro = clean(parsed.blocks.slice(0, firstSection));
  // The print header may combine location and contacts on one line. Keep the
  // existing semantic fields so responsive HTML and Markdown still work.
  if (intro.length === 3 && intro.every(block => block.t === 'Para')) {
    const nodes = flattenSpans(intro[2].c);
    const firstLink = nodes.findIndex(node => node.t === 'Link');
    const locationNodes = nodes.slice(0, firstLink);
    while (locationNodes.at(-1)?.t === 'Space' || (locationNodes.at(-1)?.t === 'Str' && !locationNodes.at(-1).c.trim())) locationNodes.pop();
    if (firstLink < 1 || !(locationNodes.at(-1)?.t === 'LineBreak' || (locationNodes.at(-1)?.t === 'Str' && locationNodes.at(-1).c === '|'))) throw new Error('Separate the location and contact links with a textbar or hfill in the combined header paragraph.');
    locationNodes.pop();
    while (locationNodes.at(-1)?.t === 'Space' || (locationNodes.at(-1)?.t === 'Str' && !locationNodes.at(-1).c.trim())) locationNodes.pop();
    intro.splice(2, 1, paragraph(locationNodes), paragraph(nodes.slice(firstLink)));
  }
  if (intro.length !== 4 || intro.some(block => block.t !== 'Para')) throw new Error('Keep header paragraphs for name and headline, then location and contact links in separate paragraphs or one combined paragraph.');
  const [name, headline, location, contact] = intro;
  if (intro.some(p => !textOf(p).trim())) throw new Error('Resume header fields cannot be empty.');
  const contactJSON = JSON.stringify(contact);
  if (!contactJSON.includes('mailto:') || !contactJSON.includes('tel:')) throw new Error('The contact paragraph must include email and phone links.');
  const body = [];
  let roles = 0;
  for (let i = firstSection; i < parsed.blocks.length; i++) {
    const block = parsed.blocks[i];
    const role = roleFrom(block, parsed.blocks[i + 1], roles + 1);
    if (role) { roles++; body.push(role); }
    else {
      const normalized = clean(block);
      if (normalized) {
        if (normalized.t === 'Header') normalized.c[0] += 1;
        body.push(normalized);
      }
    }
  }
  if (!body.some(block => block.t === 'BulletList')) throw new Error('Resume experience must include a bullet list.');
  const colors = {};
  for (const key of ['navy', 'muted']) {
    const match = source.match(new RegExp('\\\\definecolor\\{' + key + '\\}\\{HTML\\}\\{([a-fA-F0-9]{6})\\}'));
    if (!match) throw new Error('Keep an HTML hex definition for the ' + key + ' colour.');
    colors[key] = '#' + match[1];
  }
  const nameText = textOf(name).trim();
  const document = {
    ...parsed, meta: {},
    blocks: [header(1, 'resume', name.c), headline, location, contact, ...body],
  };
  return { document, intro, body, name: nameText, colors };
}

export function convert(document, format) {
  const output = structuredClone(document);
  // Markdown is clean Markdown, not a web layout made of HTML div tags.
  if (format === 'gfm') {
    function unwrap(blocks) {
      return blocks.flatMap(block => block.t === 'Div' ? unwrap(block.c[1]) : [block]);
    }
    output.blocks = unwrap(output.blocks);
  }
  return run('pandoc', ['--sandbox', '--from=json', '--to=' + format, '--wrap=none'], { input: JSON.stringify(output) });
}

export function expectedText(document) {
  // Compare paragraph/list text rather than formatting or visual positions.
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (['Para', 'Plain', 'Header'].includes(node.t)) {
      // PDF extractors can place a right-aligned date after the next line.
      // Verify each layout-separated field independently, never drop its text.
      const nodes = flattenSpans(node.t === 'Header' ? node.c[2] : node.c);
      let field = [];
      function flush() {
        const text = textOf(field).trim();
        if (text) result.push(text);
        field = [];
      }
      for (const inline of nodes) {
        if (inline.t === 'LineBreak' || (inline.t === 'Str' && inline.c === '·')) flush();
        else field.push(inline);
      }
      flush();
      return;
    }
    visit(node.c);
  }
  visit(document.blocks);
  return result;
}
