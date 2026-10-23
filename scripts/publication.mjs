// One public-file contract shared by generation, validation and local serving.
export const publicFiles = new Map([
  ['index.html', 'text/html; charset=utf-8'], ['styles.css', 'text/css'],
  ['resume.pdf', 'application/pdf'], ['resume.md', 'text/markdown; charset=utf-8'],
  ['resume-preview.png', 'image/png'], ['badge-website.svg', 'image/svg+xml'],
  ['badge-pdf.svg', 'image/svg+xml'], ['badge-source.svg', 'image/svg+xml'],
  ['workflow.svg', 'image/svg+xml'], ['build.json', 'application/json'],
  ['.nojekyll', 'text/plain'],
]);
