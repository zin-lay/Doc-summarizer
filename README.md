# Document Summarizer

A self-hosted web app that summarizes PDF, Word and PowerPoint files and exports the result back to Word or PowerPoint.

By default it runs on a **local AI model through [Ollama](https://ollama.com)**, so it needs **no API key** and your documents never leave your computer or company network. You can also switch it to the Claude API or any OpenAI-compatible model server with one setting.

<!-- Add a screenshot: save it as docs/screenshot.png and uncomment the next line -->
<!-- ![Screenshot](docs/screenshot.png) -->

## Features

- **Reads** PDF, Word (.docx), PowerPoint (.pptx, including speaker notes), .txt, .md, .csv and .html, or pasted text. Files are read in the browser.
- **Six summary types:** Overview, Key points, Executive brief, Action items (owner/deadline table), Study notes, TL;DR.
- **Options:** length (short / medium / detailed), output language (same as document, English, Japanese, Chinese, Korean), and an optional focus such as "risks for the sales team".
- **Long documents** are split into sections, condensed, then combined into one summary.
- **Ask the document:** a Q&A tab that answers only from the loaded document.
- **Export** to Word (.docx), PowerPoint (.pptx) or Markdown (.md).
- **Private by default:** listens only on your own computer, optional password, recent summaries stored only in your browser.
- **Works offline** once installed: all libraries are served locally, no CDNs.

## Quick start

You need **Node.js 20+** and **Ollama**. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for full details.

```bash
# 1. Get the code
git clone https://github.com/YOUR-USERNAME/doc-summarizer.git
cd doc-summarizer

# 2. Install
npm install

# 3. Download a local model (one time, about 4.7 GB)
ollama pull qwen2.5:7b

# 4. Check everything is ready, then start
npm run check
npm start
```

Open **http://localhost:3000** in your browser.

Step-by-step instructions for Windows, macOS, Linux and Docker are in **[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

## Choosing a model provider

Set `PROVIDER` in your `.env` file (copy `.env.example` to `.env` first).

| Provider | API key | Where documents are processed | Best for |
|---|---|---|---|
| `ollama` (default) | Not needed | Your own computer or server | Confidential documents, offline use |
| `openai` | Depends on server | Your model server (LM Studio, vLLM, LocalAI, Azure OpenAI…) | Teams with an existing internal model server |
| `anthropic` | Required | Anthropic's Claude API | Highest quality and very long documents |

All settings are explained in [.env.example](.env.example).

## Project structure

```
doc-summarizer/
├── server.js            Web server and model connector (no runtime dependencies)
├── public/
│   ├── index.html       App page
│   ├── app.js           File reading, summarizing, Q&A
│   ├── export.js        Word / PowerPoint export
│   ├── styles.css
│   └── favicon.svg
├── scripts/check.js     Setup checker (npm run check)
├── docs/
│   ├── REQUIREMENTS.md
│   └── INSTALLATION.md
├── .env.example         Configuration template
├── Dockerfile
└── docker-compose.yml
```

## Limitations

- Scanned PDFs (images only) have no text layer, so there is nothing to extract. Run OCR first.
- Text inside images and charts isn't read. Tables inside PowerPoint slides aren't read either.
- Old .doc and .ppt formats aren't supported. Save as .docx or .pptx.
- Summary quality depends on the model. Small local models are good for most business documents; for long or complex documents, use a larger model or the Claude API.

## Security notes

- The app listens on `127.0.0.1` (this computer only) by default.
- To share it on your network, set `HOST=0.0.0.0` **and** `APP_PASSWORD`. For anything beyond a trusted internal network, put it behind HTTPS (a reverse proxy such as Nginx or Caddy).
- Never commit your `.env` file. It is already in `.gitignore`.

## License

[MIT](LICENSE). Third-party libraries keep their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This project is independent and is not affiliated with or endorsed by Anthropic, Ollama, OpenAI or Microsoft.
