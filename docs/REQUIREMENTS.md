# Requirements

## Software

| Software | Version | Needed for | Download |
|---|---|---|---|
| Node.js | 20 LTS or newer (18.17 minimum) | Running the app | https://nodejs.org |
| npm | Comes with Node.js | Installing the app | – |
| Ollama | Latest | Local AI model (default setup) | https://ollama.com/download |
| Git | Any recent version | Downloading the code (optional, you can download a ZIP instead) | https://git-scm.com |
| A modern browser | Chrome, Edge, Firefox or Safari (last 2 versions) | Using the app | – |

**Docker alternative:** instead of Node.js and Ollama you can use Docker Desktop (Windows/macOS) or Docker Engine with Docker Compose **v2.24 or newer** (Linux).

You don't need Ollama if you use `PROVIDER=openai` with an existing model server, or `PROVIDER=anthropic` with a Claude API key.

## Supported operating systems

- Windows 10 / 11 (64-bit)
- macOS 12 Monterey or newer (Apple Silicon recommended)
- Linux: Ubuntu 20.04+, Debian 11+, RHEL/Rocky 8+, or any distribution that runs Node.js 20 and Ollama

## Hardware

The app itself is very light. The **AI model** is what needs memory. These figures are for Ollama:

| Model (`OLLAMA_MODEL`) | Download size | Minimum RAM | Recommended | Notes |
|---|---|---|---|---|
| `qwen2.5:3b` | ~2 GB | 8 GB | 8 GB | Fastest, lower quality. For older laptops. |
| `qwen2.5:7b` (default) | ~4.7 GB | 8 GB | 16 GB | Good balance. Strong English and Japanese. |
| `llama3.1:8b` | ~4.9 GB | 8 GB | 16 GB | Good for English documents. |
| `qwen2.5:14b` | ~9 GB | 16 GB | 32 GB, or a GPU with 12 GB+ | Noticeably better summaries. |

- **Disk space:** about 300 MB for the app plus the model size above.
- **GPU (optional):** an NVIDIA GPU (6 GB+ VRAM) or Apple Silicon Mac makes summaries several times faster. Without a GPU, a 7B model takes roughly 30 seconds to a few minutes per summary depending on the CPU and document length.
- **Context window:** `OLLAMA_NUM_CTX=16384` (default) uses about 1–2 GB of extra memory. If you run out of memory, lower it to `8192`. If you have plenty, raise it to `32768` so longer documents fit in one request.

## Network

- **Installation:** internet access is needed once, to download Node.js, the npm packages and the model.
- **After installation:** with `PROVIDER=ollama` the app works **fully offline**. No data is sent anywhere.
- **With `PROVIDER=anthropic`:** the server needs outbound HTTPS access to `api.anthropic.com`. Document text is sent to Anthropic for processing.
- **Ports:** the app uses `3000` (change with `PORT`). Ollama uses `11434` and should not be exposed to the network.

## Supported input files

| Format | Extension | Notes |
|---|---|---|
| PDF | .pdf | Must contain selectable text. Scanned image PDFs need OCR first. |
| Word | .docx | Text and tables (as plain text). |
| PowerPoint | .pptx | Slide text and speaker notes, labeled by slide number. |
| Text | .txt, .md, .csv, .json, .log | Read as-is. |
| Web page | .html, .htm | Visible text only. |

Not supported: `.doc`, `.ppt` (save as .docx/.pptx), images, audio and video.

## Exports

| Format | Opens in |
|---|---|
| Word (.docx) | Microsoft Word 2010+, Google Docs, LibreOffice, Pages |
| PowerPoint (.pptx) | Microsoft PowerPoint 2010+, Google Slides, Keynote, LibreOffice Impress |
| Markdown (.md) | Any text editor, GitHub, Notion, Obsidian |

## npm packages

Installed automatically by `npm install`. These are browser libraries the server hands to the page, so the app works without internet access.

| Package | Version | Purpose | License |
|---|---|---|---|
| pdfjs-dist | 3.11.174 | Reading PDFs | Apache-2.0 |
| mammoth | 1.6.0 | Reading .docx | BSD-2-Clause |
| jszip | 3.10.1 | Reading .pptx | MIT or GPL-3.0 (used under MIT) |
| marked | 4.3.0 | Displaying Markdown | MIT |
| dompurify | 3.0.6 | Sanitizing output | Apache-2.0 or MPL-2.0 |
| docx | 8.5.0 | Word export | MIT |
| pptxgenjs | 3.12.0 | PowerPoint export | MIT |

The server itself uses only built-in Node.js modules.
