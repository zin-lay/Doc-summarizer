/**
 * Document Summarizer – server
 *
 * Serves the web app and forwards summarization requests to a language model.
 * No runtime dependencies beyond Node.js 18+ (the npm packages are browser
 * libraries that this server simply hands to the page).
 *
 * Providers (set PROVIDER in .env):
 *   ollama     – local model via Ollama. No API key. Default.
 *   openai     – any OpenAI-compatible server (LM Studio, vLLM, LocalAI, Azure, ...)
 *   anthropic  – Claude API (needs ANTHROPIC_API_KEY)
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
loadEnvFile(path.join(__dirname, ".env"));

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);
const PROVIDER = env("PROVIDER", "ollama").toLowerCase();

const CONFIG = {
  host: env("HOST", "127.0.0.1"),
  port: Number(env("PORT", 3000)),
  provider: PROVIDER,
  appUser: env("APP_USER", ""),
  appPassword: env("APP_PASSWORD", ""),
  maxOutputTokens: Number(env("MAX_OUTPUT_TOKENS", 2048)),
  temperature: Number(env("TEMPERATURE", 0.2)),
  ollama: {
    url: env("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/+$/, ""),
    model: env("OLLAMA_MODEL", "qwen2.5:7b"),
    numCtx: Number(env("OLLAMA_NUM_CTX", 16384)),
  },
  openai: {
    baseUrl: env("OPENAI_BASE_URL", "http://127.0.0.1:1234/v1").replace(/\/+$/, ""),
    apiKey: env("OPENAI_API_KEY", ""),
    model: env("OPENAI_MODEL", "local-model"),
  },
  anthropic: {
    apiKey: env("ANTHROPIC_API_KEY", ""),
    model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
  },
};

// How much document text fits in one request. Rough rule: 1 token ≈ 2 characters
// (safe for mixed English/Japanese), keeping ~40% of the window for
// instructions and the answer. Override with MAX_INPUT_CHARS.
const CONTEXT_TOKENS = Number(
  env("CONTEXT_TOKENS", PROVIDER === "ollama" ? CONFIG.ollama.numCtx : PROVIDER === "anthropic" ? 200000 : 32000)
);
const MAX_INPUT_CHARS = Number(env("MAX_INPUT_CHARS", Math.floor(CONTEXT_TOKENS * 2 * 0.6)));

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB request limit
const PUBLIC_DIR = path.join(__dirname, "public");
const NM = path.join(__dirname, "node_modules");

// Browser libraries served from node_modules – works fully offline.
const VENDOR = {
  "/vendor/pdf.min.js": "pdfjs-dist/build/pdf.min.js",
  "/vendor/pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js",
  "/vendor/mammoth.browser.min.js": "mammoth/mammoth.browser.min.js",
  "/vendor/jszip.min.js": "jszip/dist/jszip.min.js",
  "/vendor/marked.min.js": "marked/marked.min.js",
  "/vendor/purify.min.js": "dompurify/dist/purify.min.js",
  "/vendor/docx.umd.js": "docx/build/index.umd.js",
  "/vendor/pptxgen.bundle.js": "pptxgenjs/dist/pptxgen.bundle.js",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    if (!checkAuth(req, res)) return;

    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        provider: CONFIG.provider,
        model: modelName(),
        maxInputChars: MAX_INPUT_CHARS,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, await healthCheck());
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(req, res);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, res);
    }
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
    else res.end();
  }
});

server.listen(CONFIG.port, CONFIG.host, () => {
  const shown = CONFIG.host === "0.0.0.0" ? "localhost" : CONFIG.host;
  console.log(`Document Summarizer running at http://${shown}:${CONFIG.port}`);
  console.log(`Provider: ${CONFIG.provider} · Model: ${modelName()} · Max input: ${MAX_INPUT_CHARS.toLocaleString()} chars`);
  if (CONFIG.provider === "anthropic" && !CONFIG.anthropic.apiKey)
    console.warn("WARNING: PROVIDER=anthropic but ANTHROPIC_API_KEY is empty.");
  if (CONFIG.host === "0.0.0.0" && !CONFIG.appPassword)
    console.warn("WARNING: Listening on all interfaces without APP_PASSWORD. Anyone on your network can use it.");
});

// ---------------------------------------------------------------------------
// /api/chat  – streams NDJSON lines to the browser:
//   {"delta":"text"}   … repeated
//   {"done":true,"truncated":false}
//   {"error":"message"}  (on failure)
// ---------------------------------------------------------------------------
async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, e.code === "TOO_LARGE" ? 413 : 400, {
      error: e.code === "TOO_LARGE" ? "Request too large." : "Invalid JSON.",
    });
  }

  const messages = normalizeMessages(body && body.messages);
  if (!messages) return sendJson(res, 400, { error: "messages must be a non-empty array ending with a user turn." });

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  const send = obj => res.write(JSON.stringify(obj) + "\n");

  try {
    const provider = { ollama: streamOllama, openai: streamOpenAI, anthropic: streamAnthropic }[CONFIG.provider];
    if (!provider) throw new UserError(`Unknown PROVIDER "${CONFIG.provider}". Use ollama, openai or anthropic.`);
    const { truncated } = await provider(messages, text => send({ delta: text }), ctl.signal);
    send({ done: true, truncated: !!truncated });
  } catch (err) {
    if (ctl.signal.aborted) return res.end();
    console.error("[chat]", err.message);
    send({ error: err instanceof UserError ? err.message : friendlyError(err) });
  }
  res.end();
}

// --- Ollama ---------------------------------------------------------------
async function streamOllama(messages, onDelta, signal) {
  const r = await upstream(`${CONFIG.ollama.url}/api/chat`, {
    model: CONFIG.ollama.model,
    messages,
    stream: true,
    options: { num_ctx: CONFIG.ollama.numCtx, temperature: CONFIG.temperature, num_predict: CONFIG.maxOutputTokens },
  }, {}, signal, "Ollama");
  let truncated = false;
  await readLines(r.body, line => {
    const j = JSON.parse(line);
    if (j.error) throw new UserError(`Ollama: ${j.error}`);
    if (j.message && j.message.content) onDelta(j.message.content);
    if (j.done && j.done_reason === "length") truncated = true;
  });
  return { truncated };
}

// --- OpenAI-compatible ------------------------------------------------------
async function streamOpenAI(messages, onDelta, signal) {
  const headers = CONFIG.openai.apiKey ? { Authorization: `Bearer ${CONFIG.openai.apiKey}` } : {};
  const r = await upstream(`${CONFIG.openai.baseUrl}/chat/completions`, {
    model: CONFIG.openai.model,
    messages,
    stream: true,
    temperature: CONFIG.temperature,
    max_tokens: CONFIG.maxOutputTokens,
  }, headers, signal, "OpenAI-compatible server");
  let truncated = false;
  await readSSE(r.body, data => {
    if (data === "[DONE]") return;
    const j = JSON.parse(data);
    const c = j.choices && j.choices[0];
    if (c && c.delta && c.delta.content) onDelta(c.delta.content);
    if (c && c.finish_reason === "length") truncated = true;
  });
  return { truncated };
}

// --- Anthropic (Claude API) ------------------------------------------------
async function streamAnthropic(messages, onDelta, signal) {
  if (!CONFIG.anthropic.apiKey) throw new UserError("ANTHROPIC_API_KEY is not set in .env.");
  const r = await upstream("https://api.anthropic.com/v1/messages", {
    model: CONFIG.anthropic.model,
    max_tokens: CONFIG.maxOutputTokens,
    temperature: CONFIG.temperature,
    messages,
    stream: true,
  }, {
    "x-api-key": CONFIG.anthropic.apiKey,
    "anthropic-version": "2023-06-01",
  }, signal, "Claude API");
  let truncated = false;
  await readSSE(r.body, data => {
    const j = JSON.parse(data);
    if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") onDelta(j.delta.text);
    else if (j.type === "message_delta" && j.delta && j.delta.stop_reason === "max_tokens") truncated = true;
    else if (j.type === "error") throw new UserError(`Claude API: ${(j.error && j.error.message) || "error"}`);
  });
  return { truncated };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
class UserError extends Error {}

async function upstream(url, payload, headers, signal, label) {
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new UserError(`Can't reach ${label} at ${new URL(url).origin}. Is it running?`);
  }
  if (!r.ok) {
    let detail = "";
    try { const t = await r.text(); try { const j = JSON.parse(t); detail = (j.error && (j.error.message || j.error)) || t; } catch { detail = t; } } catch {}
    if (r.status === 404 && label === "Ollama")
      throw new UserError(`Model "${CONFIG.ollama.model}" isn't installed. Run: ollama pull ${CONFIG.ollama.model}`);
    if (r.status === 401 || r.status === 403) throw new UserError(`${label} rejected the credentials (HTTP ${r.status}). Check your API key.`);
    if (r.status === 429) throw new UserError(`${label} rate limit reached. Wait a moment and try again.`);
    throw new UserError(`${label} error (HTTP ${r.status})${detail ? ": " + String(detail).slice(0, 300) : ""}`);
  }
  return r;
}

async function readLines(stream, onLine) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of stream) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  }
  if (buf.trim()) onLine(buf.trim());
}

async function readSSE(stream, onData) {
  await readLines(stream, line => {
    if (line.startsWith("data:")) onData(line.slice(5).trim());
  });
}

// Turns must alternate user/assistant and end on user. Merge consecutive
// same-role turns (the app sends instructions + question as two user turns).
function normalizeMessages(input) {
  if (!Array.isArray(input) || !input.length) return null;
  const out = [];
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) return null;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

function modelName() {
  return { ollama: CONFIG.ollama.model, openai: CONFIG.openai.model, anthropic: CONFIG.anthropic.model }[CONFIG.provider] || "unknown";
}

async function healthCheck() {
  const result = { ok: true, provider: CONFIG.provider, model: modelName() };
  if (CONFIG.provider === "ollama") {
    try {
      const r = await fetch(`${CONFIG.ollama.url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const j = await r.json();
      const names = (j.models || []).map(m => m.name);
      result.modelInstalled = names.some(n => n === CONFIG.ollama.model || n === CONFIG.ollama.model + ":latest");
      if (!result.modelInstalled) { result.ok = false; result.message = `Run: ollama pull ${CONFIG.ollama.model}`; }
    } catch {
      result.ok = false;
      result.message = `Can't reach Ollama at ${CONFIG.ollama.url}. Start it with: ollama serve`;
    }
  } else if (CONFIG.provider === "anthropic" && !CONFIG.anthropic.apiKey) {
    result.ok = false; result.message = "ANTHROPIC_API_KEY is not set.";
  }
  return result;
}

function friendlyError(err) {
  if (err instanceof SyntaxError) return "The model server sent an unexpected response.";
  return "Something went wrong while generating the answer.";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { const e = new Error("too large"); e.code = "TOO_LARGE"; reject(e); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  let file;
  if (VENDOR[pathname]) file = path.join(NM, VENDOR[pathname]);
  else {
    const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    file = path.resolve(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: "Forbidden" });
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (VENDOR[pathname]) return sendJson(res, 500, { error: "Library missing. Run: npm install" });
      return sendJson(res, 404, { error: "Not found" });
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": VENDOR[pathname] ? "public, max-age=86400" : "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
}

// Optional HTTP Basic Auth – enabled when APP_PASSWORD is set.
function checkAuth(req, res) {
  if (!CONFIG.appPassword) return true;
  const h = req.headers.authorization || "";
  if (h.startsWith("Basic ")) {
    const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
    const p = rest.join(":");
    if (safeEqual(u, CONFIG.appUser || "admin") && safeEqual(p, CONFIG.appPassword)) return true;
  }
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Document Summarizer", charset="UTF-8"' });
  res.end("Authentication required");
  return false;
}

function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Minimal .env loader (KEY=VALUE lines, # comments, optional quotes).
function loadEnvFile(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (/^(["']).*\1$/.test(val)) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
