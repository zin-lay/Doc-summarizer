# Installation Guide

Check [REQUIREMENTS.md](REQUIREMENTS.md) first. Then pick one option:

- [Option A: Windows](#option-a-windows)
- [Option B: macOS](#option-b-macos)
- [Option C: Linux](#option-c-linux)
- [Option D: Docker (any OS)](#option-d-docker-any-os)
- [Using the Claude API or another model server instead of Ollama](#using-a-different-model-provider)
- [Sharing with your team](#sharing-with-your-team)
- [Running it as a background service](#running-it-as-a-background-service)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Option A: Windows

**1. Install Node.js.** Download the **LTS** installer from https://nodejs.org and run it with the default options. Open a new **PowerShell** window and check:

```powershell
node -v   # should print v20.x or newer
npm -v
```

**2. Install Ollama.** Download it from https://ollama.com/download and run the installer. Ollama starts automatically and runs in the system tray.

**3. Download a model** (one time, about 4.7 GB):

```powershell
ollama pull qwen2.5:7b
```

**4. Get the app.** Either use Git:

```powershell
git clone https://github.com/YOUR-USERNAME/doc-summarizer.git
cd doc-summarizer
```

or download the ZIP from GitHub (**Code → Download ZIP**), extract it, and open PowerShell in that folder.

**5. Install and start:**

```powershell
npm install
copy .env.example .env      # optional: edit .env to change settings
npm run check
npm start
```

**6. Open http://localhost:3000.** To stop the app, press `Ctrl + C` in PowerShell.

> If PowerShell says *"running scripts is disabled on this system"* when you run `npm`, run this once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## Option B: macOS

**1. Install Node.js** from https://nodejs.org (LTS installer), or with Homebrew:

```bash
brew install node
```

**2. Install Ollama** from https://ollama.com/download (drag it to Applications and open it once), or:

```bash
brew install ollama
ollama serve      # leave this running in its own Terminal tab if you installed with Homebrew
```

**3. Download a model:**

```bash
ollama pull qwen2.5:7b
```

**4. Get, install and start the app:**

```bash
git clone https://github.com/YOUR-USERNAME/doc-summarizer.git
cd doc-summarizer
npm install
cp .env.example .env        # optional
npm run check
npm start
```

**5. Open http://localhost:3000.** Stop with `Ctrl + C`.

---

## Option C: Linux

**1. Install Node.js 20** (Ubuntu/Debian example using NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v
```

For other distributions, see https://nodejs.org/en/download/package-manager.

**2. Install Ollama:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This installs Ollama as a systemd service that starts automatically. Check it with `systemctl status ollama`.

**3. Download a model:**

```bash
ollama pull qwen2.5:7b
```

**4. Get, install and start the app:**

```bash
git clone https://github.com/YOUR-USERNAME/doc-summarizer.git
cd doc-summarizer
npm install
cp .env.example .env
npm run check
npm start
```

**5. Open http://localhost:3000.**

---

## Option D: Docker (any OS)

This runs both the app and Ollama in containers, so you don't need to install Node.js or Ollama separately.

**1. Install Docker Desktop** (Windows/macOS) or Docker Engine with the Compose plugin v2.24+ (Linux).

**2. Get the code and start:**

```bash
git clone https://github.com/YOUR-USERNAME/doc-summarizer.git
cd doc-summarizer
cp .env.example .env        # optional
docker compose up -d --build
```

**3. Download the model into the Ollama container** (one time):

```bash
docker compose exec ollama ollama pull qwen2.5:7b
```

**4. Open http://localhost:3000.**

Useful commands:

```bash
docker compose logs -f app     # view app logs
docker compose down            # stop
docker compose up -d --build   # rebuild after updating the code
```

**GPU:** to use an NVIDIA GPU, install the NVIDIA Container Toolkit and uncomment the `deploy:` section in `docker-compose.yml`. On macOS, Docker can't use the Apple GPU. For best speed on a Mac, install Ollama natively (Option B) instead.

---

## Using a different model provider

Edit `.env`, then restart the app (`Ctrl + C`, then `npm start`).

### Claude API

```ini
PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5-5
```

Create a key at https://console.anthropic.com. Check https://docs.claude.com for current model names. The API is billed per use, and document text is sent to Anthropic for processing. Very long documents fit in one request with this provider.

### Groq — fast, free, no credit card (recommended for speed)

1. Go to https://console.groq.com and sign in (Google/GitHub works).
2. Open **API Keys** in the left menu, click **Create API Key**, name it, and copy the key (starts with `gsk_`). You can't see it again later, so paste it somewhere safe now.
3. Open **Models** (or the docs) in the console and note a current chat model name, for example `llama-3.3-70b-versatile`. Names change over time.
4. Edit `.env`:

   ```ini
   PROVIDER=openai
   OPENAI_BASE_URL=https://api.groq.com/openai/v1
   OPENAI_API_KEY=gsk_your-key-here
   OPENAI_MODEL=llama-3.3-70b-versatile
   CONTEXT_TOKENS=32000
   ```

5. Restart the app (`Ctrl + C`, then `npm start`) and hard-refresh the page. The badge top-right should show `… · openai`. If the key is wrong, the badge turns red and says so.

Free tiers have per-minute and per-day request limits. A long document is split into several requests, so very large files may hit the limit; wait a moment and retry, or use a shorter document.

### OpenRouter — many free models, no credit card

1. Go to https://openrouter.ai, sign in, open https://openrouter.ai/keys, create a key and copy it (starts with `sk-or-`).
2. Edit `.env` (the model name **must end in `:free`**):

   ```ini
   PROVIDER=openai
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   OPENAI_API_KEY=sk-or-your-key-here
   OPENAI_MODEL=meta-llama/llama-3.3-70b-instruct:free
   CONTEXT_TOKENS=32000
   ```

3. Restart and hard-refresh.

**Privacy note for hosted providers:** document text is sent to that provider, not kept on your machine, and free tiers may use submitted data to improve their models. Don't use hosted providers for confidential documents — switch `PROVIDER` back to `ollama` for those.

### LM Studio, vLLM, LocalAI or another OpenAI-compatible server

```ini
PROVIDER=openai
OPENAI_BASE_URL=http://127.0.0.1:1234/v1     # LM Studio default
OPENAI_MODEL=the-model-name-shown-in-your-server
OPENAI_API_KEY=                              # leave empty if your server doesn't need one
CONTEXT_TOKENS=16384                         # set to your model's context length
```

### A different Ollama model

```bash
ollama pull llama3.1:8b
```

Then set `OLLAMA_MODEL=llama3.1:8b` in `.env` and restart.

---

## Sharing with your team

By default only the computer running the app can open it. To let colleagues on the same network use it:

1. In `.env`, set:

   ```ini
   HOST=0.0.0.0
   APP_USER=team
   APP_PASSWORD=choose-a-strong-password
   ```

2. Restart the app and allow port 3000 through the firewall:
   - **Windows:** Windows Defender Firewall → Advanced settings → Inbound Rules → New Rule → Port → TCP 3000.
   - **Linux (ufw):** `sudo ufw allow 3000/tcp`
3. Colleagues open `http://YOUR-COMPUTER-IP:3000` and sign in with the user and password.

Find your IP with `ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/macOS).

With Docker, also change the port line in `docker-compose.yml` from `"127.0.0.1:3000:3000"` to `"3000:3000"`.

**For wider use**, put the app behind HTTPS using a reverse proxy. A minimal [Caddy](https://caddyserver.com) setup:

```
summarizer.yourcompany.internal {
    reverse_proxy 127.0.0.1:3000
}
```

When using a proxy, keep `HOST=127.0.0.1` so only the proxy can reach the app. If you use Nginx, set `proxy_buffering off;` so summaries stream smoothly.

Only one summary runs at a time per Ollama model by default. For several simultaneous users, see `OLLAMA_NUM_PARALLEL` in the Ollama documentation, or use a GPU server.

---

## Running it as a background service

### Linux (systemd)

Create `/etc/systemd/system/doc-summarizer.service`:

```ini
[Unit]
Description=Document Summarizer
After=network.target ollama.service

[Service]
WorkingDirectory=/opt/doc-summarizer
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now doc-summarizer
```

### Windows or macOS (pm2)

```bash
npm install -g pm2
pm2 start server.js --name doc-summarizer
pm2 save
pm2 startup        # follow the printed instructions to start on boot
```

On Windows, use the `pm2-installer` package for start-on-boot support.

---

## Updating

```bash
git pull
npm install
# restart the app
```

With Docker: `git pull && docker compose up -d --build`.

---

## Troubleshooting

Run `npm run check` first. It tests Node.js, the packages, your `.env` and the model connection.

| Problem | Fix |
|---|---|
| Badge in the top-right is red: *"Can't reach Ollama"* | Start Ollama (open the app on Windows/macOS, or `ollama serve`). Check `OLLAMA_URL` in `.env`. |
| *"Model … isn't installed"* | Run `ollama pull <model name>` with the exact name in `OLLAMA_MODEL`. |
| *"Library missing. Run: npm install"* | Run `npm install` in the project folder. |
| `EADDRINUSE` when starting | Port 3000 is in use. Set `PORT=3001` in `.env`. |
| Summaries are very slow | Use a smaller model (`qwen2.5:3b`), lower `OLLAMA_NUM_CTX`, or use a GPU. The first request after starting is slower because the model loads into memory. |
| Out-of-memory errors or Ollama crashes | Lower `OLLAMA_NUM_CTX` to `8192`, or use a smaller model. |
| Summary ignores the end of a long document | Raise `OLLAMA_NUM_CTX` (needs more RAM). Long documents are summarized in sections automatically, but each section must fit in the context window. |
| *"The answer was cut short"* | Increase `MAX_OUTPUT_TOKENS` or choose a shorter length. |
| *"Couldn't load the PDF reader … library file is missing"* | The bundled libraries aren't installed. In the project folder run `npm install`, restart the app, then hard-refresh the page (Ctrl+F5 / Cmd+Shift+R). |
| *"Open the app through the server address, not by double-clicking the HTML file"* | You opened `index.html` directly (a `file://` address). Always open the app at `http://localhost:3000` (run `npm start` first). The libraries only load when served by the app. |
| Banner: *"Some components didn't load"* | Same fix as above: `npm install`, restart, hard-refresh. A browser ad-blocker or antivirus can also block the scripts — try a private window. |
| PDF loads but shows no text | It's a scanned PDF. Run OCR (for example Adobe Acrobat or `ocrmypdf`) and try again. |
| *"This PDF is password-protected"* | Remove the password (open it in a PDF viewer and re-save, or print to PDF) and upload again. |
| *"background worker failed to start"* | Hard-refresh the page. If it persists, run `npm install` to restore `pdf.worker.min.js`, then restart the app. |
| Colleagues can't connect | Check `HOST=0.0.0.0`, the firewall rule, and that they use your IP address, not `localhost`. |
| Copy button doesn't work over the network | Browsers only allow clipboard access on HTTPS or localhost. Use HTTPS via a reverse proxy, or select and copy the text manually. |
| Claude API: *"rejected the credentials"* | Check `ANTHROPIC_API_KEY` in `.env` and that the key is active. |
