# Third-Party Notices

This project depends on the following open-source packages. They are installed by
`npm install` and are not included in this repository. Each package's full license
text is in its folder under `node_modules/` after installation.

| Package | Version | License | Copyright / Project |
|---|---|---|---|
| pdfjs-dist (PDF.js) | 3.11.174 | Apache License 2.0 | Mozilla Foundation – https://github.com/mozilla/pdf.js |
| mammoth | 1.6.0 | BSD 2-Clause | Michael Williamson – https://github.com/mwilliamson/mammoth.js |
| jszip | 3.10.1 | MIT (dual-licensed MIT / GPL-3.0; used under MIT) | Stuart Knightley and contributors – https://github.com/Stuk/jszip |
| marked | 4.3.0 | MIT | Christopher Jeffrey and MarkedJS contributors – https://github.com/markedjs/marked |
| dompurify | 3.0.6 | Apache License 2.0 or MPL 2.0 | Cure53 and contributors – https://github.com/cure53/DOMPurify |
| docx | 8.5.0 | MIT | Dolan Miu – https://github.com/dolanmiu/docx |
| pptxgenjs | 3.12.0 | MIT | Brent Ely – https://github.com/gitbrent/PptxGenJS |

If you distribute a build that bundles these libraries (for example a Docker image),
include their license files with it. The provided Dockerfile keeps `node_modules/`,
which contains them.

Optional external software, not distributed with this project:

- **Ollama** (MIT) – https://github.com/ollama/ollama
- Models you download through Ollama have their own licenses (for example Qwen2.5 is
  Apache 2.0 for most sizes; Llama 3.1 uses the Llama 3.1 Community License). Check the
  model's license before commercial use.
