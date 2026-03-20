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
  windowMs: 15 * 60 * 1000, max: 60,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true, legacyHeaders: false,
});
app.use("/api/", limiter);

// ─────────────────────────────────────────────────────────────────────────────
// HTML (fully inlined — no static folder needed)
// ─────────────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>CompanyScout — AI Company Discovery</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d0d0f;
  --bg2:#141416;
  --bg3:#1a1a1e;
  --border:#2a2a30;
  --border2:#333340;
  --text:#f0eee8;
  --muted:#888794;
  --muted2:#555462;
  --accent:#6c63ff;
  --accent-glow:rgba(108,99,255,0.18);
  --accent2:#ff6b6b;
  --green:#3ecf8e;
  --card:#16161a;
  --radius:10px;
  --shadow:0 4px 24px rgba(0,0,0,0.4);
  --shadow-lg:0 12px 48px rgba(0,0,0,0.6);
}
html{font-size:16px;scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;line-height:1.6}
::selection{background:var(--accent);color:#fff}
.wrap{max-width:1160px;margin:0 auto;padding:0 32px}
@media(max-width:640px){.wrap{padding:0 18px}}

/* scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

/* ── NAV ── */
nav{padding:18px 0;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;background:rgba(13,13,15,0.92);backdrop-filter:blur(20px)}
.nav-inner{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none}
.brand-icon{width:34px;height:34px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center}
.brand-icon svg{width:18px;height:18px;stroke:#fff;fill:none}
.brand-name{font-family:'Syne',sans-serif;font-size:1.15rem;font-weight:800;color:var(--text);letter-spacing:-0.02em}
.nav-chip{font-size:0.62rem;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);background:var(--bg3);border:1px solid var(--border2);padding:5px 12px;border-radius:20px}

/* ── HERO ── */
.hero{padding:64px 0 52px}
.hero-tag{display:inline-flex;align-items:center;gap:8px;font-size:0.7rem;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);background:var(--accent-glow);border:1px solid rgba(108,99,255,0.3);padding:6px 14px;border-radius:20px;margin-bottom:24px}
.hero-tag-dot{width:6px;height:6px;background:var(--accent);border-radius:50%;animation:blink 1.8s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
.hero-h1{font-family:'Syne',sans-serif;font-size:clamp(2.4rem,4.5vw,3.8rem);font-weight:800;line-height:1.06;letter-spacing:-0.04em;color:var(--text);margin-bottom:20px;max-width:680px}
.hero-h1 .hi{color:var(--accent)}
.hero-sub{font-size:0.95rem;color:var(--muted);max-width:480px;line-height:1.8;font-weight:300;margin-bottom:40px}
.hero-pills{display:flex;gap:10px;flex-wrap:wrap}
.hero-pill{display:flex;align-items:center;gap:8px;font-size:0.75rem;font-weight:500;color:var(--muted);background:var(--bg3);border:1px solid var(--border);padding:7px 14px;border-radius:8px}
.hero-pill svg{width:14px;height:14px;stroke:var(--accent);fill:none;flex-shrink:0}

/* ── PANEL ── */
.panel{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:36px;margin-bottom:48px;box-shadow:var(--shadow)}
.panel-head{font-size:0.62rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted2);margin-bottom:24px;display:flex;align-items:center;gap:12px}
.panel-head::after{content:'';flex:1;height:1px;background:var(--border)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:600px){.grid2{grid-template-columns:1fr}}
.full{grid-column:1/-1}
.field{display:flex;flex-direction:column;gap:7px}
.label{font-size:0.68rem;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted)}
.hint{font-size:0.62rem;color:var(--muted2);margin-top:2px}
input,select{font-family:'Inter',monospace;font-size:0.87rem;font-weight:400;padding:12px 15px;border:1px solid var(--border2);border-radius:8px;background:var(--bg2);color:var(--text);outline:none;transition:border-color 0.15s,box-shadow 0.15s;width:100%}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
input::placeholder{color:var(--muted2);font-weight:300}
select option{background:var(--bg2)}
.toggle{display:flex;align-items:center;gap:12px;padding:12px 15px;border:1px solid var(--border2);border-radius:8px;background:var(--bg2);cursor:pointer;user-select:none;transition:border-color 0.15s}
.toggle:hover{border-color:var(--accent)}
.toggle input[type=checkbox]{width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;cursor:pointer}
.toggle-txt{font-size:0.83rem;color:var(--muted);line-height:1.4}
.toggle-txt b{color:var(--text);font-weight:500;display:block;font-size:0.85rem}
.btn-main{grid-column:1/-1;font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:16px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;transition:background 0.15s,transform 0.1s,box-shadow 0.2s;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 4px 20px rgba(108,99,255,0.35)}
.btn-main:hover{background:#7c74ff;box-shadow:0 6px 28px rgba(108,99,255,0.5)}
.btn-main:active{transform:scale(0.99)}
.btn-main:disabled{background:var(--muted2);box-shadow:none;cursor:not-allowed}
.btn-main .sp{width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;display:none;flex-shrink:0}
.btn-main.ld .sp{display:block}
.btn-main.ld .bt{opacity:0.55}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── STATUS ── */
.status{display:none;align-items:center;gap:14px;padding:14px 18px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;margin-bottom:24px;font-size:0.78rem;color:var(--muted);animation:fadeUp 0.3s ease}
.status.on{display:flex}
.status-dot{width:7px;height:7px;background:var(--accent);border-radius:50%;animation:blink 1s infinite;flex-shrink:0}
.steps{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.step{font-size:0.58rem;font-weight:500;padding:3px 9px;border-radius:4px;background:var(--bg2);color:var(--muted2);border:1px solid var(--border);transition:all 0.25s;letter-spacing:0.04em}
.step.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.step.done{background:var(--green);color:#0d0d0f;border-color:var(--green)}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ── ERROR ── */
.err{display:none;padding:14px 18px;background:rgba(255,107,107,0.07);border:1px solid rgba(255,107,107,0.25);border-radius:10px;color:var(--accent2);font-size:0.82rem;margin-bottom:24px;line-height:1.6}
.err.on{display:block}

/* ── RESULTS BAR ── */
.rbar{display:none;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:28px;flex-wrap:wrap;gap:14px}
.rbar.on{display:flex}
.rcount{font-family:'Syne',sans-serif;font-size:1.7rem;font-weight:800;color:var(--text);line-height:1}
.rcount em{color:var(--accent);font-style:normal}
.rmeta{font-size:0.68rem;color:var(--muted2);margin-top:5px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.btn-sm{font-size:0.7rem;font-weight:500;padding:8px 16px;border:1px solid var(--border2);background:transparent;color:var(--muted);border-radius:7px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:7px;white-space:nowrap}
.btn-sm:hover{border-color:var(--text);color:var(--text)}
.btn-sm.hi{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-sm.hi:hover{background:#7c74ff;border-color:#7c74ff}

/* ── SUMMARY ── */
.summary{font-size:0.84rem;color:var(--muted);line-height:1.85;padding:16px 20px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;margin-bottom:28px;display:none}
.summary.on{display:block}

/* ── FILTER CHIPS ── */
.fbar{display:none;gap:8px;margin-bottom:24px;flex-wrap:wrap;align-items:center}
.fbar.on{display:flex}
.flabel{font-size:0.62rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2)}
.chip{font-size:0.67rem;font-weight:500;padding:5px 13px;border:1px solid var(--border2);border-radius:20px;background:transparent;color:var(--muted);cursor:pointer;transition:all 0.15s;white-space:nowrap}
.chip:hover{border-color:var(--accent);color:var(--accent)}
.chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}

/* ── CARDS ── */
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px;margin-bottom:40px}
@media(max-width:720px){.cgrid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:border-color 0.2s,box-shadow 0.2s,transform 0.2s;animation:fadeUp 0.4s ease both;display:flex;flex-direction:column}
.card:hover{border-color:var(--accent);box-shadow:var(--shadow-lg);transform:translateY(-3px)}
.card-stripe{height:3px;background:linear-gradient(90deg,var(--accent),#a78bfa);opacity:0;transition:opacity 0.2s}
.card:hover .card-stripe{opacity:1}
.card-main{padding:22px;display:flex;flex-direction:column;gap:14px;flex:1}
.card-header{display:flex;align-items:flex-start;gap:12px}
.ava{width:44px;height:44px;border-radius:10px;background:var(--bg3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:var(--accent);flex-shrink:0;text-transform:uppercase}
.card-title{flex:1;min-width:0}
.cname{font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.cind{font-size:0.65rem;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted2)}
.cscore{text-align:right;flex-shrink:0}
.score-num{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;line-height:1}
.score-lbl{font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2);margin-top:2px}
.cdesc{font-size:0.8rem;color:var(--muted);line-height:1.75;font-weight:300}
.dets{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.det{padding:9px 11px;background:var(--bg2);border-radius:7px;border:1px solid var(--border)}
.det-lbl{font-size:0.55rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:3px}
.det-val{font-size:0.76rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prods{padding:11px 13px;background:var(--bg2);border-radius:7px;border:1px solid var(--border)}
.prods-lbl{font-size:0.55rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2);margin-bottom:8px}
.prods-list{display:flex;flex-wrap:wrap;gap:5px}
.ppill{font-size:0.65rem;font-weight:500;padding:3px 9px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text)}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{font-size:0.6rem;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;background:rgba(108,99,255,0.1);color:var(--accent);border-radius:4px;border:1px solid rgba(108,99,255,0.2)}
.contact-row{display:flex;align-items:center;gap:8px;padding:9px 11px;background:var(--bg2);border-radius:7px;border:1px solid var(--border);flex-wrap:wrap}
.contact-lbl{font-size:0.55rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted2)}
.contact-row a,.contact-row span{font-size:0.72rem;color:var(--accent);text-decoration:none}
.contact-row a:hover{text-decoration:underline}
.card-foot{display:flex;align-items:center;justify-content:space-between;padding:12px 22px;border-top:1px solid var(--border);background:var(--bg2);flex-wrap:wrap;gap:8px}
.clink{font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:5px;transition:gap 0.15s}
.clink:hover{gap:9px}
.csoc{display:flex;gap:7px}
.csoc a{font-size:0.63rem;font-weight:500;color:var(--muted);padding:3px 8px;border:1px solid var(--border2);border-radius:4px;text-decoration:none;transition:all 0.15s}
.csoc a:hover{border-color:var(--accent);color:var(--accent)}
.csrc{font-size:0.58rem;color:var(--muted2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── LOAD MORE ── */
.more{display:none;text-align:center;padding:8px 0 56px}
.more.on{display:block}
.btn-more{font-family:'Syne',sans-serif;font-size:0.85rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:14px 44px;background:transparent;color:var(--text);border:1.5px solid var(--border2);border-radius:10px;cursor:pointer;transition:all 0.2s;display:inline-flex;align-items:center;gap:11px}
.btn-more:hover{border-color:var(--accent);color:var(--accent);box-shadow:0 0 20px var(--accent-glow)}
.btn-more:disabled{opacity:0.35;cursor:not-allowed}
.btn-more .sp{width:15px;height:15px;border:2px solid rgba(255,255,255,0.2);border-top-color:currentColor;border-radius:50%;animation:spin 0.7s linear infinite;display:none}
.btn-more.ld .sp{display:block}
.more-hint{font-size:0.68rem;color:var(--muted2);margin-top:10px}

/* ── SOURCES ── */
.sources{display:none;margin-bottom:48px;padding:24px;background:var(--bg3);border-radius:12px;border:1px solid var(--border)}
.sources.on{display:block}
.src-lbl{font-size:0.6rem;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted2);margin-bottom:12px;display:flex;align-items:center;gap:10px}
.src-lbl::after{content:'';flex:1;height:1px;background:var(--border)}
.src-list{display:flex;flex-wrap:wrap;gap:7px}
.src-pill{font-size:0.63rem;padding:4px 11px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--muted2);text-decoration:none;max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:block;transition:all 0.15s}
.src-pill:hover{border-color:var(--accent);color:var(--accent)}

/* ── FOOTER ── */
footer{border-top:1px solid var(--border);padding:24px 0;text-align:center;font-size:0.67rem;color:var(--muted2);line-height:1.9}
</style>
</head>
<body>

<nav>
  <div class="wrap nav-inner">
    <a class="brand" href="/">
      <div class="brand-icon">
        <svg viewBox="0 0 24 24" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
      </div>
      <span class="brand-name">CompanyScout</span>
    </a>
    <span class="nav-chip">AI Web Intelligence</span>
  </div>
</nav>

<main>
<div class="wrap">

  <!-- HERO -->
  <div class="hero">
    <div class="hero-tag"><span class="hero-tag-dot"></span>Gemini-Powered Discovery</div>
    <h1 class="hero-h1">Find any company<br/>across the <span class="hi">entire web.</span></h1>
    <p class="hero-sub">Describe what you're looking for. Our AI scrapes search engines, crawls websites, and extracts structured business intelligence — instantly.</p>
    <div class="hero-pills">
      <span class="hero-pill">
        <svg viewBox="0 0 24 24" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Live web scraping
      </span>
      <span class="hero-pill">
        <svg viewBox="0 0 24 24" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Up to 50 companies
      </span>
      <span class="hero-pill">
        <svg viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        CSV & JSON export
      </span>
      <span class="hero-pill">
        <svg viewBox="0 0 24 24" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Find next batch
      </span>
    </div>
  </div>

  <!-- SEARCH PANEL -->
  <div class="panel">
    <div class="panel-head">Configure Search</div>
    <div class="grid2">
      <div class="field full">
        <span class="label">What companies are you looking for?</span>
        <input id="query" type="text" placeholder="e.g. AI healthcare startups in India, SaaS fintech in Europe, B2B logistics software..." autocomplete="off"/>
        <span class="hint">Be specific — include industry, geography, stage, or technology for best results</span>
      </div>
      <div class="field full">
        <span class="label">Gemini API Key</span>
        <input id="apiKey" type="password" placeholder="AIza..." autocomplete="off"/>
        <span class="hint">Get your free key at aistudio.google.com — never stored on our servers</span>
      </div>
      <div class="field">
        <span class="label">Max Companies</span>
        <select id="maxResults">
          <option value="10">10 companies</option>
          <option value="20" selected>20 companies</option>
          <option value="30">30 companies</option>
          <option value="50">50 companies</option>
        </select>
      </div>
      <div class="field">
        <span class="label">Scan Depth</span>
        <label class="toggle">
          <input type="checkbox" id="deepScrape"/>
          <span class="toggle-txt"><b>Deep Scan</b>Crawl more pages, richer results (slower)</span>
        </label>
      </div>
      <button class="btn-main full" id="searchBtn" onclick="runSearch(false)">
        <div class="sp"></div>
        <span class="bt">Discover Companies →</span>
      </button>
    </div>
  </div>

  <!-- STATUS -->
  <div class="status" id="statusBar">
    <div class="status-dot"></div>
    <span id="statusTxt">Starting…</span>
    <div class="steps">
      <span class="step" id="s0">Queries</span>
      <span class="step" id="s1">Search</span>
      <span class="step" id="s2">Scrape</span>
      <span class="step" id="s3">AI</span>
      <span class="step" id="s4">Rank</span>
    </div>
  </div>

  <!-- ERROR -->
  <div class="err" id="errBox"></div>

  <!-- RESULTS BAR -->
  <div class="rbar" id="rbar">
    <div>
      <div class="rcount" id="rcount"><em>0</em> Companies Found</div>
      <div class="rmeta" id="rmeta"></div>
    </div>
    <div class="actions">
      <button class="btn-sm" onclick="expCSV()" id="btnCSV" style="display:none">↓ CSV</button>
      <button class="btn-sm" onclick="expJSON()" id="btnJSON" style="display:none">↓ JSON</button>
      <button class="btn-sm hi" onclick="runSearch(true)" id="btnNext" style="display:none">⟳ Find Next Batch</button>
    </div>
  </div>

  <!-- SUMMARY -->
  <div class="summary" id="summ"></div>

  <!-- FILTER BAR -->
  <div class="fbar" id="fbar"></div>

  <!-- CARDS -->
  <div class="cgrid" id="cgrid"></div>

  <!-- LOAD MORE -->
  <div class="more" id="moreSection">
    <button class="btn-more" id="moreBtn" onclick="runSearch(true)">
      <div class="sp"></div>
      <span>Find Next Companies →</span>
    </button>
    <div class="more-hint">Continues search with new queries to discover additional companies</div>
  </div>

  <!-- SOURCES -->
  <div class="sources" id="srcSection">
    <div class="src-lbl">Pages Scraped</div>
    <div class="src-list" id="srcList"></div>
  </div>

</div>
</main>

<footer>
  <div class="wrap">
    CompanyScout &mdash; API keys are never stored or logged &mdash; Built with Express, Cheerio &amp; Google Gemini
  </div>
</footer>

<script>
let allCos=[],curQuery='',isNext=false,offset=0;
const stepData=[[0,'Generating smart search queries…'],[1,'Searching the web with DuckDuckGo…'],[2,'Crawling company websites…'],[3,'Extracting company data with Gemini…'],[4,'Ranking by relevance…']];
let stepIdx=0,stepTmr=null;

function startSteps(){
  stepIdx=0;stepTmr=setInterval(()=>{
    const[i,msg]=stepData[stepIdx%stepData.length];
    document.getElementById('statusTxt').textContent=msg;
    for(let j=0;j<5;j++){
      const el=document.getElementById('s'+j);
      el.classList.remove('on','done');
      if(j<i)el.classList.add('done');
      if(j===i)el.classList.add('on');
    }
    stepIdx++;
  },2600);
}
function stopSteps(){clearInterval(stepTmr);for(let j=0;j<5;j++)document.getElementById('s'+j).classList.add('done')}

async function runSearch(next=false){
  const query=document.getElementById('query').value.trim();
  const apiKey=document.getElementById('apiKey').value.trim();
  const maxResults=parseInt(document.getElementById('maxResults').value);
  const deepScrape=document.getElementById('deepScrape').checked;
  if(!query){showErr('Please enter a search query.');return}
  if(!apiKey){showErr('Please enter your Gemini API key (get it free at aistudio.google.com).');return}
  isNext=next;curQuery=query;
  hideErr();showStatus(true);
  if(next){setMoreLoading(true);offset+=allCos.length||0}
  else{offset=0;allCos=[];setLoading(true);clearResults()}
  startSteps();
  try{
    const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,apiKey,maxResults,deepScrape,offset})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Search failed');
    const newCos=d.companies||[];
    allCos=next?[...allCos,...newCos]:newCos;
    next?appendCards(newCos,allCos.length-newCos.length):renderAll(d);
    updateBar(allCos.length,d);
  }catch(e){showErr(e.message)}
  finally{stopSteps();showStatus(false);setLoading(false);setMoreLoading(false)}
}

function renderAll(d){
  const cos=d.companies||[];
  document.getElementById('rbar').classList.add('on');
  if(d.summary){const s=document.getElementById('summ');s.textContent=d.summary;s.classList.add('on')}
  buildFilters(cos);
  const g=document.getElementById('cgrid');
  cos.forEach((c,i)=>g.appendChild(mkCard(c,i)));
  if(d.searchedUrls?.length){
    document.getElementById('srcSection').classList.add('on');
    const sl=document.getElementById('srcList');
    d.searchedUrls.slice(0,24).forEach(u=>{
      const a=document.createElement('a');a.className='src-pill';a.href=u;a.target='_blank';a.rel='noopener';
      try{a.textContent=new URL(u).hostname}catch{a.textContent=u}
      sl.appendChild(a);
    });
  }
  if(cos.length>0){
    ['btnCSV','btnJSON','btnNext'].forEach(id=>document.getElementById(id).style.display='flex');
    document.getElementById('moreSection').classList.add('on');
  }
}

function appendCards(newCos,startIdx){
  const g=document.getElementById('cgrid');
  newCos.forEach((c,i)=>g.appendChild(mkCard(c,startIdx+i)));
  document.getElementById('moreSection').classList.add('on');
}

function updateBar(count,d){
  document.getElementById('rcount').innerHTML='<em>'+count+'</em> Compan'+(count===1?'y':'ies')+' Found';
  document.getElementById('rmeta').textContent=(d.meta?.pagesScraped||0)+' pages scraped · '+(d.meta?.queriesUsed||[]).length+' queries'+(isNext?' · expanded':'');
}

function buildFilters(cos){
  const inds=[...new Set(cos.map(c=>c.industry).filter(Boolean))];
  const bar=document.getElementById('fbar');
  bar.innerHTML='<span class="flabel">Filter:</span><span class="chip on" onclick="filt(\'all\',this)">All</span>';
  inds.slice(0,8).forEach(ind=>{
    const s=document.createElement('span');s.className='chip';s.textContent=ind;
    s.onclick=()=>filt(ind,s);bar.appendChild(s);
  });
  bar.classList.add('on');
}

function filt(ind,el){
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  document.querySelectorAll('.card').forEach(c=>{
    c.style.display=(ind==='all'||c.dataset.ind===ind)?'':'none';
  });
}

function mkCard(c,idx){
  const card=document.createElement('div');
  card.className='card';card.dataset.ind=c.industry||'';
  card.style.animationDelay=Math.min(idx,12)*50+'ms';
  const score=c.relevanceScore||0;
  const sc=score>=80?'#3ecf8e':score>=60?'#6c63ff':'#888794';
  const init=(c.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const site=c.website||c.source||'#';
  const dets=[];
  if(c.founded)dets.push({l:'Founded',v:c.founded});
  if(c.location)dets.push({l:'Location',v:c.location});
  if(c.size)dets.push({l:'Size',v:c.size});
  if(c.funding)dets.push({l:'Funding',v:c.funding});
  const dHTML=dets.length?'<div class="dets">'+dets.map(d=>'<div class="det"><div class="det-lbl">'+e(d.l)+'</div><div class="det-val" title="'+e(d.v)+'">'+e(d.v)+'</div></div>').join('')+'</div>':'';
  const pHTML=c.keyProducts?.length?'<div class="prods"><div class="prods-lbl">Key Products</div><div class="prods-list">'+c.keyProducts.slice(0,5).map(p=>'<span class="ppill">'+e(p)+'</span>').join('')+'</div></div>':'';
  const tHTML=c.tags?.length?'<div class="tags">'+c.tags.slice(0,6).map(t=>'<span class="tag">'+e(t)+'</span>').join('')+'</div>':'';
  const ctHTML=c.contactEmail?'<div class="contact-row"><span class="contact-lbl">Contact</span><a href="mailto:'+e(c.contactEmail)+'">'+e(c.contactEmail)+'</a></div>':'';
  let soc='';
  if(c.socialLinks?.linkedin)soc+='<a href="'+e(c.socialLinks.linkedin)+'" target="_blank" rel="noopener">LinkedIn ↗</a>';
  if(c.socialLinks?.twitter)soc+='<a href="'+e(c.socialLinks.twitter)+'" target="_blank" rel="noopener">Twitter ↗</a>';
  let srcDomain='';try{srcDomain=new URL(c.source||site).hostname}catch{}
  card.innerHTML='<div class="card-stripe"></div><div class="card-main"><div class="card-header"><div class="ava">'+init+'</div><div class="card-title"><div class="cname" title="'+e(c.name)+'">'+e(c.name)+'</div><div class="cind">'+e(c.industry||'Technology')+'</div></div><div class="cscore"><div class="score-num" style="color:'+sc+'">'+score+'%</div><div class="score-lbl">match</div></div></div><div class="cdesc">'+e(c.description||'')+'</div>'+dHTML+pHTML+tHTML+ctHTML+'</div><div class="card-foot"><a class="clink" href="'+e(site)+'" target="_blank" rel="noopener">Visit Site →</a><div class="csoc">'+soc+'</div>'+(srcDomain?'<span class="csrc" title="'+e(c.source||site)+'">'+srcDomain+'</span>':'')+'</div>';
  return card;
}

function e(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function expJSON(){
  const b=new Blob([JSON.stringify({query:curQuery,total:allCos.length,companies:allCos},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='companyscout-'+Date.now()+'.json';a.click();
}
function expCSV(){
  const hdr=['Name','Website','Industry','Founded','Location','Size','Funding','Description','Tags','Score','LinkedIn','Twitter','Email'];
  const rows=allCos.map(c=>[c.name,c.website,c.industry,c.founded,c.location,c.size,c.funding,c.description,(c.tags||[]).join('; '),c.relevanceScore,c.socialLinks?.linkedin||'',c.socialLinks?.twitter||'',c.contactEmail||''].map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(','));
  const b=new Blob([[hdr.join(','),...rows].join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='companyscout-'+Date.now()+'.csv';a.click();
}

function clearResults(){
  document.getElementById('cgrid').innerHTML='';
  document.getElementById('srcList').innerHTML='';
  document.getElementById('fbar').innerHTML='';
  ['rbar','summ','fbar','srcSection','moreSection'].forEach(id=>document.getElementById(id).classList.remove('on'));
  ['btnCSV','btnJSON','btnNext'].forEach(id=>document.getElementById(id).style.display='none');
  allCos=[];
}
function showStatus(v){document.getElementById('statusBar').classList.toggle('on',v)}
function setLoading(v){const b=document.getElementById('searchBtn');b.disabled=v;b.classList.toggle('ld',v)}
function setMoreLoading(v){const b=document.getElementById('moreBtn');b.disabled=v;b.classList.toggle('ld',v);const b2=document.getElementById('btnNext');if(b2)b2.disabled=v}
function showErr(m){const e=document.getElementById('errBox');e.innerHTML='<b>Error:</b> '+m;e.classList.add('on')}
function hideErr(){document.getElementById('errBox').classList.remove('on')}
document.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&(ev.target.id==='query'||ev.target.id==='apiKey'))runSearch(false)});
</script>
</body>
</html>`;

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date() }));
app.get("/", (_, res) => res.setHeader("Content-Type","text/html").send(HTML));
app.get(/^(?!\/api).*$/, (_, res) => res.setHeader("Content-Type","text/html").send(HTML));

app.post("/api/search", async (req, res) => {
  const { query, apiKey, maxResults = 20, deepScrape = false, offset = 0 } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Query is required." });
  if (!apiKey?.trim()) return res.status(400).json({ error: "Gemini API key is required." });
  if (query.length > 300) return res.status(400).json({ error: "Query too long." });

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Step 1: Generate search queries
    const queryResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text:
        `Generate 4 diverse web search queries to find companies matching: "${query}".
${offset > 0 ? `This is search batch #${Math.floor(offset/maxResults)+2} — generate DIFFERENT queries to find NEW companies.` : ''}
Return ONLY valid JSON, no markdown: {"queries":["q1","q2","q3","q4"]}`
      }]}],
      generationConfig: { temperature: 0.6, maxOutputTokens: 400 }
    });
    let queries = [];
    try {
      const raw = queryResult.response.text().replace(/```json|```/g,"").trim();
      queries = JSON.parse(raw).queries || [];
    } catch { queries = []; }

    const searchQueries = [query, ...queries].slice(0, 5);

    // Step 2: Search DuckDuckGo
    const searchLimit = deepScrape ? 8 : 5;
    const allResults = [];
    for (const q of searchQueries) {
      const r = await searchDDG(q, searchLimit);
      allResults.push(...r);
    }

    // Deduplicate by hostname
    const seen = new Set();
    const unique = allResults.filter(r => {
      try { const h = new URL(r.url).hostname; if (seen.has(h)) return false; seen.add(h); return true; }
      catch { return false; }
    });

    const top = unique.slice(0, deepScrape ? 20 : 14);

    // Step 3: Scrape pages
    const pages = await Promise.all(top.map(r => scrapePage(r.url)));
    const enriched = pages.map((p, i) => p || { text: top[i].snippet||"", title: top[i].title||"", description: top[i].snippet||"", url: top[i].url });

    // Step 4: Extract with Gemini
    const result = await extractWithGemini(model, enriched, query, maxResults, offset);
    result.totalFound = result.companies?.length || 0;
    if (result.companies) result.companies.sort((a,b) => (b.relevanceScore||0)-(a.relevanceScore||0));

    return res.json({
      success: true, query, ...result,
      searchedUrls: top.map(r => r.url),
      meta: { queriesUsed: searchQueries, pagesScraped: enriched.filter(Boolean).length, deepScrape, offset }
    });

  } catch (err) {
    console.error("Search error:", err.message);
    if (err.message?.includes("API_KEY_INVALID") || err.message?.includes("API key")) return res.status(401).json({ error: "Invalid Gemini API key. Get one free at aistudio.google.com" });
    if (err.message?.includes("quota") || err.message?.includes("429")) return res.status(429).json({ error: "Gemini rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function searchDDG(query, maxResults = 8) {
  try {
    const { data } = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
      timeout: 12000,
    });
    const $ = cheerio.load(data);
    const results = [];
    $(".result__body").each((_, el) => {
      const title = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      const href = $(el).find(".result__url").attr("href") || $(el).find("a.result__url").text().trim();
      const link = $(el).find("a.result__a").attr("href");
      if (title && (link || href)) results.push({ title, snippet, url: link || `https://${href}` });
      if (results.length >= maxResults) return false;
    });
    return results;
  } catch (e) { console.error("DDG:", e.message); return []; }
}

async function scrapePage(url, maxLen = 5000) {
  try {
    const { data } = await axios.get(url, {
      timeout: 9000, headers: { "User-Agent": "Mozilla/5.0 (compatible; CompanyScoutBot/2.0)", Accept: "text/html" }, maxRedirects: 5,
    });
    const $ = cheerio.load(data);
    $("script,style,nav,footer,header,aside,noscript,svg,.cookie,.popup,.modal,.banner").remove();
    return { text: $("body").text().replace(/\s+/g," ").trim().slice(0,maxLen), title: $("title").text().trim(), description: $('meta[name="description"]').attr("content")||"", url };
  } catch { return null; }
}

async function extractWithGemini(model, pages, query, maxResults, offset) {
  const context = pages.filter(Boolean)
    .map((p,i) => `--- Source ${i+1}: ${p.url} ---\nTitle: ${p.title}\nMeta: ${p.description}\n${p.text}`)
    .join("\n\n").slice(0, 28000);

  const prompt = `You are a business intelligence analyst. Extract ALL companies from the content below that match: "${query}".
${offset > 0 ? `This is a follow-up search — prioritize finding DIFFERENT companies not in the first batch.` : ''}

Return ONLY valid JSON (no markdown, no backticks):
{
  "companies": [{
    "name": "Company Name",
    "website": "https://...",
    "description": "3-4 sentence detailed description of what the company does, who they serve, and what makes them notable",
    "industry": "Specific sector",
    "founded": "YYYY or null",
    "location": "City, Country or null",
    "size": "Startup/SMB/Mid-size/Enterprise or null",
    "funding": "Funding stage or amount or null",
    "keyProducts": ["Product 1","Product 2"],
    "tags": ["tag1","tag2","tag3"],
    "relevanceScore": 88,
    "contactEmail": "email or null",
    "socialLinks": {"linkedin": "URL or null","twitter": "URL or null"},
    "source": "source URL"
  }],
  "summary": "3 sentence summary of findings and key trends observed",
  "totalFound": 0
}

Rules: Max ${Math.min(maxResults,20)} companies. Only REAL verifiable companies. relevanceScore 0-100. Detailed 3-4 sentence descriptions. Return ONLY JSON.

CONTENT:
${context}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
  });

  const raw = result.response.text().replace(/```json|```/g,"").trim();
  return JSON.parse(raw);
}

app.listen(PORT, "0.0.0.0", () => console.log(`🚀 CompanyScout v2 on http://0.0.0.0:${PORT}`));
