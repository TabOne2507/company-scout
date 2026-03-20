import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { error: "Too many requests." },
  standardHeaders: true, legacyHeaders: false,
});
app.use("/api/", limiter);

// ── SSE Log Broadcaster ────────────────────────────────────────────────────────
const logClients = new Map(); // sessionId → res

function pushLog(sessionId, level, msg) {
  const client = logClients.get(sessionId);
  const entry = { ts: new Date().toISOString(), level, msg };
  console.log(`[${sessionId?.slice(0,6)}] [${level}] ${msg}`);
  if (client) {
    try { client.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
  }
}

// ── HTML ───────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>CompanyScout — AI Company Discovery</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d0d0f;--bg2:#111114;--bg3:#18181c;--bg4:#1e1e24;
  --border:#252530;--border2:#2e2e3a;
  --text:#ededf0;--muted:#7b7a8a;--muted2:#4a4959;
  --accent:#6c63ff;--accent-glow:rgba(108,99,255,0.15);
  --green:#3ecf8e;--yellow:#f5c842;--red:#ff6b6b;--blue:#60a5fa;
  --card:#13131a;--radius:10px;
}
html{font-size:16px;scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;line-height:1.6}
::selection{background:var(--accent);color:#fff}
.wrap{max-width:1160px;margin:0 auto;padding:0 32px}
@media(max-width:640px){.wrap{padding:0 16px}}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

/* NAV */
nav{padding:16px 0;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200;background:rgba(13,13,15,0.95);backdrop-filter:blur(20px)}
.nav-inner{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none}
.brand-icon{width:32px;height:32px;background:var(--accent);border-radius:8px;display:grid;place-items:center}
.brand-icon svg{width:17px;height:17px;stroke:#fff;fill:none;stroke-width:2.2}
.brand-name{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;color:var(--text);letter-spacing:-0.02em}
.nav-right{display:flex;align-items:center;gap:10px}
.nav-badge{font-size:0.6rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);background:var(--bg3);border:1px solid var(--border2);padding:4px 11px;border-radius:20px}
.nav-status{width:7px;height:7px;border-radius:50%;background:var(--muted2)}
.nav-status.live{background:var(--green);animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}

/* HERO */
.hero{padding:52px 0 40px}
.hero-tag{display:inline-flex;align-items:center;gap:7px;font-size:0.68rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);background:var(--accent-glow);border:1px solid rgba(108,99,255,0.25);padding:5px 13px;border-radius:20px;margin-bottom:20px}
.hero-dot{width:5px;height:5px;background:var(--accent);border-radius:50%;animation:blink 1.8s infinite}
h1{font-family:'Syne',sans-serif;font-size:clamp(2.2rem,4vw,3.4rem);font-weight:800;line-height:1.06;letter-spacing:-0.04em;color:var(--text);margin-bottom:16px;max-width:640px}
h1 .ac{color:var(--accent)}
.hero-sub{font-size:0.9rem;color:var(--muted);max-width:460px;line-height:1.8;font-weight:300;margin-bottom:32px}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{display:flex;align-items:center;gap:7px;font-size:0.72rem;font-weight:500;color:var(--muted);background:var(--bg3);border:1px solid var(--border2);padding:6px 13px;border-radius:7px}
.pill svg{width:13px;height:13px;stroke:var(--accent);fill:none;stroke-width:2;flex-shrink:0}

/* PANEL */
.panel{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:32px;margin-bottom:32px}
.panel-hd{font-size:0.6rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted2);margin-bottom:22px;display:flex;align-items:center;gap:10px}
.panel-hd::after{content:'';flex:1;height:1px;background:var(--border)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:580px){.g2{grid-template-columns:1fr}}
.full{grid-column:1/-1}
.field{display:flex;flex-direction:column;gap:6px}
.lbl{font-size:0.65rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted)}
.hint{font-size:0.6rem;color:var(--muted2);margin-top:1px}
input,select{font-family:'Inter',sans-serif;font-size:0.86rem;padding:11px 14px;border:1px solid var(--border2);border-radius:8px;background:var(--bg2);color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s;width:100%}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
input::placeholder{color:var(--muted2);font-weight:300}
select option{background:var(--bg2)}
.toggle{display:flex;align-items:center;gap:11px;padding:11px 14px;border:1px solid var(--border2);border-radius:8px;background:var(--bg2);cursor:pointer;user-select:none;transition:border-color .15s}
.toggle:hover{border-color:var(--accent)}
.toggle input[type=checkbox]{width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;cursor:pointer}
.tgl-txt{font-size:0.82rem;color:var(--muted);line-height:1.4}
.tgl-txt b{color:var(--text);font-weight:500;display:block;font-size:0.84rem;margin-bottom:1px}
.btn-go{grid-column:1/-1;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:15px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;transition:background .15s,transform .1s,box-shadow .15s;display:flex;align-items:center;justify-content:center;gap:11px;box-shadow:0 4px 18px rgba(108,99,255,0.35)}
.btn-go:hover:not(:disabled){background:#7c74ff;box-shadow:0 6px 26px rgba(108,99,255,0.5)}
.btn-go:active:not(:disabled){transform:scale(0.99)}
.btn-go:disabled{background:var(--muted2);box-shadow:none;cursor:not-allowed}
.btn-go .sp{width:17px;height:17px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:none;flex-shrink:0}
.btn-go.ld .sp{display:block}
.btn-go.ld .bt{opacity:0.55}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── LIVE LOG PANEL ── */
.log-panel{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;margin-bottom:28px;overflow:hidden;display:none}
.log-panel.on{display:block}
.log-header{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--border);background:var(--bg3)}
.log-title{display:flex;align-items:center;gap:8px;font-size:0.65rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)}
.log-live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 1s infinite;flex-shrink:0}
.log-actions{display:flex;gap:6px}
.log-btn{font-size:0.6rem;font-weight:500;padding:3px 9px;border:1px solid var(--border2);background:transparent;color:var(--muted2);border-radius:4px;cursor:pointer;transition:all .15s;font-family:'JetBrains Mono',monospace}
.log-btn:hover{border-color:var(--muted);color:var(--muted)}
.log-body{font-family:'JetBrains Mono',monospace;font-size:0.72rem;line-height:1.6;padding:14px 16px;max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:3px}
.log-line{display:flex;gap:10px;align-items:baseline}
.log-ts{color:var(--muted2);flex-shrink:0;font-size:0.65rem}
.log-lvl{flex-shrink:0;font-weight:600;font-size:0.62rem;padding:1px 6px;border-radius:3px;text-transform:uppercase}
.log-lvl.info{background:rgba(96,165,250,0.12);color:var(--blue)}
.log-lvl.ok{background:rgba(62,207,142,0.12);color:var(--green)}
.log-lvl.warn{background:rgba(245,200,66,0.12);color:var(--yellow)}
.log-lvl.err{background:rgba(255,107,107,0.12);color:var(--red)}
.log-lvl.step{background:rgba(108,99,255,0.15);color:var(--accent)}
.log-msg{color:var(--text);word-break:break-word}
.log-empty{color:var(--muted2);font-style:italic;padding:8px 0}

/* ERR BOX */
.err-box{display:none;padding:13px 16px;background:rgba(255,107,107,0.07);border:1px solid rgba(255,107,107,0.22);border-radius:9px;color:var(--red);font-size:0.82rem;margin-bottom:20px;line-height:1.6}
.err-box.on{display:block}

/* RESULTS BAR */
.rbar{display:none;align-items:center;justify-content:space-between;padding:18px 0;border-bottom:1px solid var(--border);margin-bottom:24px;flex-wrap:wrap;gap:12px}
.rbar.on{display:flex}
.rcount{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--text);line-height:1}
.rcount em{color:var(--accent);font-style:normal}
.rmeta{font-size:0.66rem;color:var(--muted2);margin-top:4px}
.acts{display:flex;gap:7px;flex-wrap:wrap}
.btn-sm{font-size:0.68rem;font-weight:500;padding:7px 14px;border:1px solid var(--border2);background:transparent;color:var(--muted);border-radius:7px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px;white-space:nowrap}
.btn-sm:hover{border-color:var(--text);color:var(--text)}
.btn-sm.hi{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-sm.hi:hover{background:#7c74ff;border-color:#7c74ff}

/* SUMMARY */
.summary{font-size:0.83rem;color:var(--muted);line-height:1.85;padding:14px 18px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;margin-bottom:24px;display:none}
.summary.on{display:block}

/* FILTERS */
.fbar{display:none;gap:7px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
.fbar.on{display:flex}
.flbl{font-size:0.6rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2)}
.chip{font-size:0.65rem;font-weight:500;padding:4px 12px;border:1px solid var(--border2);border-radius:20px;background:transparent;color:var(--muted);cursor:pointer;transition:all .15s;white-space:nowrap}
.chip:hover,.chip.on{border-color:var(--accent);color:var(--accent)}
.chip.on{background:var(--accent);color:#fff}

/* CARDS */
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px;margin-bottom:36px}
@media(max-width:720px){.cgrid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:13px;overflow:hidden;transition:border-color .2s,box-shadow .2s,transform .2s;animation:fadeUp .4s ease both;display:flex;flex-direction:column}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.card:hover{border-color:var(--accent);box-shadow:0 12px 40px rgba(0,0,0,0.5);transform:translateY(-2px)}
.card-bar{height:3px;background:linear-gradient(90deg,var(--accent),#a78bfa);opacity:0;transition:opacity .2s}
.card:hover .card-bar{opacity:1}
.card-body{padding:20px;display:flex;flex-direction:column;gap:13px;flex:1}
.card-top{display:flex;align-items:flex-start;gap:11px}
.ava{width:42px;height:42px;border-radius:9px;background:var(--bg3);border:1px solid var(--border2);display:grid;place-items:center;font-family:'Syne',sans-serif;font-weight:800;font-size:0.95rem;color:var(--accent);flex-shrink:0;text-transform:uppercase}
.ctw{flex:1;min-width:0}
.cname{font-family:'Syne',sans-serif;font-size:0.98rem;font-weight:700;color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.cind{font-size:0.62rem;font-weight:500;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted2)}
.csc{text-align:right;flex-shrink:0}
.scnum{font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;line-height:1}
.sclbl{font-size:0.52rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2);margin-top:1px}
.cdesc{font-size:0.79rem;color:var(--muted);line-height:1.75;font-weight:300}
.dets{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.det{padding:8px 10px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)}
.dlbl{font-size:0.52rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:3px}
.dval{font-size:0.74rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prods{padding:10px 12px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)}
.plbl{font-size:0.52rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:7px}
.plist{display:flex;flex-wrap:wrap;gap:4px}
.ppill{font-size:0.63rem;font-weight:500;padding:2px 8px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text)}
.tags{display:flex;flex-wrap:wrap;gap:4px}
.tag{font-size:0.58rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:2px 8px;background:rgba(108,99,255,0.1);color:var(--accent);border-radius:3px;border:1px solid rgba(108,99,255,0.2)}
.ctrow{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);flex-wrap:wrap}
.ctlbl{font-size:0.52rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2)}
.ctrow a{font-size:0.7rem;color:var(--accent);text-decoration:none}.ctrow a:hover{text-decoration:underline}
.card-ft{display:flex;align-items:center;justify-content:space-between;padding:11px 20px;border-top:1px solid var(--border);background:var(--bg2);flex-wrap:wrap;gap:7px}
.clink{font-size:0.68rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:4px;transition:gap .15s}
.clink:hover{gap:7px}
.csoc{display:flex;gap:6px}
.csoc a{font-size:0.6rem;font-weight:500;color:var(--muted);padding:2px 7px;border:1px solid var(--border2);border-radius:3px;text-decoration:none;transition:all .15s}
.csoc a:hover{border-color:var(--accent);color:var(--accent)}
.csrc{font-size:0.56rem;color:var(--muted2);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* LOAD MORE */
.more{display:none;text-align:center;padding:4px 0 48px}
.more.on{display:block}
.btn-more{font-family:'Syne',sans-serif;font-size:0.83rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:13px 40px;background:transparent;color:var(--text);border:1.5px solid var(--border2);border-radius:10px;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:10px}
.btn-more:hover{border-color:var(--accent);color:var(--accent);box-shadow:0 0 18px var(--accent-glow)}
.btn-more:disabled{opacity:0.3;cursor:not-allowed}
.btn-more .sp{width:14px;height:14px;border:2px solid rgba(255,255,255,0.2);border-top-color:currentColor;border-radius:50%;animation:spin .7s linear infinite;display:none}
.btn-more.ld .sp{display:block}
.more-hint{font-size:0.66rem;color:var(--muted2);margin-top:9px}

/* SOURCES */
.srcs{display:none;margin-bottom:44px;padding:20px 24px;background:var(--bg3);border-radius:11px;border:1px solid var(--border)}
.srcs.on{display:block}
.srcs-lbl{font-size:0.58rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted2);margin-bottom:11px;display:flex;align-items:center;gap:9px}
.srcs-lbl::after{content:'';flex:1;height:1px;background:var(--border)}
.srcs-list{display:flex;flex-wrap:wrap;gap:6px}
.spill{font-size:0.62rem;padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--muted2);text-decoration:none;max-width:190px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:block;transition:all .15s}
.spill:hover{border-color:var(--accent);color:var(--accent)}

footer{border-top:1px solid var(--border);padding:22px 0;text-align:center;font-size:0.65rem;color:var(--muted2);line-height:1.9}
</style>
</head>
<body>

<nav>
  <div class="wrap nav-inner">
    <a class="brand" href="/">
      <div class="brand-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg></div>
      <span class="brand-name">CompanyScout</span>
    </a>
    <div class="nav-right">
      <div class="nav-status" id="navStatus"></div>
      <span class="nav-badge">Gemini AI</span>
    </div>
  </div>
</nav>

<main>
<div class="wrap">

  <div class="hero">
    <div class="hero-tag"><span class="hero-dot"></span>AI-Powered Discovery</div>
    <h1>Find any company<br/>across the <span class="ac">entire web.</span></h1>
    <p class="hero-sub">Describe what you're looking for. Our AI scrapes the web and extracts structured business intelligence — instantly.</p>
    <div class="pills">
      <span class="pill"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Live web scraping</span>
      <span class="pill"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Up to 50 companies</span>
      <span class="pill"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>CSV &amp; JSON export</span>
      <span class="pill"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" rx="2"/><path d="M9 9h6M9 13h4"/></svg>Live debug logs</span>
    </div>
  </div>

  <!-- SEARCH PANEL -->
  <div class="panel">
    <div class="panel-hd">Configure Search</div>
    <div class="g2">
      <div class="field full">
        <span class="lbl">What companies are you looking for?</span>
        <input id="query" type="text" placeholder="e.g. AI healthcare startups in India, SaaS fintech in Europe..." autocomplete="off"/>
        <span class="hint">Be specific — include industry, geography, stage for best results</span>
      </div>
      <div class="field full">
        <span class="lbl">Gemini API Key</span>
        <input id="apiKey" type="password" placeholder="AIzaSy..." autocomplete="off"/>
        <span class="hint">Get a free key at <b>aistudio.google.com</b> → Never stored on server</span>
      </div>
      <div class="field">
        <span class="lbl">Max Companies</span>
        <select id="maxResults">
          <option value="10">10 companies</option>
          <option value="20" selected>20 companies</option>
          <option value="30">30 companies</option>
          <option value="50">50 companies</option>
        </select>
      </div>
      <div class="field">
        <span class="lbl">Scan Depth</span>
        <label class="toggle">
          <input type="checkbox" id="deepScrape"/>
          <span class="tgl-txt"><b>Deep Scan</b>More pages, richer results (2× slower)</span>
        </label>
      </div>
      <button class="btn-go full" id="searchBtn" onclick="runSearch(false)">
        <div class="sp"></div>
        <span class="bt">Discover Companies →</span>
      </button>
    </div>
  </div>

  <!-- LIVE LOG PANEL -->
  <div class="log-panel" id="logPanel">
    <div class="log-header">
      <div class="log-title">
        <span class="log-live-dot" id="logDot"></span>
        Live Debug Log
      </div>
      <div class="log-actions">
        <button class="log-btn" onclick="clearLog()">Clear</button>
        <button class="log-btn" onclick="toggleLog()">Hide</button>
      </div>
    </div>
    <div class="log-body" id="logBody">
      <span class="log-empty">Logs will appear here when you start a search…</span>
    </div>
  </div>

  <!-- ERROR -->
  <div class="err-box" id="errBox"></div>

  <!-- RESULTS BAR -->
  <div class="rbar" id="rbar">
    <div>
      <div class="rcount" id="rcount"><em>0</em> Companies Found</div>
      <div class="rmeta" id="rmeta"></div>
    </div>
    <div class="acts">
      <button class="btn-sm" onclick="expCSV()" id="btnCSV" style="display:none">↓ CSV</button>
      <button class="btn-sm" onclick="expJSON()" id="btnJSON" style="display:none">↓ JSON</button>
      <button class="btn-sm hi" onclick="runSearch(true)" id="btnNext" style="display:none">⟳ Find Next Batch</button>
    </div>
  </div>

  <div class="summary" id="summ"></div>
  <div class="fbar" id="fbar"></div>
  <div class="cgrid" id="cgrid"></div>

  <div class="more" id="moreSection">
    <button class="btn-more" id="moreBtn" onclick="runSearch(true)">
      <div class="sp"></div><span>Find Next Companies →</span>
    </button>
    <div class="more-hint">Searches with new queries to discover more companies</div>
  </div>

  <div class="srcs" id="srcSection">
    <div class="srcs-lbl">Pages Scraped</div>
    <div class="srcs-list" id="srcList"></div>
  </div>

</div>
</main>
<footer><div class="wrap">CompanyScout — Keys are never stored · Built with Express, Cheerio &amp; Google Gemini</div></footer>

<script>
// ── State ──────────────────────────────────────────────────────────────────────
let allCos=[], curQuery='', isNext=false, offset=0;
let logVisible=true, evtSource=null, sessionId=null;

// ── Log System ─────────────────────────────────────────────────────────────────
function ts(){return new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:2})}

function addLog(level, msg){
  const body=document.getElementById('logBody');
  const empty=body.querySelector('.log-empty');
  if(empty)empty.remove();
  const line=document.createElement('div');line.className='log-line';
  line.innerHTML='<span class="log-ts">'+ts()+'</span><span class="log-lvl '+level+'">'+level.toUpperCase()+'</span><span class="log-msg">'+String(msg).replace(/</g,'&lt;')+'</span>';
  body.appendChild(line);
  body.scrollTop=body.scrollHeight;
  // cap at 200 lines
  while(body.children.length>200)body.removeChild(body.firstChild);
}

function clearLog(){
  const b=document.getElementById('logBody');
  b.innerHTML='<span class="log-empty">Log cleared.</span>';
}

function toggleLog(){
  const b=document.getElementById('logBody');
  const btn=document.querySelector('[onclick="toggleLog()"]');
  logVisible=!logVisible;
  b.style.display=logVisible?'':'none';
  btn.textContent=logVisible?'Hide':'Show';
}

function connectSSE(sid){
  if(evtSource){evtSource.close();evtSource=null}
  addLog('info','Connecting to server log stream…');
  evtSource=new EventSource('/api/logs?sid='+sid);
  evtSource.onmessage=ev=>{
    try{
      const d=JSON.parse(ev.data);
      addLog(d.level||'info', d.msg);
    }catch{}
  };
  evtSource.onopen=()=>{
    addLog('ok','SSE log stream connected');
    document.getElementById('logDot').style.animation='blink 1s infinite';
    document.getElementById('navStatus').classList.add('live');
  };
  evtSource.onerror=()=>{
    addLog('warn','SSE stream disconnected (will retry)');
    document.getElementById('navStatus').classList.remove('live');
  };
}

// ── Main search ────────────────────────────────────────────────────────────────
async function runSearch(next=false){
  const query=document.getElementById('query').value.trim();
  const apiKey=document.getElementById('apiKey').value.trim();
  const maxResults=parseInt(document.getElementById('maxResults').value);
  const deepScrape=document.getElementById('deepScrape').checked;

  // Show log panel immediately
  document.getElementById('logPanel').classList.add('on');

  addLog('info','=== Search started ===');
  addLog('info','Query: "'+query+'"');
  addLog('info','Max results: '+maxResults+' | Deep scan: '+deepScrape);

  if(!query){addLog('err','No query entered');showErr('Please enter a search query.');return}
  if(!apiKey){addLog('err','No API key entered');showErr('Please enter your Gemini API key.');return}
  if(!apiKey.startsWith('AIza')){addLog('warn','API key may be invalid (should start with AIzaSy…)')}

  addLog('info','Generating session ID…');
  sessionId='sess-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  addLog('ok','Session ID: '+sessionId);

  // Connect SSE for server-side logs
  connectSSE(sessionId);
  // Small delay so SSE connects before request
  await new Promise(r=>setTimeout(r,400));

  isNext=next; curQuery=query;
  hideErr();

  if(next){setMoreLoading(true);offset+=allCos.length||0;addLog('info','Next batch search — offset: '+offset)}
  else{offset=0;allCos=[];setLoading(true);clearResults();addLog('info','Fresh search')}

  addLog('step','Sending POST /api/search…');

  try{
    const t0=Date.now();
    const resp=await fetch('/api/search',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-session-id':sessionId},
      body:JSON.stringify({query,apiKey,maxResults,deepScrape,offset,sessionId})
    });
    addLog('info','HTTP '+resp.status+' received after '+(Date.now()-t0)+'ms');

    const text=await resp.text();
    addLog('info','Response size: '+text.length+' bytes');

    let data;
    try{data=JSON.parse(text)}
    catch(pe){
      addLog('err','JSON parse failed: '+pe.message);
      addLog('err','Raw response: '+text.slice(0,300));
      throw new Error('Server returned invalid JSON: '+text.slice(0,120));
    }

    if(!resp.ok){
      addLog('err','Server error: '+JSON.stringify(data));
      throw new Error(data.error||'Server error '+resp.status);
    }

    const cos=data.companies||[];
    addLog('ok','Parsed '+cos.length+' companies');
    if(data.meta)addLog('info','Scraped: '+data.meta.pagesScraped+' pages | Queries: '+(data.meta.queriesUsed||[]).length);

    allCos=next?[...allCos,...cos]:cos;
    next?appendCards(cos,allCos.length-cos.length):renderAll(data);
    updateBar(allCos.length,data);
    addLog('ok','=== Done. '+allCos.length+' total companies ===');

  }catch(err){
    addLog('err','FETCH ERROR: '+err.message);
    if(err.message.includes('fetch'))addLog('warn','Check: server running? CORS? Network?');
    showErr(err.message);
  }finally{
    setLoading(false);setMoreLoading(false);
    if(evtSource){setTimeout(()=>{evtSource.close();document.getElementById('navStatus').classList.remove('live')},3000)}
  }
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderAll(d){
  const cos=d.companies||[];
  document.getElementById('rbar').classList.add('on');
  if(d.summary){const s=document.getElementById('summ');s.textContent=d.summary;s.classList.add('on')}
  buildFilters(cos);
  cos.forEach((c,i)=>document.getElementById('cgrid').appendChild(mkCard(c,i)));
  if(d.searchedUrls?.length){
    document.getElementById('srcSection').classList.add('on');
    const sl=document.getElementById('srcList');
    d.searchedUrls.slice(0,24).forEach(u=>{
      const a=document.createElement('a');a.className='spill';a.href=u;a.target='_blank';a.rel='noopener';
      try{a.textContent=new URL(u).hostname}catch{a.textContent=u}
      sl.appendChild(a);
    });
  }
  if(cos.length>0){
    ['btnCSV','btnJSON','btnNext'].forEach(id=>document.getElementById(id).style.display='flex');
    document.getElementById('moreSection').classList.add('on');
  }
}
function appendCards(cos,si){cos.forEach((c,i)=>document.getElementById('cgrid').appendChild(mkCard(c,si+i)));document.getElementById('moreSection').classList.add('on')}
function updateBar(count,d){
  document.getElementById('rcount').innerHTML='<em>'+count+'</em> Compan'+(count===1?'y':'ies')+' Found';
  document.getElementById('rmeta').textContent=(d.meta?.pagesScraped||0)+' pages · '+(d.meta?.queriesUsed||[]).length+' queries'+(isNext?' · expanded batch':'');
}
function buildFilters(cos){
  const inds=[...new Set(cos.map(c=>c.industry).filter(Boolean))];
  const bar=document.getElementById('fbar');
  bar.innerHTML='<span class="flbl">Industry:</span><span class="chip on" onclick="filt(\'all\',this)">All</span>';
  inds.slice(0,8).forEach(ind=>{const s=document.createElement('span');s.className='chip';s.textContent=ind;s.onclick=()=>filt(ind,s);bar.appendChild(s)});
  bar.classList.add('on');
}
function filt(ind,el){
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');
  document.querySelectorAll('.card').forEach(c=>{c.style.display=(ind==='all'||c.dataset.ind===ind)?'':'none'});
}

function mkCard(c,idx){
  const card=document.createElement('div');card.className='card';card.dataset.ind=c.industry||'';card.style.animationDelay=Math.min(idx,12)*45+'ms';
  const sc=c.relevanceScore||0;const cc=sc>=80?'#3ecf8e':sc>=60?'#6c63ff':'#888794';
  const init=(c.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const site=c.website||c.source||'#';
  const dets=[];
  if(c.founded)dets.push({l:'Founded',v:c.founded});if(c.location)dets.push({l:'Location',v:c.location});
  if(c.size)dets.push({l:'Size',v:c.size});if(c.funding)dets.push({l:'Funding',v:c.funding});
  const dHTML=dets.length?'<div class="dets">'+dets.map(d=>'<div class="det"><div class="dlbl">'+e(d.l)+'</div><div class="dval" title="'+e(d.v)+'">'+e(d.v)+'</div></div>').join('')+'</div>':'';
  const pHTML=c.keyProducts?.length?'<div class="prods"><div class="plbl">Key Products</div><div class="plist">'+c.keyProducts.slice(0,5).map(p=>'<span class="ppill">'+e(p)+'</span>').join('')+'</div></div>':'';
  const tHTML=c.tags?.length?'<div class="tags">'+c.tags.slice(0,6).map(t=>'<span class="tag">'+e(t)+'</span>').join('')+'</div>':'';
  const ctHTML=c.contactEmail?'<div class="ctrow"><span class="ctlbl">Email</span><a href="mailto:'+e(c.contactEmail)+'">'+e(c.contactEmail)+'</a></div>':'';
  let soc='';if(c.socialLinks?.linkedin)soc+='<a href="'+e(c.socialLinks.linkedin)+'" target="_blank" rel="noopener">LinkedIn ↗</a>';if(c.socialLinks?.twitter)soc+='<a href="'+e(c.socialLinks.twitter)+'" target="_blank" rel="noopener">Twitter ↗</a>';
  let src='';try{src=new URL(c.source||site).hostname}catch{}
  card.innerHTML='<div class="card-bar"></div><div class="card-body"><div class="card-top"><div class="ava">'+init+'</div><div class="ctw"><div class="cname" title="'+e(c.name)+'">'+e(c.name)+'</div><div class="cind">'+e(c.industry||'—')+'</div></div><div class="csc"><div class="scnum" style="color:'+cc+'">'+sc+'%</div><div class="sclbl">match</div></div></div><div class="cdesc">'+e(c.description||'')+'</div>'+dHTML+pHTML+tHTML+ctHTML+'</div><div class="card-ft"><a class="clink" href="'+e(site)+'" target="_blank" rel="noopener">Visit Site →</a><div class="csoc">'+soc+'</div>'+(src?'<span class="csrc">'+src+'</span>':'')+'</div>';
  return card;
}
function e(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function expJSON(){const b=new Blob([JSON.stringify({query:curQuery,total:allCos.length,companies:allCos},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='companyscout-'+Date.now()+'.json';a.click()}
function expCSV(){const h=['Name','Website','Industry','Founded','Location','Size','Funding','Description','Tags','Score','LinkedIn','Twitter','Email'];const r=allCos.map(c=>[c.name,c.website,c.industry,c.founded,c.location,c.size,c.funding,c.description,(c.tags||[]).join('; '),c.relevanceScore,c.socialLinks?.linkedin||'',c.socialLinks?.twitter||'',c.contactEmail||''].map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(','));const b=new Blob([[h.join(','),...r].join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='companyscout-'+Date.now()+'.csv';a.click()}
function clearResults(){document.getElementById('cgrid').innerHTML='';document.getElementById('srcList').innerHTML='';document.getElementById('fbar').innerHTML='';['rbar','summ','fbar','srcSection','moreSection'].forEach(id=>document.getElementById(id).classList.remove('on'));['btnCSV','btnJSON','btnNext'].forEach(id=>document.getElementById(id).style.display='none');allCos=[]}
function setLoading(v){const b=document.getElementById('searchBtn');b.disabled=v;b.classList.toggle('ld',v)}
function setMoreLoading(v){const b=document.getElementById('moreBtn');b.disabled=v;b.classList.toggle('ld',v);const b2=document.getElementById('btnNext');if(b2)b2.disabled=v}
function showErr(m){const e=document.getElementById('errBox');e.innerHTML='<b>Error:</b> '+m;e.classList.add('on')}
function hideErr(){document.getElementById('errBox').classList.remove('on')}
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&(ev.target.id==='query'||ev.target.id==='apiKey'))runSearch(false)});
addLog('info','CompanyScout v2 ready — enter your query and Gemini API key above');
</script>
</body>
</html>`;

// ── SSE endpoint for live logs ─────────────────────────────────────────────────
app.get("/api/logs", (req, res) => {
  const sid = req.query.sid;
  if (!sid) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ level:"ok", msg:"Log stream connected for session " + sid })}\n\n`);
  logClients.set(sid, res);
  req.on("close", () => { logClients.delete(sid); });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date() }));
app.get("/", (_, res) => res.setHeader("Content-Type","text/html").send(HTML));
app.get(/^(?!\/api).*$/, (_, res) => res.setHeader("Content-Type","text/html").send(HTML));

app.post("/api/search", async (req, res) => {
  const { query, apiKey, maxResults=20, deepScrape=false, offset=0, sessionId="" } = req.body;
  const sid = sessionId || req.headers["x-session-id"] || "unknown";
  const log = (level, msg) => pushLog(sid, level, msg);

  log("step", "POST /api/search received");
  log("info", `Query: "${query}" | maxResults: ${maxResults} | deepScrape: ${deepScrape} | offset: ${offset}`);

  if (!query?.trim()) return res.status(400).json({ error: "Query is required." });
  if (!apiKey?.trim()) return res.status(400).json({ error: "Gemini API key is required." });
  if (query.length > 300) return res.status(400).json({ error: "Query too long (max 300 chars)." });

  try {
    log("step", "Initializing Gemini client…");
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    log("ok", "Gemini client ready (gemini-1.5-flash)");

    // Step 1: Generate queries
    log("step", "Generating search queries with Gemini…");
    let queries = [];
    try {
      const qRes = await model.generateContent({
        contents: [{ role:"user", parts:[{ text:
          `Generate 4 diverse web search queries to find companies matching: "${query}".
${offset > 0 ? `This is batch #${Math.floor(offset/maxResults)+2} — generate DIFFERENT queries for NEW companies.` : ""}
Return ONLY valid JSON (no markdown): {"queries":["q1","q2","q3","q4"]}`
        }]}],
        generationConfig: { temperature: 0.6, maxOutputTokens: 400 }
      });
      const raw = qRes.response.text().replace(/\`\`\`json|\`\`\`/g,"").trim();
      log("info", `Raw query response: ${raw.slice(0,200)}`);
      queries = JSON.parse(raw).queries || [];
      log("ok", `Generated ${queries.length} search queries`);
      queries.forEach((q,i) => log("info", `  Query ${i+1}: ${q}`));
    } catch (qErr) {
      log("warn", `Query generation failed: ${qErr.message} — using original query only`);
    }

    const searchQueries = [query, ...queries].slice(0, 5);

    // Step 2: DuckDuckGo
    log("step", `Searching DuckDuckGo with ${searchQueries.length} queries…`);
    const searchLimit = deepScrape ? 8 : 5;
    const allResults = [];
    for (const q of searchQueries) {
      log("info", `DDG search: "${q}"`);
      const r = await searchDDG(q, searchLimit);
      log("info", `  → ${r.length} results`);
      allResults.push(...r);
    }

    const seen = new Set();
    const unique = allResults.filter(r => {
      try { const h = new URL(r.url).hostname; if(seen.has(h)) return false; seen.add(h); return true; }
      catch { return false; }
    });
    log("ok", `${unique.length} unique URLs after dedup (from ${allResults.length} total)`);

    const top = unique.slice(0, deepScrape ? 20 : 14);
    log("step", `Scraping ${top.length} pages concurrently…`);

    // Step 3: Scrape
    const pages = await Promise.allSettled(top.map(r => scrapePage(r.url, log)));
    const settled = pages.map((p, i) => {
      if (p.status === "fulfilled" && p.value) return p.value;
      return { text: top[i].snippet||"", title: top[i].title||"", description: top[i].snippet||"", url: top[i].url };
    });
    const goodPages = settled.filter(p => p.text?.length > 50);
    log("ok", `${goodPages.length}/${top.length} pages scraped with content`);

    // Step 4: Extract
    log("step", "Sending content to Gemini for extraction…");
    const context = settled
      .map((p,i) => `--- Source ${i+1}: ${p.url} ---\nTitle: ${p.title}\nMeta: ${p.description}\n${p.text}`)
      .join("\n\n").slice(0, 28000);
    log("info", `Context size: ${context.length} chars`);

    const prompt = `You are a business intelligence analyst. Extract ALL companies from the content below that match: "${query}".
${offset > 0 ? `This is a follow-up batch — prioritize DIFFERENT companies not commonly listed.` : ""}

Return ONLY valid JSON (absolutely no markdown, no backticks, no explanation):
{
  "companies": [{
    "name": "Company Name",
    "website": "https://...",
    "description": "3-4 sentence detailed description",
    "industry": "Specific sector",
    "founded": "YYYY or null",
    "location": "City, Country or null",
    "size": "Startup/SMB/Mid-size/Enterprise or null",
    "funding": "Stage or amount or null",
    "keyProducts": ["Product 1","Product 2"],
    "tags": ["tag1","tag2","tag3"],
    "relevanceScore": 88,
    "contactEmail": null,
    "socialLinks": {"linkedin": null,"twitter": null},
    "source": "source URL"
  }],
  "summary": "3 sentence summary of findings",
  "totalFound": 0
}

Rules: Max ${Math.min(maxResults,20)} companies. Only REAL verifiable companies. Scores 0-100. NO invented data. ONLY JSON output.

CONTENT:
${context}`;

    let extractResult;
    try {
      const genRes = await model.generateContent({
        contents: [{ role:"user", parts:[{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      });
      const rawText = genRes.response.text();
      log("info", `Gemini raw response length: ${rawText.length} chars`);
      log("info", `First 200 chars: ${rawText.slice(0,200)}`);
      const cleaned = rawText.replace(/```json|```/g,"").trim();
      extractResult = JSON.parse(cleaned);
      log("ok", `Extracted ${extractResult.companies?.length||0} companies from Gemini response`);
    } catch (gErr) {
      log("err", `Gemini extraction failed: ${gErr.message}`);
      throw new Error(`Gemini extraction failed: ${gErr.message}`);
    }

    extractResult.totalFound = extractResult.companies?.length || 0;
    if (extractResult.companies) extractResult.companies.sort((a,b) => (b.relevanceScore||0)-(a.relevanceScore||0));

    log("ok", `Search complete — returning ${extractResult.totalFound} companies`);

    return res.json({
      success: true, query, ...extractResult,
      searchedUrls: top.map(r => r.url),
      meta: { queriesUsed: searchQueries, pagesScraped: goodPages.length, deepScrape, offset }
    });

  } catch (err) {
    log("err", `FATAL: ${err.message}`);
    if (err.stack) log("err", err.stack.split("\n")[1]||"");
    if (err.message?.includes("API_KEY_INVALID")||err.message?.includes("API key not valid")) {
      return res.status(401).json({ error: "Invalid Gemini API key. Get one free at aistudio.google.com" });
    }
    if (err.message?.includes("quota")||err.message?.includes("429")) {
      return res.status(429).json({ error: "Gemini rate limit reached. Wait a moment then retry." });
    }
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function searchDDG(query, maxResults=8) {
  try {
    const { data } = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
      timeout: 12000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $(".result__body").each((_,el) => {
      const title=$(el).find(".result__title").text().trim();
      const snippet=$(el).find(".result__snippet").text().trim();
      const href=$(el).find(".result__url").attr("href")||$(el).find("a.result__url").text().trim();
      const link=$(el).find("a.result__a").attr("href");
      if(title&&(link||href)) results.push({title,snippet,url:link||`https://${href}`});
      if(results.length>=maxResults) return false;
    });
    return results;
  } catch(e) { console.error("DDG:",e.message); return []; }
}

async function scrapePage(url, log=(()=>{})) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CompanyScoutBot/2.0)", Accept: "text/html" },
      maxRedirects: 4,
    });
    const $ = cheerio.load(data);
    $("script,style,nav,footer,header,aside,noscript,svg,.cookie,.popup,.modal,.banner").remove();
    const text = $("body").text().replace(/\s+/g," ").trim().slice(0, 5000);
    return { text, title: $("title").text().trim(), description: $('meta[name="description"]').attr("content")||"", url };
  } catch(e) {
    log("warn", `  Scrape failed (${url.slice(0,60)}): ${e.message}`);
    return null;
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 CompanyScout v2 running on http://0.0.0.0:${PORT}`);
});
