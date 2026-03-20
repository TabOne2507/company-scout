import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import axios from "axios";
import * as cheerio from "cheerio";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false }));

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI REST helper (no npm package — plain HTTP)
// ─────────────────────────────────────────────────────────────────────────────
async function gemini(apiKey, prompt, temp = 0.2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: temp, maxOutputTokens: 8192 }
  };
  const { data } = await axios.post(url, body, { timeout: 60000, headers: { "Content-Type": "application/json" } });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.replace(/```json|```/gi, "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// DuckDuckGo scrape
// ─────────────────────────────────────────────────────────────────────────────
async function searchDDG(query, max = 6) {
  try {
    const { data } = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", "Accept-Language": "en-US,en;q=0.9" }, timeout: 12000 }
    );
    const $ = cheerio.load(data);
    const results = [];
    $(".result__body").each((_, el) => {
      const title   = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      const href    = $(el).find(".result__url").attr("href") || $(el).find("a.result__url").text().trim();
      const link    = $(el).find("a.result__a").attr("href");
      if (title && (link || href)) results.push({ title, snippet, url: link || `https://${href}` });
      if (results.length >= max) return false;
    });
    return results;
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page scraper
// ─────────────────────────────────────────────────────────────────────────────
async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CompanyScoutBot/2.0)", Accept: "text/html" },
      maxRedirects: 4,
    });
    const $ = cheerio.load(data);
    $("script,style,nav,footer,header,aside,noscript,svg").remove();
    return {
      url,
      title: $("title").text().trim().slice(0, 120),
      description: $('meta[name="description"]').attr("content")?.slice(0, 200) || "",
      text: $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000),
    };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.post("/api/search", async (req, res) => {
  const { query, apiKey, maxResults = 20, deepScrape = false, offset = 0 } = req.body;
  const logs = [];
  const log = (level, msg) => { logs.push({ ts: new Date().toISOString(), level, msg }); console.log(`[${level.toUpperCase()}] ${msg}`); };

  log("info", "Request received");

  if (!query?.trim())  return res.status(400).json({ error: "Query is required.", logs });
  if (!apiKey?.trim()) return res.status(400).json({ error: "Gemini API key is required.", logs });

  log("info", `Query: "${query}" | max: ${maxResults} | deep: ${deepScrape} | offset: ${offset}`);

  try {
    // 1. Generate search queries
    log("step", "Generating search queries with Gemini…");
    let extraQueries = [];
    try {
      const qPrompt = `Generate 3 diverse Google search queries to find companies matching: "${query}".
Return ONLY this JSON (no markdown): {"queries":["query1","query2","query3"]}`;
      const qRaw = await gemini(apiKey, qPrompt, 0.5);
      log("info", `Gemini query response: ${qRaw.slice(0, 150)}`);
      extraQueries = JSON.parse(qRaw).queries || [];
      log("ok", `Got ${extraQueries.length} extra queries`);
    } catch (e) {
      log("warn", `Query gen failed: ${e.message} — using original only`);
    }

    const allQueries = [query, ...extraQueries].slice(0, 4);
    log("info", `Search queries: ${JSON.stringify(allQueries)}`);

    // 2. Search DuckDuckGo
    log("step", "Searching DuckDuckGo…");
    const rawResults = [];
    for (const q of allQueries) {
      const r = await searchDDG(q, deepScrape ? 7 : 5);
      log("info", `DDG "${q}" → ${r.length} results`);
      rawResults.push(...r);
    }

    // Deduplicate by hostname
    const seenHosts = new Set();
    const deduped = rawResults.filter(r => {
      try { const h = new URL(r.url).hostname; if (seenHosts.has(h)) return false; seenHosts.add(h); return true; }
      catch { return false; }
    });
    log("ok", `${deduped.length} unique URLs (from ${rawResults.length} total)`);

    const toScrape = deduped.slice(0, deepScrape ? 18 : 12);

    // 3. Scrape pages
    log("step", `Scraping ${toScrape.length} pages…`);
    const scraped = await Promise.allSettled(toScrape.map(r => scrapePage(r.url)));
    const pages = scraped.map((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        log("info", `  ✓ ${r.value.url.slice(0, 60)}`);
        return r.value;
      }
      log("info", `  ✗ ${toScrape[i].url.slice(0, 60)} (fallback to snippet)`);
      return { url: toScrape[i].url, title: toScrape[i].title, description: toScrape[i].snippet, text: toScrape[i].snippet };
    });

    const goodCount = pages.filter(p => (p.text?.length || 0) > 60).length;
    log("ok", `${goodCount}/${pages.length} pages with usable content`);

    // 4. Build context
    const context = pages
      .map((p, i) => `[Source ${i+1}] URL: ${p.url}\nTitle: ${p.title}\nDesc: ${p.description}\nContent: ${p.text}`)
      .join("\n\n---\n\n")
      .slice(0, 26000);

    log("info", `Context: ${context.length} chars`);

    // 5. Extract companies with Gemini
    log("step", "Extracting companies with Gemini…");
    const extractPrompt = `You are a business intelligence analyst.

User wants to find: "${query}"

Based on the web content below, extract companies that match this request.

Return ONLY a raw JSON object — no markdown, no backticks, no explanation before or after. Just the JSON.

Schema:
{
  "companies": [
    {
      "name": "string",
      "website": "string or null",
      "description": "3-4 sentences about what they do and who they serve",
      "industry": "string",
      "founded": "YYYY or null",
      "location": "City, Country or null",
      "size": "Startup or SMB or Mid-size or Enterprise or null",
      "funding": "string or null",
      "keyProducts": ["string"],
      "tags": ["string"],
      "relevanceScore": 0-100,
      "contactEmail": "string or null",
      "socialLinks": { "linkedin": "string or null", "twitter": "string or null" },
      "source": "string"
    }
  ],
  "summary": "2-3 sentences summarizing what was found",
  "totalFound": 0
}

Rules:
- Only include REAL, verifiable companies
- Max ${Math.min(maxResults, 20)} companies
- relevanceScore 0-100 based on how well they match the query
- Do NOT invent any data — use only what is in the sources
- Output ONLY the JSON object, nothing else

Web content:
${context}`;

    let extracted;
    try {
      const rawExtract = await gemini(apiKey, extractPrompt, 0.1);
      log("info", `Gemini response: ${rawExtract.length} chars`);
      log("info", `Preview: ${rawExtract.slice(0, 200)}`);
      extracted = JSON.parse(rawExtract);
      log("ok", `Parsed ${extracted.companies?.length || 0} companies`);
    } catch (e) {
      log("err", `Gemini extract failed: ${e.message}`);
      throw new Error(`Gemini failed: ${e.message}`);
    }

    if (extracted.companies) {
      extracted.companies.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }
    extracted.totalFound = extracted.companies?.length || 0;

    log("ok", `Done — returning ${extracted.totalFound} companies`);

    return res.json({
      success: true,
      query,
      ...extracted,
      searchedUrls: toScrape.map(r => r.url),
      logs,
      meta: { queriesUsed: allQueries, pagesScraped: goodCount, deepScrape, offset }
    });

  } catch (err) {
    log("err", `FATAL: ${err.message}`);
    const isKeyError = err.message?.includes("API_KEY_INVALID") || err.response?.status === 400;
    const isQuota   = err.message?.includes("quota") || err.response?.status === 429;
    const status    = isKeyError ? 401 : isQuota ? 429 : 500;
    const message   = isKeyError
      ? "Invalid Gemini API key. Get one free at aistudio.google.com"
      : isQuota
      ? "Gemini rate limit hit. Wait a moment and retry."
      : err.message || "Server error";
    return res.status(status).json({ error: message, logs });
  }
});

app.get("/",           (_, res) => res.setHeader("Content-Type","text/html").send(HTML));
app.get(/^(?!\/api).*$/, (_, res) => res.setHeader("Content-Type","text/html").send(HTML));

app.listen(PORT, "0.0.0.0", () => console.log(`CompanyScout running on port ${PORT}`));

// ─────────────────────────────────────────────────────────────────────────────
// HTML — defined last so template literal doesn't interfere with server code
// ─────────────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CompanyScout</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0c0c10;--bg2:#111116;--bg3:#17171d;--bg4:#1e1e26;
  --bd:#22222c;--bd2:#2c2c3a;
  --tx:#eeedf2;--mt:#888799;--mt2:#50505f;
  --ac:#6c63ff;--ag:rgba(108,99,255,.14);
  --gr:#3ecf8e;--ye:#f5c842;--re:#ff6060;--bl:#60a5fa;
  --card:#0f0f14;--r:10px;
}
html{font-size:16px}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--tx);min-height:100vh;overflow-x:hidden}
.w{max-width:1100px;margin:0 auto;padding:0 28px}
@media(max-width:600px){.w{padding:0 14px}}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:3px}

/* NAV */
nav{padding:14px 0;border-bottom:1px solid var(--bd);background:rgba(12,12,16,.96);backdrop-filter:blur(18px);position:sticky;top:0;z-index:100}
.nav-i{display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:9px;text-decoration:none}
.logo-box{width:30px;height:30px;background:var(--ac);border-radius:7px;display:grid;place-items:center}
.logo-box svg{width:16px;height:16px;stroke:#fff;fill:none;stroke-width:2.2}
.logo-name{font-family:'Syne',sans-serif;font-size:1.05rem;font-weight:800;color:var(--tx);letter-spacing:-.02em}
.nav-chip{font-size:.58rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--mt);background:var(--bg3);border:1px solid var(--bd2);padding:4px 10px;border-radius:20px}

/* HERO */
.hero{padding:48px 0 36px}
.hero-tag{display:inline-flex;align-items:center;gap:7px;font-size:.66rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);background:var(--ag);border:1px solid rgba(108,99,255,.25);padding:5px 12px;border-radius:20px;margin-bottom:18px}
.dot{width:5px;height:5px;background:var(--ac);border-radius:50%;animation:blink 1.8s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
h1{font-family:'Syne',sans-serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:800;line-height:1.06;letter-spacing:-.04em;color:var(--tx);margin-bottom:14px;max-width:620px}
h1 .ac{color:var(--ac)}
.sub{font-size:.88rem;color:var(--mt);max-width:440px;line-height:1.8;font-weight:300;margin-bottom:28px}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{display:flex;align-items:center;gap:6px;font-size:.7rem;font-weight:500;color:var(--mt);background:var(--bg3);border:1px solid var(--bd);padding:5px 12px;border-radius:6px}
.pill svg{width:12px;height:12px;stroke:var(--ac);fill:none;stroke-width:2;flex-shrink:0}

/* CARD panel */
.pnl{background:var(--card);border:1px solid var(--bd);border-radius:13px;padding:28px;margin-bottom:24px}
.pnl-hd{font-size:.58rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mt2);margin-bottom:20px;display:flex;align-items:center;gap:10px}
.pnl-hd::after{content:'';flex:1;height:1px;background:var(--bd)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.g2{grid-template-columns:1fr}}
.full{grid-column:1/-1}
.fld{display:flex;flex-direction:column;gap:6px}
.lbl{font-size:.62rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mt)}
.hint{font-size:.58rem;color:var(--mt2);margin-top:1px}
input,select{font-family:'Inter',sans-serif;font-size:.84rem;padding:11px 13px;border:1px solid var(--bd2);border-radius:8px;background:var(--bg2);color:var(--tx);outline:none;transition:border-color .15s,box-shadow .15s;width:100%}
input:focus,select:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--ag)}
input::placeholder{color:var(--mt2);font-weight:300}
select option{background:var(--bg2)}
.tgl{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--bd2);border-radius:8px;background:var(--bg2);cursor:pointer;user-select:none}
.tgl:hover{border-color:var(--ac)}
.tgl input[type=checkbox]{width:14px;height:14px;accent-color:var(--ac);flex-shrink:0;cursor:pointer}
.tgl-t{font-size:.8rem;color:var(--mt);line-height:1.35}
.tgl-t b{color:var(--tx);font-weight:500;display:block;margin-bottom:1px}

/* BUTTON */
.btn-go{width:100%;font-family:'Syne',sans-serif;font-size:.86rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:14px;background:var(--ac);color:#fff;border:none;border-radius:9px;cursor:pointer;transition:background .15s,box-shadow .15s;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 16px rgba(108,99,255,.32)}
.btn-go:hover:not(:disabled){background:#7c74ff;box-shadow:0 6px 24px rgba(108,99,255,.48)}
.btn-go:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
.btn-go .sp{display:none;width:16px;height:16px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .65s linear infinite;flex-shrink:0}
.btn-go.ld .sp{display:block}
.btn-go.ld .bt{opacity:.5}
@keyframes spin{to{transform:rotate(360deg)}}

/* LOG PANEL */
.log-pnl{background:var(--bg2);border:1px solid var(--bd2);border-radius:11px;margin-bottom:22px;overflow:hidden}
.log-top{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid var(--bd);background:var(--bg3);gap:10px}
.log-ttl{display:flex;align-items:center;gap:7px;font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mt)}
.ldot{width:6px;height:6px;border-radius:50%;background:var(--mt2);flex-shrink:0}
.ldot.live{background:var(--gr);animation:blink 1s infinite}
.log-acts{display:flex;gap:5px}
.lbtn{font-family:'JetBrains Mono',monospace;font-size:.58rem;padding:3px 8px;border:1px solid var(--bd2);background:transparent;color:var(--mt2);border-radius:4px;cursor:pointer;transition:all .15s}
.lbtn:hover{border-color:var(--mt);color:var(--mt)}
.log-body{font-family:'JetBrains Mono',monospace;font-size:.7rem;line-height:1.55;padding:12px 14px;max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.ll{display:flex;gap:9px;align-items:baseline}
.lts{color:var(--mt2);flex-shrink:0;font-size:.62rem}
.llv{flex-shrink:0;font-size:.58rem;font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;min-width:36px;text-align:center}
.llv.info{background:rgba(96,165,250,.1);color:var(--bl)}
.llv.ok{background:rgba(62,207,142,.1);color:var(--gr)}
.llv.warn{background:rgba(245,200,66,.1);color:var(--ye)}
.llv.err{background:rgba(255,96,96,.1);color:var(--re)}
.llv.step{background:rgba(108,99,255,.15);color:var(--ac)}
.lmsg{color:var(--tx);word-break:break-all}

/* ERR */
.err{display:none;padding:12px 16px;background:rgba(255,96,96,.07);border:1px solid rgba(255,96,96,.22);border-radius:9px;color:var(--re);font-size:.81rem;margin-bottom:18px;line-height:1.6}
.err.on{display:block}

/* RESULTS */
.rbar{display:none;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid var(--bd);margin-bottom:20px;flex-wrap:wrap;gap:10px}
.rbar.on{display:flex}
.rct{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;color:var(--tx);line-height:1}
.rct em{color:var(--ac);font-style:normal}
.rmeta{font-size:.63rem;color:var(--mt2);margin-top:4px}
.acts{display:flex;gap:6px;flex-wrap:wrap}
.bsm{font-size:.66rem;font-weight:500;padding:6px 13px;border:1px solid var(--bd2);background:transparent;color:var(--mt);border-radius:7px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px;white-space:nowrap}
.bsm:hover{border-color:var(--tx);color:var(--tx)}
.bsm.hi{background:var(--ac);color:#fff;border-color:var(--ac)}
.bsm.hi:hover{background:#7c74ff}

/* SUMMARY */
.summ{font-size:.81rem;color:var(--mt);line-height:1.8;padding:13px 16px;background:var(--bg3);border-left:3px solid var(--ac);border-radius:0 7px 7px 0;margin-bottom:20px;display:none}
.summ.on{display:block}

/* FILTERS */
.fb{display:none;gap:6px;margin-bottom:18px;flex-wrap:wrap;align-items:center}
.fb.on{display:flex}
.fbl{font-size:.58rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mt2)}
.ch{font-size:.63rem;font-weight:500;padding:4px 11px;border:1px solid var(--bd2);border-radius:20px;background:transparent;color:var(--mt);cursor:pointer;transition:all .15s;white-space:nowrap}
.ch:hover,.ch.on{border-color:var(--ac);color:var(--ac)}
.ch.on{background:var(--ac);color:#fff;border-color:var(--ac)}

/* CARDS */
.cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:32px}
@media(max-width:680px){.cg{grid-template-columns:1fr}}
.cc{background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden;transition:border-color .2s,transform .2s,box-shadow .2s;animation:fu .35s ease both;display:flex;flex-direction:column}
@keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.cc:hover{border-color:var(--ac);transform:translateY(-2px);box-shadow:0 10px 36px rgba(0,0,0,.5)}
.cc-bar{height:2.5px;background:linear-gradient(90deg,var(--ac),#a78bfa);opacity:0;transition:opacity .2s}
.cc:hover .cc-bar{opacity:1}
.cc-body{padding:18px;display:flex;flex-direction:column;gap:12px;flex:1}
.cc-top{display:flex;align-items:flex-start;gap:10px}
.ava{width:40px;height:40px;border-radius:8px;background:var(--bg3);border:1px solid var(--bd2);display:grid;place-items:center;font-family:'Syne',sans-serif;font-weight:800;font-size:.9rem;color:var(--ac);flex-shrink:0;text-transform:uppercase}
.ctw{flex:1;min-width:0}
.cn{font-family:'Syne',sans-serif;font-size:.94rem;font-weight:700;color:var(--tx);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.ci{font-size:.6rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--mt2)}
.csc{text-align:right;flex-shrink:0}
.scn{font-family:'Syne',sans-serif;font-size:1.15rem;font-weight:800;line-height:1}
.scl{font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:var(--mt2);margin-top:1px}
.cd{font-size:.77rem;color:var(--mt);line-height:1.72;font-weight:300}
.dts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.dt{padding:7px 9px;background:var(--bg2);border-radius:5px;border:1px solid var(--bd)}
.dl{font-size:.5rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mt2);margin-bottom:2px}
.dv{font-size:.72rem;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr{padding:9px 11px;background:var(--bg2);border-radius:5px;border:1px solid var(--bd)}
.prl{font-size:.5rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mt2);margin-bottom:6px}
.plist{display:flex;flex-wrap:wrap;gap:4px}
.pp{font-size:.62rem;font-weight:500;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;color:var(--tx)}
.tgs{display:flex;flex-wrap:wrap;gap:4px}
.tg{font-size:.56rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;background:rgba(108,99,255,.1);color:var(--ac);border-radius:3px;border:1px solid rgba(108,99,255,.2)}
.cc-ft{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-top:1px solid var(--bd);background:var(--bg2);flex-wrap:wrap;gap:6px}
.clink{font-size:.65rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ac);text-decoration:none;display:flex;align-items:center;gap:4px;transition:gap .15s}
.clink:hover{gap:7px}
.csoc{display:flex;gap:5px}
.csoc a{font-size:.58rem;font-weight:500;color:var(--mt);padding:2px 7px;border:1px solid var(--bd2);border-radius:3px;text-decoration:none;transition:all .15s}
.csoc a:hover{border-color:var(--ac);color:var(--ac)}
.csrc{font-size:.54rem;color:var(--mt2);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* MORE */
.more{display:none;text-align:center;padding:4px 0 44px}
.more.on{display:block}
.bmore{font-family:'Syne',sans-serif;font-size:.8rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:12px 38px;background:transparent;color:var(--tx);border:1.5px solid var(--bd2);border-radius:9px;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:9px}
.bmore:hover{border-color:var(--ac);color:var(--ac)}
.bmore:disabled{opacity:.3;cursor:not-allowed}
.bmore .sp{width:13px;height:13px;border:2px solid rgba(255,255,255,.2);border-top-color:currentColor;border-radius:50%;animation:spin .65s linear infinite;display:none}
.bmore.ld .sp{display:block}
.mhint{font-size:.64rem;color:var(--mt2);margin-top:8px}

/* SOURCES */
.srcs{display:none;margin-bottom:40px;padding:18px 22px;background:var(--bg3);border-radius:10px;border:1px solid var(--bd)}
.srcs.on{display:block}
.srcs-l{font-size:.56rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mt2);margin-bottom:10px;display:flex;align-items:center;gap:8px}
.srcs-l::after{content:'';flex:1;height:1px;background:var(--bd)}
.sl{display:flex;flex-wrap:wrap;gap:6px}
.sp2{font-size:.6rem;padding:3px 10px;background:var(--bg2);border:1px solid var(--bd);border-radius:3px;color:var(--mt2);text-decoration:none;max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:block;transition:all .15s}
.sp2:hover{border-color:var(--ac);color:var(--ac)}

footer{border-top:1px solid var(--bd);padding:20px 0;text-align:center;font-size:.63rem;color:var(--mt2);line-height:1.9}
</style>
</head>
<body>

<nav>
  <div class="w nav-i">
    <a class="logo" href="/">
      <div class="logo-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg></div>
      <span class="logo-name">CompanyScout</span>
    </a>
    <span class="nav-chip">Gemini AI</span>
  </div>
</nav>

<main>
<div class="w">

  <div class="hero">
    <div class="hero-tag"><span class="dot"></span>AI-Powered Discovery</div>
    <h1>Find any company<br/>across the <span class="ac">entire web.</span></h1>
    <p class="sub">Describe what you're looking for. Our AI scrapes the web and extracts structured business intelligence instantly.</p>
    <div class="pills">
      <span class="pill"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Live web scraping</span>
      <span class="pill"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Up to 50 companies</span>
      <span class="pill"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>CSV &amp; JSON export</span>
      <span class="pill"><svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Live debug log</span>
    </div>
  </div>

  <!-- SEARCH PANEL -->
  <div class="pnl">
    <div class="pnl-hd">Configure Search</div>
    <div class="g2">
      <div class="fld full">
        <span class="lbl">What companies are you looking for?</span>
        <input id="q" type="text" placeholder="e.g. AI healthcare startups in India, SaaS fintech in Europe..." autocomplete="off"/>
        <span class="hint">Be specific — include industry, geography, stage for best results</span>
      </div>
      <div class="fld full">
        <span class="lbl">Gemini API Key</span>
        <input id="k" type="password" placeholder="AIzaSy..." autocomplete="off"/>
        <span class="hint">Free at aistudio.google.com &rarr; Create API key &rarr; Never stored on server</span>
      </div>
      <div class="fld">
        <span class="lbl">Max Companies</span>
        <select id="mx">
          <option value="10">10 companies</option>
          <option value="20" selected>20 companies</option>
          <option value="30">30 companies</option>
          <option value="50">50 companies</option>
        </select>
      </div>
      <div class="fld">
        <span class="lbl">Scan Depth</span>
        <label class="tgl">
          <input type="checkbox" id="ds"/>
          <span class="tgl-t"><b>Deep Scan</b>More pages, richer results (slower)</span>
        </label>
      </div>
      <div class="full">
        <button class="btn-go" id="goBtn">
          <div class="sp"></div>
          <span class="bt">Discover Companies &rarr;</span>
        </button>
      </div>
    </div>
  </div>

  <!-- LIVE LOG -->
  <div class="log-pnl" id="logPnl">
    <div class="log-top">
      <div class="log-ttl"><span class="ldot" id="ldot"></span>Live Log</div>
      <div class="log-acts">
        <button class="lbtn" onclick="document.getElementById('lb').innerHTML=''">Clear</button>
        <button class="lbtn" id="toggleBtn" onclick="toggleLog()">Hide</button>
      </div>
    </div>
    <div class="log-body" id="lb"></div>
  </div>

  <!-- ERROR -->
  <div class="err" id="errBox"></div>

  <!-- RESULTS BAR -->
  <div class="rbar" id="rbar">
    <div>
      <div class="rct" id="rct"><em>0</em> Companies</div>
      <div class="rmeta" id="rm"></div>
    </div>
    <div class="acts">
      <button class="bsm" id="bCSV" style="display:none" onclick="xCSV()">&#8595; CSV</button>
      <button class="bsm" id="bJSON" style="display:none" onclick="xJSON()">&#8595; JSON</button>
      <button class="bsm hi" id="bNext" style="display:none" onclick="go(true)">&#8635; Find Next Batch</button>
    </div>
  </div>

  <div class="summ" id="sm"></div>
  <div class="fb" id="fb"></div>
  <div class="cg" id="cg"></div>

  <div class="more" id="moreDiv">
    <button class="bmore" id="moreBtn" onclick="go(true)">
      <div class="sp"></div><span>Find Next Companies &rarr;</span>
    </button>
    <div class="mhint">New queries, fresh results</div>
  </div>

  <div class="srcs" id="srcDiv">
    <div class="srcs-l">Pages Scraped</div>
    <div class="sl" id="srcList"></div>
  </div>

</div>
</main>
<footer><div class="w">CompanyScout &mdash; Keys never stored &mdash; Built with Express, Cheerio &amp; Google Gemini</div></footer>

<script>
(function(){
  var allCos=[], curQ='', isNext=false, offset=0, logOpen=true;

  // ── Log helpers ───────────────────────────────────────────────────
  function ts(){
    var d=new Date();
    return d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0');
  }
  function addLog(lvl, msg){
    var lb=document.getElementById('lb');
    var ll=document.createElement('div'); ll.className='ll';
    ll.innerHTML='<span class="lts">'+ts()+'</span><span class="llv '+lvl+'">'+lvl.toUpperCase()+'</span><span class="lmsg">'+String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>';
    lb.appendChild(ll);
    lb.scrollTop=lb.scrollHeight;
    if(lb.children.length>300) lb.removeChild(lb.firstChild);
  }

  window.toggleLog=function(){
    var lb=document.getElementById('lb');
    var btn=document.getElementById('toggleBtn');
    logOpen=!logOpen;
    lb.style.display=logOpen?'':'none';
    btn.textContent=logOpen?'Hide':'Show';
  };

  // ── Server log injector (after response) ──────────────────────────
  function injectServerLogs(logs){
    if(!Array.isArray(logs)) return;
    logs.forEach(function(l){ addLog(l.level||'info','[SERVER] '+l.msg); });
  }

  // ── Main search ───────────────────────────────────────────────────
  window.go=function(next){
    var query=document.getElementById('q').value.trim();
    var apiKey=document.getElementById('k').value.trim();
    var maxResults=parseInt(document.getElementById('mx').value,10);
    var deepScrape=document.getElementById('ds').checked;

    addLog('info','=== Button clicked ===');
    addLog('info','Query: "'+query+'"');
    addLog('info','API key starts with: '+(apiKey.slice(0,8)||'(empty)'));

    if(!query){ addLog('err','No query'); showErr('Please enter a search query.'); return; }
    if(!apiKey){ addLog('err','No API key'); showErr('Please enter your Gemini API key.'); return; }

    isNext=!!next; curQ=query;
    hideErr();
    document.getElementById('ldot').classList.add('live');

    if(isNext){
      offset+=allCos.length||0;
      setMoreLoading(true);
      addLog('info','Next batch — offset: '+offset);
    } else {
      offset=0; allCos=[];
      setLoading(true);
      clearResults();
    }

    addLog('step','Sending POST /api/search…');

    var t0=Date.now();
    fetch('/api/search',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:query,apiKey:apiKey,maxResults:maxResults,deepScrape:deepScrape,offset:offset})
    })
    .then(function(resp){
      addLog('info','HTTP '+resp.status+' after '+(Date.now()-t0)+'ms');
      return resp.text().then(function(text){
        addLog('info','Response: '+text.length+' bytes');
        addLog('info','Preview: '+text.slice(0,120));
        var data;
        try{ data=JSON.parse(text); }
        catch(pe){
          addLog('err','JSON parse failed: '+pe.message);
          throw new Error('Invalid server response: '+text.slice(0,100));
        }
        if(!resp.ok){
          if(data.logs) injectServerLogs(data.logs);
          throw new Error(data.error||'Server error '+resp.status);
        }
        return data;
      });
    })
    .then(function(data){
      if(data.logs) injectServerLogs(data.logs);
      var cos=data.companies||[];
      addLog('ok','Got '+cos.length+' companies');
      if(data.meta) addLog('info','Pages scraped: '+data.meta.pagesScraped+' | Queries: '+(data.meta.queriesUsed||[]).length);
      allCos=isNext?allCos.concat(cos):cos;
      isNext?appendCards(cos,allCos.length-cos.length):renderAll(data);
      updateBar(allCos.length,data);
      addLog('ok','=== Done. Total: '+allCos.length+' companies ===');
    })
    .catch(function(err){
      addLog('err','ERROR: '+err.message);
      showErr(err.message);
    })
    .finally(function(){
      setLoading(false);
      setMoreLoading(false);
      document.getElementById('ldot').classList.remove('live');
    });
  };

  // wire button
  document.getElementById('goBtn').addEventListener('click', function(){ go(false); });
  document.addEventListener('keydown', function(e){
    if(e.key==='Enter'&&(e.target.id==='q'||e.target.id==='k')) go(false);
  });

  // ── Render ────────────────────────────────────────────────────────
  function renderAll(d){
    var cos=d.companies||[];
    document.getElementById('rbar').classList.add('on');
    if(d.summary){ var s=document.getElementById('sm'); s.textContent=d.summary; s.classList.add('on'); }
    buildFilters(cos);
    cos.forEach(function(c,i){ document.getElementById('cg').appendChild(mkCard(c,i)); });
    if(d.searchedUrls&&d.searchedUrls.length){
      document.getElementById('srcDiv').classList.add('on');
      var sl=document.getElementById('srcList');
      d.searchedUrls.slice(0,24).forEach(function(u){
        var a=document.createElement('a'); a.className='sp2'; a.href=u; a.target='_blank'; a.rel='noopener';
        try{ a.textContent=new URL(u).hostname; }catch{ a.textContent=u; }
        sl.appendChild(a);
      });
    }
    if(cos.length){
      ['bCSV','bJSON','bNext'].forEach(function(id){ document.getElementById(id).style.display='flex'; });
      document.getElementById('moreDiv').classList.add('on');
    }
  }

  function appendCards(cos,si){
    cos.forEach(function(c,i){ document.getElementById('cg').appendChild(mkCard(c,si+i)); });
    document.getElementById('moreDiv').classList.add('on');
  }

  function updateBar(n,d){
    document.getElementById('rct').innerHTML='<em>'+n+'</em> Compan'+(n===1?'y':'ies')+' Found';
    document.getElementById('rm').textContent=(d.meta&&d.meta.pagesScraped||0)+' pages \u00b7 '+(d.meta&&d.meta.queriesUsed&&d.meta.queriesUsed.length||0)+' queries'+(isNext?' \u00b7 expanded':'');
  }

  function buildFilters(cos){
    var inds=[]; cos.forEach(function(c){ if(c.industry&&inds.indexOf(c.industry)===-1) inds.push(c.industry); });
    var bar=document.getElementById('fb');
    bar.innerHTML='<span class="fbl">Industry:</span><span class="ch on" data-ind="all">All</span>';
    inds.slice(0,8).forEach(function(ind){
      var s=document.createElement('span'); s.className='ch'; s.textContent=ind; s.dataset.ind=ind; bar.appendChild(s);
    });
    bar.classList.add('on');
    bar.addEventListener('click',function(e){
      var ch=e.target.closest('.ch'); if(!ch) return;
      document.querySelectorAll('.ch').forEach(function(x){ x.classList.remove('on'); });
      ch.classList.add('on');
      var ind=ch.dataset.ind;
      document.querySelectorAll('.cc').forEach(function(c){
        c.style.display=(ind==='all'||c.dataset.ind===ind)?'':'none';
      });
    });
  }

  function mkCard(c,idx){
    var card=document.createElement('div'); card.className='cc'; card.dataset.ind=c.industry||'';
    card.style.animationDelay=Math.min(idx,12)*42+'ms';
    var sc=c.relevanceScore||0;
    var cc=sc>=80?'#3ecf8e':sc>=60?'#6c63ff':'#888799';
    var init=(c.name||'?').split(' ').map(function(w){ return w[0]||''; }).join('').slice(0,2).toUpperCase();
    var site=c.website||c.source||'#';
    var dets=[];
    if(c.founded) dets.push({l:'Founded',v:c.founded});
    if(c.location) dets.push({l:'Location',v:c.location});
    if(c.size) dets.push({l:'Size',v:c.size});
    if(c.funding) dets.push({l:'Funding',v:c.funding});
    var dHTML=dets.length?'<div class="dts">'+dets.map(function(d){ return '<div class="dt"><div class="dl">'+x(d.l)+'</div><div class="dv" title="'+x(d.v)+'">'+x(d.v)+'</div></div>'; }).join('')+'</div>':'';
    var pHTML=c.keyProducts&&c.keyProducts.length?'<div class="pr"><div class="prl">Key Products</div><div class="plist">'+c.keyProducts.slice(0,5).map(function(p){ return '<span class="pp">'+x(p)+'</span>'; }).join('')+'</div></div>':'';
    var tHTML=c.tags&&c.tags.length?'<div class="tgs">'+c.tags.slice(0,6).map(function(t){ return '<span class="tg">'+x(t)+'</span>'; }).join('')+'</div>':'';
    var soc='';
    if(c.socialLinks&&c.socialLinks.linkedin) soc+='<a href="'+x(c.socialLinks.linkedin)+'" target="_blank" rel="noopener">LinkedIn &#8599;</a>';
    if(c.socialLinks&&c.socialLinks.twitter) soc+='<a href="'+x(c.socialLinks.twitter)+'" target="_blank" rel="noopener">Twitter &#8599;</a>';
    var srcDom=''; try{ srcDom=new URL(c.source||site).hostname; }catch{}
    card.innerHTML='<div class="cc-bar"></div><div class="cc-body"><div class="cc-top"><div class="ava">'+init+'</div><div class="ctw"><div class="cn" title="'+x(c.name)+'">'+x(c.name)+'</div><div class="ci">'+x(c.industry||'\u2014')+'</div></div><div class="csc"><div class="scn" style="color:'+cc+'">'+sc+'%</div><div class="scl">match</div></div></div><div class="cd">'+x(c.description||'')+'</div>'+dHTML+pHTML+tHTML+'</div><div class="cc-ft"><a class="clink" href="'+x(site)+'" target="_blank" rel="noopener">Visit Site &#8594;</a><div class="csoc">'+soc+'</div>'+(srcDom?'<span class="csrc">'+srcDom+'</span>':'')+'</div>';
    return card;
  }

  function x(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  window.xJSON=function(){
    var b=new Blob([JSON.stringify({query:curQ,total:allCos.length,companies:allCos},null,2)],{type:'application/json'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='companyscout-'+Date.now()+'.json'; a.click();
  };
  window.xCSV=function(){
    var h=['Name','Website','Industry','Founded','Location','Size','Funding','Description','Tags','Score','LinkedIn','Twitter'];
    var r=allCos.map(function(c){ return [c.name,c.website,c.industry,c.founded,c.location,c.size,c.funding,c.description,(c.tags||[]).join('; '),c.relevanceScore,c.socialLinks&&c.socialLinks.linkedin||'',c.socialLinks&&c.socialLinks.twitter||''].map(function(v){ return '"'+String(v||'').replace(/"/g,'""')+'"'; }).join(','); });
    var b=new Blob([[h.join(',')].concat(r).join('\n')],{type:'text/csv'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='companyscout-'+Date.now()+'.csv'; a.click();
  };

  function clearResults(){
    document.getElementById('cg').innerHTML='';
    document.getElementById('srcList').innerHTML='';
    document.getElementById('fb').innerHTML='';
    ['rbar','sm','fb','srcDiv','moreDiv'].forEach(function(id){ document.getElementById(id).classList.remove('on'); });
    ['bCSV','bJSON','bNext'].forEach(function(id){ document.getElementById(id).style.display='none'; });
    allCos=[];
  }
  function setLoading(v){ var b=document.getElementById('goBtn'); b.disabled=v; b.classList.toggle('ld',v); }
  function setMoreLoading(v){ var b=document.getElementById('moreBtn'); b.disabled=v; b.classList.toggle('ld',v); var b2=document.getElementById('bNext'); if(b2) b2.disabled=v; }
  function showErr(m){ var e=document.getElementById('errBox'); e.innerHTML='<b>Error:</b> '+m; e.classList.add('on'); }
  function hideErr(){ document.getElementById('errBox').classList.remove('on'); }

  addLog('info','CompanyScout ready');
  addLog('info','Enter your query and Gemini API key, then click Discover');
})();
</script>
</body>
</html>`;
