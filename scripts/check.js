/* Pre-flight check: `npm run check` */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
let ok = true;
const pass = m => console.log("  ✔ " + m);
const fail = m => { ok = false; console.log("  ✘ " + m); };

console.log("\nDocument Summarizer – setup check\n");

const [maj, min] = process.versions.node.split(".").map(Number);
(maj > 18 || (maj === 18 && min >= 17)) ? pass(`Node.js ${process.versions.node}`) : fail(`Node.js ${process.versions.node} is too old. Install Node.js 20 LTS or newer.`);

const libs = ["pdfjs-dist/build/pdf.min.js", "mammoth/mammoth.browser.min.js", "jszip/dist/jszip.min.js", "marked/marked.min.js",
  "dompurify/dist/purify.min.js", "docx/build/index.umd.js", "pptxgenjs/dist/pptxgen.bundle.js"];
const missing = libs.filter(l => !fs.existsSync(path.join(root, "node_modules", l)));
missing.length ? fail("Missing packages. Run: npm install") : pass("npm packages installed");

fs.existsSync(path.join(root, ".env")) ? pass(".env found") : console.log("  • No .env file – using defaults (Ollama, qwen2.5:7b, port 3000)");

// Load .env the same way the server does
try {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2").replace(/\s+#.*$/, "");
  }
} catch {}
const provider = (process.env.PROVIDER || "ollama").toLowerCase();
console.log(`  • Provider: ${provider}`);

(async () => {
  if (provider === "ollama") {
    const url = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    try {
      const j = await (await fetch(url + "/api/tags", { signal: AbortSignal.timeout(4000) })).json();
      pass(`Ollama is running at ${url}`);
      const names = (j.models || []).map(m => m.name);
      names.some(n => n === model || n === model + ":latest") ? pass(`Model ${model} is installed`) : fail(`Model ${model} not installed. Run: ollama pull ${model}`);
    } catch { fail(`Can't reach Ollama at ${url}. Install it from https://ollama.com and make sure it's running.`); }
  } else if (provider === "anthropic") {
    process.env.ANTHROPIC_API_KEY ? pass("ANTHROPIC_API_KEY is set") : fail("ANTHROPIC_API_KEY is empty in .env");
  } else if (provider === "openai") {
    const base = (process.env.OPENAI_BASE_URL || "http://127.0.0.1:1234/v1").replace(/\/+$/, "");
    try {
      const h = process.env.OPENAI_API_KEY ? { Authorization: "Bearer " + process.env.OPENAI_API_KEY } : {};
      const r = await fetch(base + "/models", { headers: h, signal: AbortSignal.timeout(4000) });
      r.ok ? pass(`Server reachable at ${base}`) : fail(`${base}/models returned HTTP ${r.status}`);
    } catch { fail(`Can't reach ${base}. Is your model server running?`); }
  } else fail(`Unknown PROVIDER "${provider}". Use ollama, openai or anthropic.`);

  console.log(ok ? "\nAll good. Start the app with: npm start\n" : "\nFix the items marked ✘, then run this check again.\n");
  process.exit(ok ? 0 : 1);
})();
