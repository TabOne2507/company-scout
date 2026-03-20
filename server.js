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

// ── Security & Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// ── Inlined HTML ───────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CompanyScout — AI-Powered Company Discovery</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;1,300&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#0a0a0f;--paper:#f5f2eb;--paper2:#ede9df;--accent:#c84b2f;--accent2:#3a5f8a;--muted:#7a7568;--border:#d4cfc4;--card:#ffffff;--green:#2d6a4f;--tag-bg:#eae7de;--radius:4px;--shadow:0 2px 16px rgba(10,10,15,0.08),0 1px 3px rgba(10,10,15,0.06);--shadow-lg:0 8px 40px rgba(10,10,15,0.12),0 2px 8px rgba(10,10,15,0.08)}
html{font-size:16px;scroll-behavior:smooth}
body{font-family:'DM Mono',monospace;background:var(--paper);color:var(--ink);min-height:100vh;overflow-x:hidden}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
header{border-bottom:1.5px solid var(--border);padding:20px 0;position:sticky;top:0;z-index:100;background:rgba(245,242,235,0.92);backdrop-filter:blur(12px)}
.header-inner{display:flex;align-items:center;justify-content:space-between}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1.35rem;letter-spacing:-0.03em;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:10px}
.logo-dot{width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block}
.logo-sub{font-family:'DM Mono',monospace;font-weight:300;font-size:0.65rem;color:var(--muted);letter-spacing:0.12em;text-transform:uppercase;margin-top:2px;display:block}
.badge{font-family:'DM Mono',monospace;font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);padding:4px 10px;border-radius:2px}
.hero{padding:72px 0 48px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-40px;right:-80px;width:500px;height:500px;background:radial-gradient(ellipse,rgba(200,75,47,0.06) 0%,transparent 70%);pointer-events:none}
.hero-eyebrow{font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--accent);margin-bottom:16px;font-weight:400;display:flex;align-items:center;gap:8px}
.hero-eyebrow::before{content:'//';opacity:0.5}
.hero-title{font-family:'Syne',sans-serif;font-size:clamp(2.6rem,5vw,4.2rem);font-weight:800;line-height:1.04;letter-spacing:-0.03em;color:var(--ink);max-width:640px;margin-bottom:20px}
.hero-title em{font-family:'Instrument Serif',serif;font-style:italic;color:var(--accent);font-weight:400}
.hero-desc{font-size:0.88rem;color:var(--muted);max-width:500px;line-height:1.75;font-weight:300}
.search-panel{background:var(--card);border:1.5px solid var(--border);border-radius:6px;padding:32px;box-shadow:var(--shadow);margin-bottom:48px}
.search-panel-title{font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:24px;display:flex;align-items:center;gap:8px}
.search-panel-title::after{content:'';flex:1;height:1px;background:var(--border)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:680px){.form-grid{grid-template-columns:1fr}}
.field{display:flex;flex-direction:column;gap:6px}
.field.full{grid-column:1/-1}
label{font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);font-weight:400}
input,select{font-family:'DM Mono',monospace;font-size:0.85rem;padding:11px 14px;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--paper);color:var(--ink);outline:none;transition:border-color 0.15s,box-shadow 0.15s;width:100%}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(200,75,47,0.08)}
input::placeholder{color:var(--muted);opacity:0.6}
.toggle-row{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--paper);cursor:pointer;user-select:none;transition:border-color 0.15s}
.toggle-row:hover{border-color:var(--accent)}
.toggle-row input[type="checkbox"]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
.toggle-label{font-size:0.82rem;color:var(--muted)}
.toggle-label strong{color:var(--ink)}
.btn-search{grid-column:1/-1;font-family:'Syne',sans-serif;font-size:0.9rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:16px 32px;background:var(--ink);color:var(--paper);border:none;border-radius:var(--radius);cursor:pointer;transition:background 0.15s,transform 0.1s;display:flex;align-items:center;justify-content:center;gap:10px}
.btn-search:hover{background:var(--accent)}
.btn-search:active{transform:scale(0.99)}
.btn-search:disabled{opacity:0.5;cursor:not-allowed;transform:none}
.btn-search .spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite;display:none}
.btn-search.loading .spinner{display:block}
.btn-search.loading .btn-text{opacity:0.6}
@keyframes spin{to{transform:rotate(360deg)}}
.status-bar{display:none;align-items:center;gap:12px;padding:14px 18px;background:var(--paper2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:24px;font-size:0.78rem;color:var(--muted);animation:fadeIn 0.3s ease}
.status-bar.show{display:flex}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 1.2s infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.error-box{display:none;padding:16px 20px;background:rgba(200,75,47,0.06);border:1.5px solid rgba(200,75,47,0.3);border-radius:var(--radius);color:var(--accent);font-size:0.82rem;margin-bottom:24px;animation:fadeIn 0.3s ease}
.error-box.show{display:block}
.results-header{display:none;align-items:baseline;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.results-header.show{display:flex}
.results-count{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;color:var(--ink)}
.results-count span{color:var(--accent)}
.results-meta{font-size:0.72rem;color:var(--muted)}
.results-summary{font-size:0.82rem;color:var(--muted);line-height:1.7;padding:14px 18px;background:var(--paper2);border-left:3px solid var(--accent);border-radius:0 4px 4px 0;margin-bottom:28px;display:none}
.results-summary.show{display:block}
.cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;margin-bottom:48px}
.company-card{background:var(--card);border:1.5px solid var(--border);border-radius:6px;padding:24px;box-shadow:var(--shadow);transition:border-color 0.2s,box-shadow 0.2s,transform 0.2s;animation:cardIn 0.4s ease both;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden}
.company-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2));opacity:0;transition:opacity 0.2s}
.company-card:hover{border-color:var(--accent);box-shadow:var(--shadow-lg);transform:translateY(-2px)}
.company-card:hover::before{opacity:1}
@keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.card-name-wrap{flex:1;min-width:0}
.card-name{font-family:'Syne',sans-serif;font-size:1.05rem;font-weight:700;color:var(--ink);line-height:1.2;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-industry{font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)}
.card-score{font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700;color:var(--green);background:rgba(45,106,79,0.08);border:1px solid rgba(45,106,79,0.2);padding:3px 8px;border-radius:2px;white-space:nowrap;flex-shrink:0}
.card-desc{font-size:0.8rem;color:var(--muted);line-height:1.7;font-weight:300}
.card-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:0.7rem;color:var(--muted)}
.card-meta-item{display:flex;align-items:center;gap:4px}
.card-tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{font-size:0.63rem;letter-spacing:0.08em;text-transform:uppercase;padding:3px 8px;background:var(--tag-bg);color:var(--muted);border-radius:2px;border:1px solid var(--border)}
.card-products{font-size:0.75rem;color:var(--muted)}
.card-products strong{color:var(--ink);font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;font-weight:400;display:block;margin-bottom:4px}
.card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}
.card-link{font-family:'Syne',sans-serif;font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:5px;transition:gap 0.15s}
.card-link:hover{gap:8px}
.card-socials{display:flex;gap:8px}
.card-socials a{color:var(--muted);text-decoration:none;transition:color 0.15s;font-size:0.65rem}
.card-socials a:hover{color:var(--accent2)}
.sources-section{display:none;margin-bottom:48px}
.sources-section.show{display:block}
.sources-title{font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.sources-title::after{content:'';flex:1;height:1px;background:var(--border)}
.sources-list{display:flex;flex-wrap:wrap;gap:6px}
.source-pill{font-size:0.65rem;padding:4px 10px;background:var(--paper2);border:1px solid var(--border);border-radius:2px;color:var(--muted);text-decoration:none;max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:block;transition:border-color 0.15s,color 0.15s}
.source-pill:hover{border-color:var(--accent2);color:var(--accent2)}
footer{border-top:1.5px solid var(--border);padding:24px 0;text-align:center;font-size:0.7rem;color:var(--muted);letter-spacing:0.05em}
.btn-export{font-family:'DM Mono',monospace;font-size:0.72rem;padding:8px 16px;border:1.5px solid var(--border);background:transparent;color:var(--muted);border-radius:var(--radius);cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:6px}
.btn-export:hover{border-color:var(--accent2);color:var(--accent2)}
</style>
</head>
<body>
<header>
  <div class="container header-inner">
    <a class="logo" href="/">
      <span class="logo-dot"></span>
      <div>CompanyScout<span class="logo-sub">AI Web Intelligence</span></div>
    </a>
    <span class="badge">Powered by OpenAI</span>
  </div>
</header>
<main>
<div class="container">
  <div class="hero">
    <p class="hero-eyebrow">Company Discovery Engine</p>
    <h1 class="hero-title">Find any company<br/>across the <em>entire</em> web.</h1>
    <p class="hero-desc">Describe the companies you're looking for. Our AI scrapes search engines, crawls websites, and extracts structured business intelligence — instantly.</p>
  </div>
  <div class="search-panel">
    <div class="search-panel-title">Configure Search</div>
    <div class="form-grid">
      <div class="field full">
        <label>What companies are you looking for?</label>
        <input id="query" type="text" placeholder="e.g. AI startups in India focused on healthcare, SaaS fintech companies in Europe..." autocomplete="off"/>
      </div>
      <div class="field full">
        <label>OpenAI API Key</label>
        <input id="apiKey" type="password" placeholder="sk-..." autocomplete="off"/>
      </div>
      <div class="field">
        <label>Max Companies to Return</label>
        <select id="maxResults">
          <option value="5">5 companies</option>
          <option value="10" selected>10 companies</option>
          <option value="15">15 companies</option>
        </select>
      </div>
      <div class="field">
        <label>Scan Mode</label>
        <label class="toggle-row">
          <input type="checkbox" id="deepScrape"/>
          <span class="toggle-label"><strong>Deep Scan</strong> — crawl more pages (slower)</span>
        </label>
      </div>
      <button class="btn-search" id="searchBtn" onclick="runSearch()">
        <div class="spinner"></div>
        <span class="btn-text">Discover Companies →</span>
      </button>
    </div>
  </div>
  <div class="status-bar" id="statusBar">
    <div class="status-dot"></div>
    <span id="statusText">Searching the web…</span>
  </div>
  <div class="error-box" id="errorBox"></div>
  <div class="results-header" id="resultsHeader">
    <div>
      <div class="results-count" id="resultsCount"><span>0</span> Companies Found</div>
      <div class="results-meta" id="resultsMeta"></div>
    </div>
    <button class="btn-export" onclick="exportJSON()" id="exportBtn" style="display:none">↓ Export JSON</button>
  </div>
  <div class="results-summary" id="resultsSummary"></div>
  <div class="cards-grid" id="cardsGrid"></div>
  <div class="sources-section" id="sourcesSection">
    <div class="sources-title">Sources Scraped</div>
    <div class="sources-list" id="sourcesList"></div>
  </div>
</div>
</main>
<footer>
  <div class="container">CompanyScout — Your API key is never stored. All requests are processed server-side and discarded immediately.</div>
</footer>
<script>
let lastResult=null;
const steps=['Generating optimized search queries with AI…','Scraping DuckDuckGo search results…','Crawling company websites…','Extracting company data with OpenAI…','Ranking by relevance…'];
let stepIdx=0,stepTimer=null;
function setStatus(t){document.getElementById('statusText').textContent=t}
function startSteps(){stepIdx=0;setStatus(steps[0]);stepTimer=setInterval(()=>{stepIdx=(stepIdx+1)%steps.length;setStatus(steps[stepIdx])},3200)}
function stopSteps(){clearInterval(stepTimer)}
async function runSearch(){
  const query=document.getElementById('query').value.trim();
  const apiKey=document.getElementById('apiKey').value.trim();
  const maxResults=parseInt(document.getElementById('maxResults').value);
  const deepScrape=document.getElementById('deepScrape').checked;
  if(!query){showError('Please enter a search query.');return}
  if(!apiKey){showError('Please enter your OpenAI API key.');return}
  hideError();showStatus(true);setLoading(true);clearResults();startSteps();
  try{
    const resp=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,apiKey,maxResults,deepScrape})});
    const data=await resp.json();
    if(!resp.ok)throw new Error(data.error||'Unknown error');
    lastResult=data;renderResults(data);
  }catch(err){showError(err.message)}
  finally{stopSteps();showStatus(false);setLoading(false)}
}
function renderResults(data){
  const companies=data.companies||[];
  document.getElementById('resultsHeader').classList.add('show');
  document.getElementById('resultsCount').innerHTML='<span>'+companies.length+'</span> Compan'+(companies.length===1?'y':'ies')+' Found';
  document.getElementById('resultsMeta').textContent=(data.meta?.pagesScraped||0)+' pages scraped · '+(data.meta?.queriesUsed||[]).length+' search queries';
  if(data.summary){const s=document.getElementById('resultsSummary');s.textContent=data.summary;s.classList.add('show')}
  const grid=document.getElementById('cardsGrid');
  companies.forEach((c,i)=>grid.appendChild(buildCard(c,i)));
  if(data.searchedUrls?.length){
    document.getElementById('sourcesSection').classList.add('show');
    const list=document.getElementById('sourcesList');
    data.searchedUrls.slice(0,20).forEach(url=>{
      const a=document.createElement('a');a.className='source-pill';a.href=url;a.target='_blank';a.rel='noopener';
      try{a.textContent=new URL(url).hostname}catch{a.textContent=url}
      list.appendChild(a);
    });
  }
  if(companies.length>0)document.getElementById('exportBtn').style.display='flex';
}
function buildCard(c,idx){
  const card=document.createElement('div');card.className='company-card';card.style.animationDelay=idx*60+'ms';
  const score=c.relevanceScore||0;
  const sc=score>=80?'var(--green)':score>=60?'var(--accent2)':'var(--muted)';
  let meta='';
  if(c.founded)meta+='<span class="card-meta-item">'+ico('calendar')+' Founded '+c.founded+'</span>';
  if(c.location)meta+='<span class="card-meta-item">'+ico('pin')+' '+esc(c.location)+'</span>';
  if(c.size)meta+='<span class="card-meta-item">'+ico('building')+' '+esc(c.size)+'</span>';
  const tags=(c.tags||[]).slice(0,5).map(t=>'<span class="tag">'+esc(t)+'</span>').join('');
  const prods=c.keyProducts?.length?'<div class="card-products"><strong>Key Products</strong>'+esc(c.keyProducts.slice(0,3).join(' · '))+'</div>':'';
  let soc='';
  if(c.socialLinks?.linkedin)soc+='<a href="'+esc(c.socialLinks.linkedin)+'" target="_blank" rel="noopener">LinkedIn ↗</a>';
  if(c.socialLinks?.twitter)soc+='<a href="'+esc(c.socialLinks.twitter)+'" target="_blank" rel="noopener">Twitter ↗</a>';
  const url=c.website||c.source||'#';
  card.innerHTML='<div class="card-top"><div class="card-name-wrap"><div class="card-name" title="'+esc(c.name)+'">'+esc(c.name)+'</div><div class="card-industry">'+esc(c.industry||'Technology')+'</div></div><div class="card-score" style="color:'+sc+';border-color:'+sc+'20;background:'+sc+'12">'+score+'%</div></div><div class="card-desc">'+esc(c.description||'')+'</div>'+(meta?'<div class="card-meta">'+meta+'</div>':'')+(tags?'<div class="card-tags">'+tags+'</div>':'')+prods+'<div class="card-footer"><a class="card-link" href="'+esc(url)+'" target="_blank" rel="noopener">Visit Site →</a><div class="card-socials">'+soc+'</div></div>';
  return card;
}
function ico(t){const m={calendar:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',pin:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',building:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>'};return m[t]||''}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function exportJSON(){if(!lastResult)return;const b=new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='companyscout-'+Date.now()+'.json';a.click()}
function clearResults(){document.getElementById('cardsGrid').innerHTML='';document.getElementById('sourcesList').innerHTML='';document.getElementById('resultsHeader').classList.remove('show');document.getElementById('resultsSummary').classList.remove('show');document.getElementById('sourcesSection').classList.remove('show');document.getElementById('exportBtn').style.display='none';lastResult=null}
function showStatus(s){document.getElementById('statusBar').classList.toggle('show',s)}
function setLoading(l){const b=document.getElementById('searchBtn');b.disabled=l;b.classList.toggle('loading',l)}
function showError(m){const e=document.getElementById('errorBox');e.textContent='⚠ '+m;e.classList.add('show')}
function hideError(){document.getElementById('errorBox').classList.remove('show')}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target.id==='query'||e.target.id==='apiKey'))runSearch()});
</script>
</body>
</html>`;

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date() }));

// Serve HTML for all non-API routes
app.get("/", (_, res) => res.setHeader("Content-Type","text/html").send(HTML));
app.get(/^(?!\/api).*$/, (_, res) => res.setHeader("Content-Type","text/html").send(HTML));

app.post("/api/search", async (req, res) => {
  const { query, apiKey, maxResults = 10, deepScrape = false } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Query is required." });
  if (!apiKey?.trim()) return res.status(400).json({ error: "OpenAI API key is required." });
  if (query.length > 300) return res.status(400).json({ error: "Query too long." });

  try {
    const openai = new OpenAI({ apiKey: apiKey.trim() });

    const queryGen = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Generate 3 diverse web search queries to find companies matching: "${query}".
Return JSON: {"queries": ["query1", "query2", "query3"]}
Make them specific and varied. Focus on finding company websites and lists.`
      }],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.4,
    });

    const { queries } = JSON.parse(queryGen.choices[0].message.content);
    const searchQueries = [query, ...(queries || [])].slice(0, 4);

    const searchLimit = deepScrape ? 6 : 4;
    const allResults = [];
    for (const q of searchQueries) {
      const r = await searchDuckDuckGo(q, searchLimit);
      allResults.push(...r);
    }

    const seen = new Set();
    const uniqueResults = allResults.filter((r) => {
      try {
        const host = new URL(r.url).hostname;
        if (seen.has(host)) return false;
        seen.add(host);
        return true;
      } catch { return false; }
    });

    const topResults = uniqueResults.slice(0, deepScrape ? 15 : 10);
    const scrapeLimit = deepScrape ? 12 : 8;
    const pages = await Promise.all(topResults.slice(0, scrapeLimit).map((r) => scrapePage(r.url)));

    const enrichedPages = pages.map((page, i) => {
      if (page) return page;
      const r = topResults[i];
      return { text: r.snippet || "", title: r.title || "", description: r.snippet || "", url: r.url };
    });

    const result = await extractCompanyData(openai, enrichedPages, query);
    result.totalFound = result.companies?.length || 0;
    if (result.companies) result.companies.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return res.json({
      success: true, query, ...result,
      searchedUrls: topResults.map((r) => r.url),
      meta: { queriesUsed: searchQueries, pagesScraped: enrichedPages.filter(Boolean).length, deepScrape },
    });
  } catch (err) {
    console.error("Search error:", err.message);
    if (err.status === 401 || err.message?.includes("API key")) return res.status(401).json({ error: "Invalid OpenAI API key." });
    if (err.status === 429) return res.status(429).json({ error: "OpenAI rate limit reached. Try again soon." });
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function searchDuckDuckGo(query, maxResults = 12) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, {
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
    console.error("DDG search error:", err.message);
    return [];
  }
}

async function scrapePage(url, maxLen = 4000) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CompanyScoutBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 5,
    });
    const $ = cheerio.load(data);
    $("script,style,nav,footer,header,aside,noscript,svg").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, maxLen);
    const title = $("title").text().trim();
    const description = $('meta[name="description"]').attr("content") || "";
    return { text, title, description, url };
  } catch { return null; }
}

async function extractCompanyData(openai, pages, originalQuery) {
  const context = pages.filter(Boolean)
    .map((p, i) => `--- Source ${i + 1}: ${p.url} ---\nTitle: ${p.title}\nDescription: ${p.description}\n${p.text}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: `You are an expert business intelligence analyst. Based on the web content below, extract information about companies relevant to the user's query: "${originalQuery}".

Return a JSON object:
{
  "companies": [{
    "name": "Company Name",
    "website": "https://...",
    "description": "2-3 sentence description",
    "industry": "Primary industry/sector",
    "founded": "Year or null",
    "location": "City, Country or null",
    "size": "Startup/SMB/Mid-size/Enterprise or null",
    "keyProducts": ["product1"],
    "tags": ["tag1","tag2"],
    "relevanceScore": 85,
    "contactEmail": null,
    "socialLinks": {"linkedin": null, "twitter": null},
    "source": "URL where found"
  }],
  "summary": "Brief 2-sentence summary",
  "totalFound": 0
}

Rules: Only REAL companies. relevanceScore 0-100. Max 15 companies. No invented data. Return ONLY valid JSON.

WEB CONTENT:
${context.slice(0, 20000)}`
    }],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  return JSON.parse(completion.choices[0].message.content);
}

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 CompanyScout running on http://0.0.0.0:${PORT}`);
});
