import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
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

// ── HTML ───────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>CompanyScout — AI-Powered Company Discovery</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;1,300&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#0a0a0f;--paper:#f5f2eb;--paper2:#ede9df;--paper3:#e5e0d5;
  --accent:#c84b2f;--accent2:#3a5f8a;--muted:#7a7568;--border:#d4cfc4;
  --card:#ffffff;--green:#2d6a4f;--tag-bg:#eae7de;--radius:6px;
  --shadow:0 2px 20px rgba(10,10,15,0.07),0 1px 4px rgba(10,10,15,0.05);
  --shadow-lg:0 12px 48px rgba(10,10,15,0.13),0 3px 10px rgba(10,10,15,0.07);
}
html{font-size:16px;scroll-behavior:smooth}
body{font-family:'DM Mono',monospace;background:var(--paper);color:var(--ink);min-height:100vh;overflow-x:hidden}
.container{max-width:1200px;margin:0 auto;padding:0 40px}
@media(max-width:768px){.container{padding:0 20px}}

/* ── HEADER ── */
header{border-bottom:1.5px solid var(--border);padding:22px 0;position:sticky;top:0;z-index:200;background:rgba(245,242,235,0.95);backdrop-filter:blur(16px)}
.header-inner{display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;letter-spacing:-0.04em;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:12px}
.logo-dot{width:12px;height:12px;border-radius:50%;background:var(--accent);flex-shrink:0}
.logo-text{display:flex;flex-direction:column;line-height:1}
.logo-sub{font-family:'DM Mono',monospace;font-weight:300;font-size:0.6rem;color:var(--muted);letter-spacing:0.14em;text-transform:uppercase;margin-top:4px}
.badge{font-family:'DM Mono',monospace;font-size:0.62rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);border:1.5px solid var(--accent);padding:5px 12px;border-radius:3px;white-space:nowrap}

/* ── HERO ── */
.hero{padding:96px 0 72px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-60px;right:-100px;width:600px;height:600px;background:radial-gradient(ellipse,rgba(200,75,47,0.07) 0%,transparent 65%);pointer-events:none}
.hero::after{content:'';position:absolute;bottom:-40px;left:-60px;width:400px;height:400px;background:radial-gradient(ellipse,rgba(58,95,138,0.05) 0%,transparent 65%);pointer-events:none}
.hero-eyebrow{font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--accent);margin-bottom:20px;font-weight:400;display:flex;align-items:center;gap:10px}
.hero-eyebrow::before{content:'//';opacity:0.45}
.hero-title{font-family:'Syne',sans-serif;font-size:clamp(3rem,5.5vw,5rem);font-weight:800;line-height:1.02;letter-spacing:-0.04em;color:var(--ink);max-width:760px;margin-bottom:28px}
.hero-title em{font-family:'Instrument Serif',serif;font-style:italic;color:var(--accent);font-weight:400}
.hero-desc{font-size:0.92rem;color:var(--muted);max-width:540px;line-height:1.85;font-weight:300}
.hero-stats{display:flex;gap:40px;margin-top:48px;flex-wrap:wrap}
.hero-stat{display:flex;flex-direction:column;gap:4px}
.hero-stat-num{font-family:'Syne',sans-serif;font-size:1.8rem;font-weight:800;color:var(--ink);line-height:1}
.hero-stat-label{font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted)}

/* ── SEARCH PANEL ── */
.search-panel{background:var(--card);border:1.5px solid var(--border);border-radius:10px;padding:40px;box-shadow:var(--shadow);margin-bottom:60px}
.search-panel-title{font-family:'Syne',sans-serif;font-size:0.75rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-bottom:28px;display:flex;align-items:center;gap:10px}
.search-panel-title::after{content:'';flex:1;height:1px;background:var(--border)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:680px){.form-grid{grid-template-columns:1fr}}
.field{display:flex;flex-direction:column;gap:8px}
.field.full{grid-column:1/-1}
.field-label{font-size:0.64rem;letter-spacing:0.13em;text-transform:uppercase;color:var(--muted);font-weight:400}
.field-hint{font-size:0.62rem;color:var(--muted);opacity:0.7;margin-top:4px}
input,select{font-family:'DM Mono',monospace;font-size:0.87rem;padding:13px 16px;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--paper);color:var(--ink);outline:none;transition:border-color 0.15s,box-shadow 0.15s;width:100%}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(200,75,47,0.07)}
input::placeholder{color:var(--muted);opacity:0.5}
.toggle-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--paper);cursor:pointer;user-select:none;transition:border-color 0.15s,background 0.15s}
.toggle-row:hover{border-color:var(--accent);background:rgba(200,75,47,0.02)}
.toggle-row input[type="checkbox"]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0}
.toggle-label{font-size:0.83rem;color:var(--muted);line-height:1.4}
.toggle-label strong{color:var(--ink);display:block;margin-bottom:1px}
.btn-search{grid-column:1/-1;font-family:'Syne',sans-serif;font-size:0.95rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:18px 36px;background:var(--ink);color:var(--paper);border:none;border-radius:var(--radius);cursor:pointer;transition:background 0.15s,transform 0.1s,box-shadow 0.15s;display:flex;align-items:center;justify-content:center;gap:12px}
.btn-search:hover{background:var(--accent);box-shadow:0 4px 20px rgba(200,75,47,0.3)}
.btn-search:active{transform:scale(0.99)}
.btn-search:disabled{opacity:0.45;cursor:not-allowed;transform:none;box-shadow:none}
.btn-search .spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite;display:none}
.btn-search.loading .spinner{display:block}
.btn-search.loading .btn-text{opacity:0.6}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── STATUS ── */
.status-bar{display:none;align-items:center;gap:14px;padding:16px 20px;background:var(--paper2);border:1.5px solid var(--border);border-radius:var(--radius);margin-bottom:28px;font-size:0.8rem;color:var(--muted);animation:fadeUp 0.3s ease}
.status-bar.show{display:flex}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 1.2s infinite;flex-shrink:0}
.status-steps{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.step-pill{font-size:0.6rem;padding:3px 8px;border-radius:2px;background:var(--paper3);color:var(--muted);border:1px solid var(--border);transition:all 0.3s}
.step-pill.active{background:var(--accent);color:white;border-color:var(--accent)}
.step-pill.done{background:var(--green);color:white;border-color:var(--green)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* ── ERROR ── */
.error-box{display:none;padding:18px 22px;background:rgba(200,75,47,0.05);border:1.5px solid rgba(200,75,47,0.25);border-radius:var(--radius);color:var(--accent);font-size:0.83rem;margin-bottom:28px;animation:fadeUp 0.3s ease;line-height:1.6}
.error-box.show{display:block}

/* ── RESULTS HEADER ── */
.results-header{display:none;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px;padding-bottom:24px;border-bottom:1.5px solid var(--border)}
.results-header.show{display:flex}
.results-left{}
.results-count{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;color:var(--ink);line-height:1}
.results-count span{color:var(--accent)}
.results-meta{font-size:0.7rem;color:var(--muted);margin-top:6px}
.results-actions{display:flex;gap:10px;flex-wrap:wrap}
.btn-action{font-family:'DM Mono',monospace;font-size:0.72rem;padding:9px 18px;border:1.5px solid var(--border);background:transparent;color:var(--muted);border-radius:var(--radius);cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:7px;white-space:nowrap}
.btn-action:hover{border-color:var(--ink);color:var(--ink)}
.btn-action.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.btn-action.primary:hover{background:var(--accent);border-color:var(--accent)}

/* ── SUMMARY ── */
.results-summary{font-size:0.85rem;color:var(--muted);line-height:1.8;padding:18px 22px;background:var(--paper2);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;margin-bottom:36px;display:none}
.results-summary.show{display:block}

/* ── FILTERS ── */
.filters-bar{display:none;align-items:center;gap:10px;margin-bottom:28px;flex-wrap:wrap}
.filters-bar.show{display:flex}
.filter-label{font-size:0.64rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-right:4px}
.filter-chip{font-size:0.68rem;padding:5px 12px;border:1.5px solid var(--border);border-radius:20px;background:transparent;color:var(--muted);cursor:pointer;transition:all 0.15s;white-space:nowrap}
.filter-chip:hover,.filter-chip.active{border-color:var(--accent);color:var(--accent);background:rgba(200,75,47,0.05)}
.filter-chip.all.active{border-color:var(--ink);color:var(--ink);background:var(--ink);color:var(--paper)}

/* ── CARDS GRID ── */
.cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:24px;margin-bottom:48px}
@media(max-width:800px){.cards-grid{grid-template-columns:1fr}}

.company-card{background:var(--card);border:1.5px solid var(--border);border-radius:10px;box-shadow:var(--shadow);transition:border-color 0.2s,box-shadow 0.2s,transform 0.2s;animation:fadeUp 0.45s ease both;display:flex;flex-direction:column;overflow:hidden;cursor:pointer}
.company-card:hover{border-color:var(--accent);box-shadow:var(--shadow-lg);transform:translateY(-3px)}
.card-accent-bar{height:4px;background:linear-gradient(90deg,var(--accent),var(--accent2));opacity:0;transition:opacity 0.2s}
.company-card:hover .card-accent-bar{opacity:1}
.card-body{padding:26px;display:flex;flex-direction:column;gap:16px;flex:1}
.card-top{display:flex;align-items:flex-start;gap:14px}
.card-avatar{width:46px;height:46px;border-radius:8px;background:var(--paper2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:1.1rem;color:var(--accent);flex-shrink:0;text-transform:uppercase;overflow:hidden}
.card-title-wrap{flex:1;min-width:0}
.card-name{font-family:'Syne',sans-serif;font-size:1.08rem;font-weight:700;color:var(--ink);line-height:1.2;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-industry{font-size:0.67rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)}
.card-score-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}
.card-score{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;line-height:1}
.card-score-label{font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)}

.card-desc{font-size:0.82rem;color:var(--muted);line-height:1.75;font-weight:300}

.card-details{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.card-detail{display:flex;flex-direction:column;gap:3px;padding:10px 12px;background:var(--paper);border-radius:5px;border:1px solid var(--border)}
.card-detail-label{font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);font-weight:400}
.card-detail-value{font-size:0.78rem;color:var(--ink);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.card-products{padding:12px 14px;background:var(--paper2);border-radius:5px}
.card-products-label{font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.card-products-list{display:flex;flex-wrap:wrap;gap:5px}
.product-pill{font-size:0.68rem;padding:3px 10px;background:var(--card);border:1px solid var(--border);border-radius:3px;color:var(--ink)}

.card-tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{font-size:0.62rem;letter-spacing:0.07em;text-transform:uppercase;padding:3px 9px;background:var(--tag-bg);color:var(--muted);border-radius:3px;border:1px solid var(--border)}

.card-contact{display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px;background:var(--paper2);border-radius:5px;align-items:center}
.card-contact-label{font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-right:4px}
.card-contact a,.card-contact span{font-size:0.72rem;color:var(--accent2);text-decoration:none}
.card-contact a:hover{text-decoration:underline}

.card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 26px;border-top:1px solid var(--border);background:var(--paper);flex-wrap:wrap;gap:8px}
.card-link{font-family:'Syne',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:5px;transition:gap 0.15s}
.card-link:hover{gap:8px}
.card-socials{display:flex;gap:10px}
.card-socials a{font-size:0.65rem;color:var(--muted);text-decoration:none;padding:3px 8px;border:1px solid var(--border);border-radius:3px;transition:all 0.15s}
.card-socials a:hover{border-color:var(--accent2);color:var(--accent2)}
.card-source{font-size:0.6rem;color:var(--muted);opacity:0.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}

/* ── LOAD MORE ── */
.load-more-section{display:none;text-align:center;margin-bottom:60px}
.load-more-section.show{display:block}
.btn-load-more{font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:16px 48px;background:transparent;color:var(--ink);border:2px solid var(--ink);border-radius:var(--radius);cursor:pointer;transition:all 0.2s;display:inline-flex;align-items:center;gap:12px}
.btn-load-more:hover{background:var(--ink);color:var(--paper);box-shadow:0 4px 20px rgba(10,10,15,0.15)}
.btn-load-more:disabled{opacity:0.4;cursor:not-allowed}
.btn-load-more .spinner{width:16px;height:16px;border:2px solid rgba(0,0,0,0.2);border-top-color:currentColor;border-radius:50%;animation:spin 0.7s linear infinite;display:none}
.btn-load-more.loading .spinner{display:block}
.load-more-hint{font-size:0.7rem;color:var(--muted);margin-top:12px}

/* ── SOURCES ── */
.sources-section{display:none;margin-bottom:60px;padding:28px;background:var(--paper2);border-radius:10px;border:1px solid var(--border)}
.sources-section.show{display:block}
.sources-title{font-size:0.64rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;display:flex;align-items:center;gap:10px}
.sources-title::after{content:'';flex:1;height:1px;background:var(--border)}
.sources-list{display:flex;flex-wrap:wrap;gap:7px}
.source-pill{font-size:0.65rem;padding:5px 11px;background:var(--card);border:1px solid var(--border);border-radius:3px;color:var(--muted);text-decoration:none;max-width:220px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:block;transition:all 0.15s}
.source-pill:hover{border-color:var(--accent2);color:var(--accent2)}

/* ── FOOTER ── */
footer{border-top:1.5px solid var(--border);padding:28px 0;text-align:center;font-size:0.7rem;color:var(--muted);letter-spacing:0.04em;line-height:1.8}
</style>
</head>
<body>

<header>
  <div class="container header-inner">
    <a class="logo" href="/">
      <span class="logo-dot"></span>
      <div class="logo-text">CompanyScout<span class="logo-sub">AI Web Intelligence</span></div>
    </a>
    <span class="badge">Powered by OpenAI</span>
  </div>
</header>

<main>
<div class="container">

  <!-- HERO -->
  <div class="hero">
    <p class="hero-eyebrow">Company Discovery Engine</p>
    <h1 class="hero-title">Find any company<br/>across the <em>entire</em> web.</h1>
    <p class="hero-desc">Describe the companies you're looking for. Our AI scrapes search engines, crawls websites, and extracts structured business intelligence — instantly.</p>
    <div class="hero-stats">
      <div class="hero-stat"><span class="hero-stat-num">50+</span><span class="hero-stat-label">Companies per Search</span></div>
      <div class="hero-stat"><span class="hero-stat-num">GPT-4o</span><span class="hero-stat-label">AI Extraction</span></div>
      <div class="hero-stat"><span class="hero-stat-num">Live</span><span class="hero-stat-label">Web Scraping</span></div>
    </div>
  </div>

  <!-- SEARCH PANEL -->
  <div class="search-panel">
    <div class="search-panel-title">Configure Search</div>
    <div class="form-grid">

      <div class="field full">
        <span class="field-label">What companies are you looking for?</span>
        <input id="query" type="text" placeholder="e.g. AI healthcare startups in India, SaaS fintech companies in Europe, B2B logistics software..." autocomplete="off"/>
        <span class="field-hint">Be specific — include industry, location, stage, or technology for best results</span>
      </div>

      <div class="field full">
        <span class="field-label">OpenAI API Key</span>
        <input id="apiKey" type="password" placeholder="sk-..." autocomplete="off"/>
        <span class="field-hint">Never stored — used per-request only</span>
      </div>

      <div class="field">
        <span class="field-label">Max Companies to Return</span>
        <select id="maxResults">
          <option value="10">10 companies</option>
          <option value="20" selected>20 companies</option>
          <option value="30">30 companies</option>
          <option value="50">50 companies</option>
        </select>
      </div>

      <div class="field">
        <span class="field-label">Scan Mode</span>
        <label class="toggle-row">
          <input type="checkbox" id="deepScrape"/>
          <span class="toggle-label"><strong>Deep Scan</strong>Crawl more pages for richer results</span>
        </label>
      </div>

      <button class="btn-search" id="searchBtn" onclick="runSearch(false)">
        <div class="spinner"></div>
        <span class="btn-text">Discover Companies →</span>
      </button>
    </div>
  </div>

  <!-- STATUS -->
  <div class="status-bar" id="statusBar">
    <div class="status-dot"></div>
    <span id="statusText">Starting search…</span>
    <div class="status-steps">
      <span class="step-pill" id="step0">Queries</span>
      <span class="step-pill" id="step1">Search</span>
      <span class="step-pill" id="step2">Scraping</span>
      <span class="step-pill" id="step3">AI Extract</span>
      <span class="step-pill" id="step4">Ranking</span>
    </div>
  </div>

  <!-- ERROR -->
  <div class="error-box" id="errorBox"></div>

  <!-- RESULTS HEADER -->
  <div class="results-header" id="resultsHeader">
    <div class="results-left">
      <div class="results-count" id="resultsCount"><span>0</span> Companies Found</div>
      <div class="results-meta" id="resultsMeta"></div>
    </div>
    <div class="results-actions">
      <button class="btn-action" onclick="exportCSV()" id="exportCSVBtn" style="display:none">↓ CSV</button>
      <button class="btn-action" onclick="exportJSON()" id="exportJSONBtn" style="display:none">↓ JSON</button>
      <button class="btn-action primary" onclick="runSearch(true)" id="findNextBtn" style="display:none">⟳ Find Next Companies</button>
    </div>
  </div>

  <!-- SUMMARY -->
  <div class="results-summary" id="resultsSummary"></div>

  <!-- FILTERS -->
  <div class="filters-bar" id="filtersBar">
    <span class="filter-label">Filter:</span>
    <span class="filter-chip all active" onclick="filterCards('all',this)">All</span>
  </div>

  <!-- CARDS -->
  <div class="cards-grid" id="cardsGrid"></div>

  <!-- LOAD MORE -->
  <div class="load-more-section" id="loadMoreSection">
    <button class="btn-load-more" id="loadMoreBtn" onclick="runSearch(true)">
      <div class="spinner"></div>
      <span>Find Next Companies →</span>
    </button>
    <div class="load-more-hint" id="loadMoreHint"></div>
  </div>

  <!-- SOURCES -->
  <div class="sources-section" id="sourcesSection">
    <div class="sources-title">Sources Scraped</div>
    <div class="sources-list" id="sourcesList"></div>
  </div>

</div>
</main>

<footer>
  <div class="container">
    CompanyScout &mdash; Your API key is never stored or logged. All processing happens per-request and is discarded immediately.<br/>
    Built with Express, Cheerio, DuckDuckGo Search &amp; OpenAI GPT-4o.
  </div>
</footer>

<script>
let lastResult = null;
let searchOffset = 0;
let allCompanies = [];
let currentQuery = '';
let currentApiKey = '';
let isNextSearch = false;

const stepMessages = [
  [0,'Generating smart search queries with AI…'],
  [1,'Scraping DuckDuckGo for relevant results…'],
  [2,'Crawling company websites…'],
  [3,'Extracting structured data with GPT-4o…'],
  [4,'Ranking companies by relevance…'],
];
let stepTimer = null;
let stepIdx = 0;

function startSteps() {
  stepIdx = 0;
  stepTimer = setInterval(() => {
    const [idx, msg] = stepMessages[stepIdx % stepMessages.length];
    document.getElementById('statusText').textContent = msg;
    document.querySelectorAll('.step-pill').forEach((p,i) => {
      p.classList.remove('active','done');
      if(i < idx) p.classList.add('done');
      if(i === idx) p.classList.add('active');
    });
    stepIdx++;
  }, 2800);
}
function stopSteps() { clearInterval(stepTimer); document.querySelectorAll('.step-pill').forEach(p=>p.classList.add('done')); }

async function runSearch(isNext = false) {
  const query = document.getElementById('query').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const maxResults = parseInt(document.getElementById('maxResults').value);
  const deepScrape = document.getElementById('deepScrape').checked;

  if (!query) { showError('Please enter a search query.'); return; }
  if (!apiKey) { showError('Please enter your OpenAI API key.'); return; }

  isNextSearch = isNext;
  currentQuery = query;
  currentApiKey = apiKey;

  hideError();
  showStatus(true);

  if (isNext) {
    setLoadMoreLoading(true);
    searchOffset += allCompanies.length > 0 ? allCompanies.length : 0;
  } else {
    searchOffset = 0;
    allCompanies = [];
    setLoading(true);
    clearResults();
  }
  startSteps();

  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, apiKey, maxResults, deepScrape, offset: searchOffset }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Unknown error');

    lastResult = data;
    const newCompanies = data.companies || [];
    allCompanies = isNext ? [...allCompanies, ...newCompanies] : newCompanies;

    if (isNext) {
      appendCards(newCompanies, allCompanies.length - newCompanies.length);
      updateResultsHeader(allCompanies.length, data);
    } else {
      renderResults(data);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    stopSteps();
    showStatus(false);
    setLoading(false);
    setLoadMoreLoading(false);
  }
}

function renderResults(data) {
  const companies = data.companies || [];

  // Header
  document.getElementById('resultsHeader').classList.add('show');
  updateResultsHeader(companies.length, data);

  // Summary
  if (data.summary) {
    const s = document.getElementById('resultsSummary');
    s.textContent = data.summary;
    s.classList.add('show');
  }

  // Industry filters
  buildFilters(companies);

  // Cards
  const grid = document.getElementById('cardsGrid');
  companies.forEach((c, i) => grid.appendChild(buildCard(c, i)));

  // Sources
  if (data.searchedUrls?.length) {
    document.getElementById('sourcesSection').classList.add('show');
    const list = document.getElementById('sourcesList');
    data.searchedUrls.slice(0, 24).forEach(url => {
      const a = document.createElement('a');
      a.className = 'source-pill'; a.href = url; a.target = '_blank'; a.rel = 'noopener';
      try { a.textContent = new URL(url).hostname; } catch { a.textContent = url; }
      list.appendChild(a);
    });
  }

  // Show export & next buttons
  if (companies.length > 0) {
    document.getElementById('exportJSONBtn').style.display = 'flex';
    document.getElementById('exportCSVBtn').style.display = 'flex';
    document.getElementById('findNextBtn').style.display = 'flex';
    document.getElementById('loadMoreSection').classList.add('show');
    document.getElementById('loadMoreHint').textContent =
      'Search continues with new queries to discover more companies';
  }
}

function appendCards(newCompanies, startIdx) {
  const grid = document.getElementById('cardsGrid');
  newCompanies.forEach((c, i) => grid.appendChild(buildCard(c, startIdx + i)));
  document.getElementById('loadMoreSection').classList.add('show');
}

function updateResultsHeader(count, data) {
  document.getElementById('resultsCount').innerHTML =
    '<span>' + count + '</span> Compan' + (count === 1 ? 'y' : 'ies') + ' Found';
  document.getElementById('resultsMeta').textContent =
    (data.meta?.pagesScraped || 0) + ' pages scraped · ' +
    (data.meta?.queriesUsed || []).length + ' queries · ' +
    (isNextSearch ? 'expanded search' : 'fresh search');
}

function buildFilters(companies) {
  const industries = [...new Set(companies.map(c => c.industry).filter(Boolean))];
  const bar = document.getElementById('filtersBar');
  bar.innerHTML = '<span class="filter-label">Industry:</span><span class="filter-chip all active" onclick="filterCards(\'all\',this)">All</span>';
  industries.slice(0, 8).forEach(ind => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.textContent = ind;
    chip.onclick = () => filterCards(ind, chip);
    bar.appendChild(chip);
  });
  bar.classList.add('show');
}

function filterCards(industry, el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.company-card').forEach(card => {
    if (industry === 'all') { card.style.display = ''; return; }
    card.style.display = card.dataset.industry === industry ? '' : 'none';
  });
}

function buildCard(c, idx) {
  const card = document.createElement('div');
  card.className = 'company-card';
  card.dataset.industry = c.industry || '';
  card.style.animationDelay = Math.min(idx, 10) * 55 + 'ms';

  const score = c.relevanceScore || 0;
  const scoreColor = score >= 80 ? '#2d6a4f' : score >= 60 ? '#3a5f8a' : '#7a7568';
  const initials = (c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const website = c.website || c.source || '#';

  // Details grid
  const details = [];
  if (c.founded) details.push({ label: 'Founded', value: c.founded });
  if (c.location) details.push({ label: 'Location', value: c.location });
  if (c.size) details.push({ label: 'Company Size', value: c.size });
  if (c.industry) details.push({ label: 'Industry', value: c.industry });
  const detailsHTML = details.length ? '<div class="card-details">' +
    details.map(d => '<div class="card-detail"><span class="card-detail-label">' + esc(d.label) +
      '</span><span class="card-detail-value" title="' + esc(d.value) + '">' + esc(d.value) + '</span></div>').join('') +
    '</div>' : '';

  // Products
  const productsHTML = c.keyProducts?.length ? '<div class="card-products"><div class="card-products-label">Key Products & Services</div><div class="card-products-list">' +
    c.keyProducts.slice(0, 5).map(p => '<span class="product-pill">' + esc(p) + '</span>').join('') +
    '</div></div>' : '';

  // Tags
  const tagsHTML = c.tags?.length ? '<div class="card-tags">' +
    c.tags.slice(0, 6).map(t => '<span class="tag">' + esc(t) + '</span>').join('') +
    '</div>' : '';

  // Contact
  let contactItems = '';
  if (c.contactEmail) contactItems += '<a href="mailto:' + esc(c.contactEmail) + '">' + esc(c.contactEmail) + '</a>';
  const contactHTML = contactItems ? '<div class="card-contact"><span class="card-contact-label">Contact</span>' + contactItems + '</div>' : '';

  // Socials
  let socHTML = '';
  if (c.socialLinks?.linkedin) socHTML += '<a href="' + esc(c.socialLinks.linkedin) + '" target="_blank" rel="noopener">LinkedIn ↗</a>';
  if (c.socialLinks?.twitter) socHTML += '<a href="' + esc(c.socialLinks.twitter) + '" target="_blank" rel="noopener">Twitter ↗</a>';

  let sourceDomain = '';
  try { sourceDomain = new URL(c.source || website).hostname; } catch {}

  card.innerHTML =
    '<div class="card-accent-bar"></div>' +
    '<div class="card-body">' +
      '<div class="card-top">' +
        '<div class="card-avatar">' + initials + '</div>' +
        '<div class="card-title-wrap">' +
          '<div class="card-name" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
          '<div class="card-industry">' + esc(c.industry || 'Technology') + '</div>' +
        '</div>' +
        '<div class="card-score-wrap">' +
          '<div class="card-score" style="color:' + scoreColor + '">' + score + '%</div>' +
          '<div class="card-score-label">match</div>' +
        '</div>' +
      '</div>' +
      '<div class="card-desc">' + esc(c.description || '') + '</div>' +
      detailsHTML +
      productsHTML +
      tagsHTML +
      contactHTML +
    '</div>' +
    '<div class="card-footer">' +
      '<a class="card-link" href="' + esc(website) + '" target="_blank" rel="noopener">Visit Website →</a>' +
      '<div class="card-socials">' + socHTML + '</div>' +
      (sourceDomain ? '<span class="card-source" title="' + esc(c.source || website) + '">' + sourceDomain + '</span>' : '') +
    '</div>';

  return card;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function exportJSON() {
  const data = { query: currentQuery, total: allCompanies.length, companies: allCompanies };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'companyscout-' + Date.now() + '.json';
  a.click();
}

function exportCSV() {
  const headers = ['Name','Website','Industry','Founded','Location','Size','Description','Tags','RelevanceScore','LinkedIn','Twitter','Email'];
  const rows = allCompanies.map(c => [
    c.name, c.website, c.industry, c.founded, c.location, c.size,
    c.description, (c.tags || []).join('; '), c.relevanceScore,
    c.socialLinks?.linkedin || '', c.socialLinks?.twitter || '', c.contactEmail || ''
  ].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'companyscout-' + Date.now() + '.csv';
  a.click();
}

function clearResults() {
  document.getElementById('cardsGrid').innerHTML = '';
  document.getElementById('sourcesList').innerHTML = '';
  document.getElementById('filtersBar').innerHTML = '';
  document.getElementById('resultsHeader').classList.remove('show');
  document.getElementById('resultsSummary').classList.remove('show');
  document.getElementById('sourcesSection').classList.remove('show');
  document.getElementById('loadMoreSection').classList.remove('show');
  document.getElementById('filtersBar').classList.remove('show');
  ['exportJSONBtn','exportCSVBtn','findNextBtn'].forEach(id => document.getElementById(id).style.display = 'none');
  allCompanies = [];
}

function showStatus(show) { document.getElementById('statusBar').classList.toggle('show', show); }
function setLoading(l) {
  const b = document.getElementById('searchBtn');
  b.disabled = l; b.classList.toggle('loading', l);
}
function setLoadMoreLoading(l) {
  const b = document.getElementById('loadMoreBtn');
  b.disabled = l; b.classList.toggle('loading', l);
  const b2 = document.getElementById('findNextBtn');
  if(b2) { b2.disabled = l; }
}
function showError(m) {
  const e = document.getElementById('errorBox');
  e.innerHTML = '<strong>Error:</strong> ' + m;
  e.classList.add('show');
}
function hideError() { document.getElementById('errorBox').classList.remove('show'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.target.id === 'query' || e.target.id === 'apiKey')) runSearch(false);
});
</script>
</body>
</html>`;

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date() }));
app.get("/", (_, res) => res.setHeader("Content-Type", "text/html").send(HTML));
app.get(/^(?!\/api).*$/, (_, res) => res.setHeader("Content-Type", "text/html").send(HTML));

app.post("/api/search", async (req, res) => {
  const { query, apiKey, maxResults = 20, deepScrape = false, offset = 0 } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Query is required." });
  if (!apiKey?.trim()) return res.status(400).json({ error: "OpenAI API key is required." });
  if (query.length > 300) return res.status(400).json({ error: "Query too long." });

  try {
    const openai = new OpenAI({ apiKey: apiKey.trim() });

    // Generate varied queries — use offset to get different results on "next"
    const queryGen = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Generate 4 diverse web search queries to find companies matching: "${query}".
${offset > 0 ? `This is search #${Math.floor(offset/maxResults)+2} — generate DIFFERENT queries than typical ones to find NEW companies not already discovered.` : ''}
Return JSON: {"queries": ["q1","q2","q3","q4"]}
Focus on company directories, lists, and individual company sites. Vary the angle each time.`
      }],
      response_format: { type: "json_object" },
      max_tokens: 400, temperature: 0.6,
    });

    const { queries } = JSON.parse(queryGen.choices[0].message.content);
    const searchQueries = [query, ...(queries || [])].slice(0, 5);

    const searchLimit = deepScrape ? 8 : 5;
    const allResults = [];
    for (const q of searchQueries) {
      const r = await searchDuckDuckGo(q + (offset > 0 ? ` -site:${['crunchbase.com','linkedin.com'].join(' -site:')}` : ''), searchLimit);
      allResults.push(...r);
    }

    const seen = new Set();
    const uniqueResults = allResults.filter(r => {
      try {
        const host = new URL(r.url).hostname;
        if (seen.has(host)) return false;
        seen.add(host);
        return true;
      } catch { return false; }
    });

    const topResults = uniqueResults.slice(0, deepScrape ? 20 : 14);
    const pages = await Promise.all(topResults.map(r => scrapePage(r.url)));
    const enrichedPages = pages.map((page, i) => {
      if (page) return page;
      const r = topResults[i];
      return { text: r.snippet || "", title: r.title || "", description: r.snippet || "", url: r.url };
    });

    const result = await extractCompanyData(openai, enrichedPages, query, maxResults, offset);
    result.totalFound = result.companies?.length || 0;
    if (result.companies) result.companies.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return res.json({
      success: true, query, ...result,
      searchedUrls: topResults.map(r => r.url),
      meta: { queriesUsed: searchQueries, pagesScraped: enrichedPages.filter(Boolean).length, deepScrape, offset },
    });
  } catch (err) {
    console.error("Search error:", err.message);
    if (err.status === 401 || err.message?.includes("API key")) return res.status(401).json({ error: "Invalid OpenAI API key." });
    if (err.status === 429) return res.status(429).json({ error: "OpenAI rate limit reached. Please wait a moment." });
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function searchDuckDuckGo(query, maxResults = 10) {
  try {
    const { data } = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
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
  } catch (err) {
    console.error("DDG error:", err.message);
    return [];
  }
}

async function scrapePage(url, maxLen = 5000) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CompanyScoutBot/1.0)", Accept: "text/html" },
      maxRedirects: 5,
    });
    const $ = cheerio.load(data);
    $("script,style,nav,footer,header,aside,noscript,svg,.cookie,.popup,.modal").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, maxLen);
    return {
      text,
      title: $("title").text().trim(),
      description: $('meta[name="description"]').attr("content") || "",
      url,
    };
  } catch { return null; }
}

async function extractCompanyData(openai, pages, originalQuery, maxResults, offset) {
  const context = pages.filter(Boolean)
    .map((p, i) => `--- Source ${i+1}: ${p.url} ---\nTitle: ${p.title}\nMeta: ${p.description}\n${p.text}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: `You are an expert business intelligence analyst. Extract ALL companies from the web content below that match: "${originalQuery}".
${offset > 0 ? `This is a follow-up search — focus on finding DIFFERENT companies not commonly listed.` : ''}

Return JSON exactly like this:
{
  "companies": [{
    "name": "Exact Company Name",
    "website": "https://company.com",
    "description": "3-4 sentence detailed description including what they do, who they serve, and what makes them notable",
    "industry": "Specific industry sector",
    "founded": "YYYY or null",
    "location": "City, Country",
    "size": "Startup (<50) | SMB (50-200) | Mid-size (200-1000) | Enterprise (1000+) | null",
    "revenue": "Revenue range or null",
    "funding": "Total funding or stage (Seed/Series A/B/C/Public) or null",
    "keyProducts": ["Product 1","Product 2","Product 3"],
    "tags": ["tag1","tag2","tag3","tag4"],
    "relevanceScore": 88,
    "contactEmail": "contact@company.com or null",
    "phone": "phone number or null",
    "socialLinks": {"linkedin": "full URL or null","twitter": "full URL or null"},
    "source": "URL this was found at"
  }],
  "summary": "3-sentence summary of what was found, key trends, and notable companies",
  "totalFound": 0
}

Critical rules:
- Return UP TO ${Math.min(maxResults, 20)} companies — include every company you can identify
- Only REAL, verifiable companies — no invented data
- relevanceScore: 0-100 based on query match quality
- Description MUST be 3-4 sentences — be detailed
- Extract funding/revenue if mentioned in sources
- Return ONLY valid JSON, no markdown`
    }],
    temperature: 0.15,
    max_tokens: 6000,
    response_format: { type: "json_object" },
  });

  return JSON.parse(completion.choices[0].message.content);
}

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 CompanyScout on http://0.0.0.0:${PORT}`));
