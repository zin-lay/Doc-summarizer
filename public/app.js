(() => {
  const $ = id => document.getElementById(id);
  const MODES = {
    overview:  {label:"Overview",       ask:"Write a clear prose summary of the document: what it is, its main argument or purpose, and its most important conclusions."},
    keypoints: {label:"Key points",     ask:"Summarize the document as a bulleted list of its key points, ordered by importance. Bold the single most important phrase in each bullet."},
    executive: {label:"Executive brief",ask:"Write an executive brief with these sections: Bottom line (1–2 sentences), Key findings, Implications, Recommended next steps."},
    actions:   {label:"Action items",   ask:"Extract every action item, decision, deadline and owner mentioned. Use a Markdown table with columns: Item, Owner, Deadline, Notes. Use '—' when unknown. After the table, list open questions."},
    study:     {label:"Study notes",    ask:"Turn the document into study notes: key concepts with short definitions, important facts/figures, and 5 self-check questions at the end."},
    tldr:      {label:"TL;DR",          ask:"Give a one-to-three sentence TL;DR of the document. Nothing else."}
  };
  const LEN = {short:"Keep it brief (about 80–150 words).", medium:"Aim for about 200–350 words.", detailed:"Be thorough (about 500–800 words), covering every major section."};
  // Limits come from the server (/api/config) based on the model's context window.
  let SINGLE_LIMIT = 24000;  // above this, the document is summarized in sections
  let CHUNK = 19000;         // characters per section for long documents
  let QA_LIMIT = 24000;      // max document characters sent with each question

  let mode = "keypoints", docName = "", lastMd = "", ctl = null, ready = false, chat = [];

  /**
   * Ask the model via the local server. Streams the answer.
   * input: a prompt string, or [{role, content}] turns ending on a user turn.
   * Resolves {text, truncated}; rejects {code, message, text?}.
   */
  async function sample(input, opts = {}) {
    const messages = typeof input === "string" ? [{role: "user", content: input}] : input;
    let text = "";
    let res;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({messages}),
        signal: opts.signal
      });
    } catch (e) {
      throw opts.signal && opts.signal.aborted ? {code: "cancelled", message: "Stopped"} : {code: "network", message: "Can't reach the app server. Is it still running?"};
    }
    if (!res.ok) {
      let msg = "Request failed (HTTP " + res.status + ").";
      try { msg = (await res.json()).error || msg; } catch {}
      throw {code: "server", message: msg};
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", truncated = false;
    try {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream: true});
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const m = JSON.parse(line);
          if (m.error) throw {code: "model", message: m.error, text};
          if (m.delta) { text += m.delta; opts.onText && opts.onText({text, delta: m.delta}); }
          if (m.done) truncated = !!m.truncated;
        }
      }
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw {code: "cancelled", message: "Stopped", text};
      if (e && e.code) throw e;
      throw {code: "network", message: "The connection was interrupted.", text};
    }
    if (!text.trim()) throw {code: "empty", message: "The model returned an empty answer. Try again or use a different summary type."};
    return {text, truncated};
  }

  // ---- mode chips
  for (const [k,v] of Object.entries(MODES)) {
    const b = document.createElement("button");
    b.type="button"; b.className="chip"; b.textContent=v.label; b.dataset.k=k;
    b.setAttribute("aria-pressed", k===mode);
    b.onclick = () => { mode=k; document.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed", c.dataset.k===k)); };
    $("modes").append(b);
  }

  // ---- markdown rendering (sanitized)
  const render = md => DOMPurify.sanitize(window.marked ? marked.parse(md) : md.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])));

  // ---- text stats
  const text = () => $("text").value.trim();
  function refresh() {
    const t = text();
    const words = t ? (t.match(/\S+/g)||[]).length : 0;
    $("wc").textContent = words.toLocaleString() + " words";
    if (!docName) $("docName").textContent = t ? "Pasted text" : "No document loaded";
    const ok = !!t && ready && !ctl;
    $("go").disabled = !ok; $("askBtn").disabled = !ok;
  }
  $("text").addEventListener("input", () => { if (docName && !text()) docName=""; refresh(); });
  $("clear").onclick = () => { $("text").value=""; docName=""; chat=[]; resetChat(); refresh(); };

  // ---- file loading
  const drop = $("drop"), fileIn = $("file");
  drop.onclick = () => fileIn.click();
  drop.onkeydown = e => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); fileIn.click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); };
  fileIn.onchange = () => { if (fileIn.files[0]) load(fileIn.files[0]); fileIn.value=""; };

  async function load(f) {
    setStatus("Reading " + f.name + "…");
    try {
      const ext = f.name.split(".").pop().toLowerCase();
      let t = "";
      if (ext === "pdf") t = await readPdf(f);
      else if (ext === "docx") t = (await mammoth.extractRawText({arrayBuffer: await f.arrayBuffer()})).value;
      else if (ext === "pptx") t = await readPptx(f);
      else if (ext === "doc" || ext === "ppt") throw new Error("Old .doc/.ppt formats aren't supported. Save the file as .docx or .pptx and try again.");
      else if (ext === "html" || ext === "htm") { const d = new DOMParser().parseFromString(await f.text(),"text/html"); t = d.body ? d.body.innerText || d.body.textContent : ""; }
      else t = await f.text();
      t = t.replace(/\u0000/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
      if (!t) throw new Error("No readable text found. If it's a scanned PDF, it has no text layer to extract.");
      $("text").value = t; docName = f.name; $("docName").innerHTML = ""; const b=document.createElement("b"); b.textContent=f.name; $("docName").append(b);
      chat=[]; resetChat();
      setStatus("Loaded " + f.name + ".");
    } catch (e) { setStatus(e.message || "Couldn't read that file.", true); }
    refresh();
  }

  async function readPptx(f) {
    if (!window.JSZip) throw new Error("PowerPoint reader failed to load.");
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    const num = n => +n.match(/(\d+)\.xml$/)[1];
    const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>num(a)-num(b));
    if (!slides.length) throw new Error("No slides found in this file.");
    const NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
    const xmlText = xml => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      return [...doc.getElementsByTagNameNS(NS, "p")]
        .map(p => [...p.getElementsByTagNameNS(NS, "t")].map(t => t.textContent).join(""))
        .filter(l => l.trim()).join("\n");
    };
    // map slide -> notes via relationships
    const out = [];
    for (let i = 0; i < slides.length; i++) {
      setStatus(`Reading slide ${i+1} of ${slides.length}…`);
      const path = slides[i], n = num(path);
      let block = `--- Slide ${i+1} ---\n` + (xmlText(await zip.file(path).async("string")) || "(no text)");
      const rels = zip.file(`ppt/slides/_rels/slide${n}.xml.rels`);
      if (rels) {
        const m = (await rels.async("string")).match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/);
        const nf = m && zip.file("ppt/notesSlides/" + m[1]);
        if (nf) {
          const notes = xmlText(await nf.async("string")).split("\n").filter(l => !/^\d+$/.test(l.trim())).join("\n");
          if (notes.trim()) block += `\nSpeaker notes: ${notes}`;
        }
      }
      out.push(block);
    }
    return out.join("\n\n");
  }

  async function readPdf(f) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error("PDF reader failed to load.");
    lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
    const pdf = await lib.getDocument({data: await f.arrayBuffer()}).promise;
    const pages = [];
    for (let i=1;i<=pdf.numPages;i++) {
      setStatus(`Reading page ${i} of ${pdf.numPages}…`);
      const c = await (await pdf.getPage(i)).getTextContent();
      let line = "", out = [];
      for (const it of c.items) { line += it.str; if (it.hasEOL) { out.push(line); line=""; } else if (!/\s$/.test(it.str)) line += " "; }
      if (line) out.push(line);
      pages.push(out.join("\n"));
    }
    return pages.join("\n\n");
  }

  // ---- status helpers
  function setStatus(msg, err) { $("status").textContent = msg||""; $("status").classList.toggle("err", !!err); }
  function setProg(p) { $("prog").style.display = p==null ? "none" : "block"; $("prog").firstElementChild.style.width = (p||0)*100+"%"; }
const errMsg = e => (e && e.message) || "Something went wrong. Try again.";

  // ---- summarize
  function instructions() {
    const lang = $("lang").value === "same" ? "Write in the same language as the document." : `Write in ${$("lang").value}.`;
    const focus = $("focus").value.trim();
    return [MODES[mode].ask, mode==="tldr" ? "" : LEN[$("length").value], lang,
      focus ? `Pay particular attention to: ${focus}.` : "",
      "If the document is a slide deck (marked '--- Slide N ---'), treat it as a presentation and refer to slide numbers where useful. Use Markdown formatting. Only use information from the document; do not invent facts. Do not add a preamble like 'Here is a summary'."
    ].filter(Boolean).join("\n");
  }

  function chunks(t) {
    const out = []; let i = 0;
    while (i < t.length) {
      let end = Math.min(i + CHUNK, t.length);
      if (end < t.length) { const br = t.lastIndexOf("\n", end); if (br > i + CHUNK*0.6) end = br; }
      out.push(t.slice(i, end)); i = end;
    }
    return out;
  }

  $("go").onclick = async () => {
    const t = text(); if (!t || !ready) return;
    ctl = new AbortController(); busy(true);
    const out = $("out"); out.innerHTML = ""; lastMd = ""; setCopy(false);
    const instr = instructions();
    try {
      let source = t;
      if (t.length > SINGLE_LIMIT) {
        const parts = chunks(t), notes = [];
        for (let i=0;i<parts.length;i++) {
          setStatus(`Reading section ${i+1} of ${parts.length}…`); setProg(i/(parts.length+1));
          const r = await sample(
            `You are condensing part ${i+1} of ${parts.length} of a long document so it can be summarized later. Write dense notes capturing every key fact, figure, name, decision, deadline and conclusion in this part. Plain Markdown bullets, no preamble.\n\n<document_part>\n${parts[i]}\n</document_part>`,
            {signal: ctl.signal});
          notes.push(`## Part ${i+1}\n${r.text}`);
        }
        source = notes.join("\n\n");
        setProg(parts.length/(parts.length+1));
        setStatus("Combining sections…");
      } else setStatus("Thinking…");

      const prompt = `${instr}\n\n${t.length > SINGLE_LIMIT ? "The document was long, so below are section-by-section notes covering all of it. Summarize the document as a whole from these notes." : "Here is the document."}\n\n<document${docName?` name="${docName.replace(/"/g,"")}"`:""}>\n${source}\n</document>`;
      const r = await sample(prompt, {signal: ctl.signal, onText: ({text}) => { setStatus(""); lastMd = text; out.innerHTML = render(text); }});
      lastMd = r.text; lastMode = mode; out.innerHTML = render(r.text);
      setStatus(r.truncated ? "The answer was cut short. Try a shorter length setting." : "");
      setCopy(true); saveRecent();
    } catch (e) {
      if (e && e.text) { lastMd = e.text; out.innerHTML = render(e.text); setCopy(true); }
      if (e && e.code === "cancelled") setStatus("Stopped.");
      else setStatus(errMsg(e), true);
      if (!out.innerHTML) out.innerHTML = '<p class="empty">No result.</p>';
    } finally { setProg(null); ctl = null; busy(false); }
  };
  $("stop").onclick = () => ctl && ctl.abort();

  function busy(on) { $("stop").hidden = !on; $("go").hidden = on; refresh(); }

  // ---- Q&A
  function resetChat() { $("msgs").innerHTML = '<p class="empty">Ask anything about the loaded document. Answers cite only what\'s in it.</p>'; }
  function addMsg(role, md) {
    const em = $("msgs").querySelector(".empty"); if (em) em.remove();
    const d = document.createElement("div"); d.className = "msg " + (role==="user"?"u":"a");
    if (role==="user") d.textContent = md; else { const s=document.createElement("div"); s.className="summary"; s.innerHTML = md ? render(md) : "<p>Thinking…</p>"; d.append(s); }
    $("msgs").append(d); $("msgs").scrollTop = $("msgs").scrollHeight; return d;
  }
  async function ask() {
    const q = $("q").value.trim(), t = text(); if (!q || !t || !ready || ctl) return;
    $("q").value = ""; addMsg("user", q); const bubble = addMsg("assistant", ""); const s = bubble.firstChild;
    const doc = t.length > QA_LIMIT ? t.slice(0, QA_LIMIT) + "\n\n[Document truncated]" : t;
    const rules = `You answer questions about the document below. Use only the document. If the answer isn't in it, say so plainly. Quote short phrases when helpful. Answer in the language of the question. Use Markdown.\n\n<document>\n${doc}\n</document>`;
    chat.push({role:"user", content:q});
    ctl = new AbortController(); busy(true);
    try {
      const r = await sample([{role:"user",content:rules}, ...chat.slice(-10)], {signal:ctl.signal, onText:({text}) => { s.innerHTML = render(text); $("msgs").scrollTop = $("msgs").scrollHeight; }});
      chat.push({role:"assistant", content:r.text}); s.innerHTML = render(r.text);
    } catch (e) {
      s.innerHTML = e && e.text ? render(e.text) : ""; 
      if (!(e && e.code === "cancelled")) { const p=document.createElement("p"); p.style.color="var(--danger)"; p.textContent=errMsg(e); s.append(p); }
      chat.pop();
    } finally { ctl = null; busy(false); }
  }
  $("askBtn").onclick = ask;
  $("q").addEventListener("keydown", e => { if (e.key==="Enter" && !e.isComposing) { e.preventDefault(); ask(); } });

  // ---- tabs
  document.querySelectorAll(".tab").forEach(tb => tb.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x===tb));
    $("panel-sum").hidden = tb.dataset.tab !== "sum"; $("panel-qa").hidden = tb.dataset.tab !== "qa";
  });

  // ---- copy / download
  function setCopy(on) { $("copy").disabled = !on; document.querySelectorAll(".dl").forEach(b => b.disabled = !on); }
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(lastMd); flash("copy","Copied"); }
    catch { const ta=document.createElement("textarea"); ta.value=lastMd; document.body.append(ta); ta.select(); try{document.execCommand("copy"); flash("copy","Copied");}catch{flash("copy","Copy failed");} ta.remove(); }
  };
  function flash(id,msg){ const b=$(id), o=b.textContent; b.textContent=msg; setTimeout(()=>b.textContent=o,1400); }
  // ---- export: Word / PowerPoint / Markdown
// ===== shared exporter (also pasted into the page) =====
  const LIBS = {
    docx: ["docx", "/vendor/docx.umd.js"],
    pptx: ["PptxGenJS", "/vendor/pptxgen.bundle.js"]
  };
  function loadLib(fmt) {
    const [g, src] = LIBS[fmt];
    if (window[g]) return Promise.resolve(window[g]);
    return new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = src;
      sc.onload = () => window[g] ? res(window[g]) : rej(new Error("load"));
      sc.onerror = () => rej(new Error("load")); document.head.append(sc);
    });
  }
  let lastMode = mode;
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  document.querySelectorAll(".dl").forEach(btn => btn.onclick = async () => {
    if (!lastMd) return;
    const fmt = btn.dataset.fmt, label = btn.textContent;
    const raw = (docName || "Summary").replace(/\.[^.]+$/, "");
    const base = raw.replace(/[^\w\-\u3040-\u30ff\u4e00-\u9fff]+/g, "_").slice(0, 60) || "summary";
    const sub = `${MODES[lastMode].label} · ${new Date().toLocaleDateString()}`;
    btn.disabled = true; btn.textContent = "Preparing…";
    try {
      let data;
      if (fmt === "md") data = new Blob([lastMd], {type: "text/markdown"});
      else if (fmt === "docx") data = await toDocx(lastMd, raw, sub, {docx: await loadLib("docx"), marked});
      else data = await toPptx(lastMd, raw, sub, {PptxGenJS: await loadLib("pptx"), marked});
      saveBlob(data, `${base}-${lastMode}-summary.${fmt}`);
    } catch (e) {
      console.error(e);
      if (e && e.message === "load") setStatus("Couldn't load the exporter. Check your connection and try again.", true);
      else setStatus("Export failed. Try again.", true);
    } finally { btn.textContent = label; btn.disabled = false; }
  });

  // ---- recent (summaries only, never document text)
  const RK = "docsum-recent";
  function getRecent(){ try { return JSON.parse(localStorage.getItem(RK)) || []; } catch { return []; } }
  function saveRecent(){
    try {
      const list = getRecent(); list.unshift({name: docName || "Pasted text", mode: MODES[mode].label, md: lastMd, at: Date.now()});
      localStorage.setItem(RK, JSON.stringify(list.slice(0,8)));
    } catch {}
    drawRecent();
  }
  function drawRecent(){
    const list = getRecent(), ul = $("recent"); ul.innerHTML = "";
    $("recentWrap").hidden = !list.length;
    list.forEach(r => {
      const li=document.createElement("li"), b=document.createElement("button"), sm=document.createElement("small");
      b.className="link"; b.type="button"; b.textContent = `${r.name} — ${r.mode}`;
      b.onclick = () => { lastMd=r.md; lastMode=Object.keys(MODES).find(k=>MODES[k].label===r.mode)||"overview"; $("out").innerHTML=render(r.md); setCopy(true); $("tab-sum").click(); setStatus(""); };
      sm.textContent = new Date(r.at).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
      li.append(b, sm); ul.append(li);
    });
  }
  drawRecent();

  // ---- connect to the server
  function showUnavailable(msg) { $("unavail").textContent = msg; $("unavail").hidden = false; }
  (async () => {
    const badge = $("model");
    try {
      const cfg = await (await fetch("/api/config")).json();
      SINGLE_LIMIT = cfg.maxInputChars;
      CHUNK = Math.floor(cfg.maxInputChars * 0.8);
      QA_LIMIT = cfg.maxInputChars;
      badge.textContent = `${cfg.model} · ${cfg.provider}`;
      ready = true; refresh();
      const h = await (await fetch("/api/health")).json();
      if (!h.ok) { badge.classList.add("bad"); badge.title = h.message || ""; showUnavailable("Model not ready: " + (h.message || "check the server log.")); }
    } catch {
      badge.textContent = "Server offline"; badge.classList.add("bad");
      showUnavailable("Can't reach the app server. Start it with: npm start");
    }
  })();
  refresh();
})();
