<p align="center">
  <a href="https://resume-cv-silk.vercel.app/resume.pdf">
    <img src="https://resume-cv-silk.vercel.app/resume-preview.png" alt="Somethea Siek’s resume. Select to open the PDF." width="680">
  </a>
</p>

<h1 align="center">Somethea Siek</h1>
<p align="center">Software Engineering · Systems Analysis · Cloud Solutions</p>

<p align="center">
  <a href="https://resume-cv-silk.vercel.app/"><img src="https://resume-cv-silk.vercel.app/badge-website.svg" alt="Read online" height="36"></a>
  <a href="https://resume-cv-silk.vercel.app/resume.pdf"><img src="https://resume-cv-silk.vercel.app/badge-pdf.svg" alt="Download PDF" height="36"></a>
</p>

<p align="center">
  <a href="mailto:sometheasiekswx@gmail.com">sometheasiekswx@gmail.com</a> ·
  <a href="tel:+61426994974">+61 426 994 974</a>
</p>

---

[Read the resume](https://resume-cv-silk.vercel.app/) · [PDF](https://resume-cv-silk.vercel.app/resume.pdf) · [Markdown](https://resume-cv-silk.vercel.app/resume.md)

<details>
<summary>Technical documentation</summary>

The resume is maintained in [LaTeX](resume/main.tex). PDF, Markdown and the website are generated from the same source.

Requires Node.js 24+, Pandoc, Tectonic and Poppler. Project-local tool setup and preview:

```bash
npm run setup
npm run dev
```

Edit `resume/main.tex`, commit, and push to `main`. GitHub Actions tests and builds the PDF, Markdown, preview image and website, then publishes the checked files to [Vercel](https://resume-cv-silk.vercel.app/) and GitHub Pages. No local build or manual deployment is needed.

The [Actions run](https://github.com/sometheasiekswx/resume-cv/actions) reports build or publication errors. Unsupported content, overflowing text and invalid builds stop publication. The last successful deployment stays available. To restore an earlier resume, revert the source change and push again.

One-time Vercel setup uses the repository Actions secret `VERCEL_TOKEN`, scoped to the existing resume project or its owning team. Renew this secret before its token expires. Project identifiers are configured in the workflow; credentials and generated files are never committed. Pull requests run validation without publishing or receiving the deployment secret.

Supported content includes sections, paragraphs, lists, emphasis and links.

</details>
