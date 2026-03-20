// CompanyScout – server.js
// No helmet (it blocks inline scripts via CSP)
// No @google/generative-ai (plain axios REST call instead)
// HTML served from public/index.html (real file, no inline send tricks)

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({
  windowMs : 15 * 60 * 1000,
  max      : 100,
  standardHeaders: true,
  legacyHeaders  : false,
}));

// Serve the public folder (contains index.html)
app.use(express.static(path.join(__dirname, "public")));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Main search endpoint ──────────────────────────────────────────────────────
app.post("/api/search", async (req, res) => {
  const logs = [];

  function log(lvl, msg) {
    const entry = { ts: new Date().toISOString(), lvl, msg };
    logs.push(entry);
    console.log("[" + lvl.toUpperCase() + "] " + msg);
  }

  const {
    query      = "",
    apiKey     = "",
    maxResults = 20,
    deepScrape = false,
    offset     = 0,
  } = req.body || {};

  log("info", "Request received");
  log("info", "query=" + query + " | max=" + maxResults + " | deep=" + deepScrape + " | offset=" + offset);

  // ── Validate ────────────────────────────────────────────────────────────────
  if (!query.trim()) {
    return res.status(400).json({ error: "Query is required.", logs });
  }
  if (!apiKey.trim()) {
    return res.status(400).json({ error: "Gemini API key is required.", logs });
  }
  if (query.length > 400) {
    return res.status(400).json({ error: "Query too long (max 400 chars).", logs });
  }

  try {

    // ── Step 1: Generate better search queries with Gemini ──────────────────
    log("step", "Generating search queries with Gemini...");
    let extraQueries = [];
    try {
      const qText = await callGemini(
        apiKey,
        "Generate 3 different web search queries to find companies matching: \"" + query + "\".\n" +
        (offset > 0 ? "This is search batch #" + (Math.floor(offset / maxResults) + 2) + " — make queries different to discover NEW companies.\n" : "") +
        "Return ONLY valid JSON with no markdown, no backticks: {\"queries\":[\"q1\",\"q2\",\"q3\"]}",
        0.6
      );
      log("info", "Gemini query response: " + qText.slice(0, 150));
      const parsed = JSON.parse(qText);
      extraQueries = Array.isArray(parsed.queries) ? parsed.queries : [];
      log("ok", "Got " + extraQueries.length + " extra queries");
    } catch (e) {
      log("warn", "Query gen skipped (" + e.message + ") — using original only");
    }

    const allQueries = [query].concat(extraQueries).slice(0, 4);
    log("info", "Search queries: " + JSON.stringify(allQueries));

    // ── Step 2: DuckDuckGo search ───────────────────────────────────────────
    log("step", "Searching DuckDuckGo...");
    const rawResults = [];
    for (let i = 0; i < allQueries.length; i++) {
      const q = allQueries[i];
      const r = await ddgSearch(q, deepScrape ? 7 : 5);
      log("info", "DDG [" + q.slice(0, 50) + "] -> " + r.length + " results");
      for (let j = 0; j < r.length; j++) rawResults.push(r[j]);
    }

    // Deduplicate by hostname
    const seenHosts = new Set();
    const unique = [];
    for (let i = 0; i < rawResults.length; i++) {
      const item = rawResults[i];
      try {
        const h = new URL(item.url).hostname;
        if (!seenHosts.has(h)) { seenHosts.add(h); unique.push(item); }
      } catch (_) { /* skip bad URLs */ }
    }
    log("ok", unique.length + " unique URLs (deduped from " + rawResults.length + ")");

    const toScrape = unique.slice(0, deepScrape ? 18 : 12);

    // ── Step 3: Scrape pages ────────────────────────────────────────────────
    log("step", "Scraping " + toScrape.length + " pages...");
    const pages = [];
    for (let i = 0; i < toScrape.length; i++) {
      const item = toScrape[i];
      const p = await scrapePage(item.url);
      if (p && p.text.length > 60) {
        log("info", "  OK  " + item.url.slice(0, 70));
        pages.push(p);
      } else {
        log("info", "  FAIL " + item.url.slice(0, 70) + " — using snippet");
        pages.push({
          url        : item.url,
          title      : item.title || "",
          description: item.snippet || "",
          text       : item.snippet || "",
        });
      }
    }
    const goodCount = pages.filter(function(p) { return p.text.length > 60; }).length;
    log("ok", goodCount + "/" + pages.length + " pages with real content");

    // ── Step 4: Build context ───────────────────────────────────────────────
    const contextParts = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      contextParts.push(
        "[Source " + (i + 1) + "]\n" +
        "URL: " + p.url + "\n" +
        "Title: " + p.title + "\n" +
        "Meta: " + p.description + "\n" +
        "Content: " + p.text
      );
    }
    const context = contextParts.join("\n\n---\n\n").slice(0, 26000);
    log("info", "Context size: " + context.length + " chars");

    // ── Step 5: Extract companies with Gemini ───────────────────────────────
    log("step", "Extracting company data with Gemini...");

    const prompt =
      "You are a business intelligence analyst.\n" +
      "The user wants to find: \"" + query + "\"\n\n" +
      "Extract companies from the web content below that match this request.\n\n" +
      "Return ONLY a raw JSON object — no markdown, no code blocks, no explanation.\n\n" +
      "Use this exact schema:\n" +
      "{\n" +
      "  \"companies\": [\n" +
      "    {\n" +
      "      \"name\": \"string\",\n" +
      "      \"website\": \"string or null\",\n" +
      "      \"description\": \"3-4 sentence detailed description\",\n" +
      "      \"industry\": \"string\",\n" +
      "      \"founded\": \"YYYY or null\",\n" +
      "      \"location\": \"City, Country or null\",\n" +
      "      \"size\": \"Startup or SMB or Mid-size or Enterprise or null\",\n" +
      "      \"funding\": \"stage or amount or null\",\n" +
      "      \"keyProducts\": [\"string\"],\n" +
      "      \"tags\": [\"string\"],\n" +
      "      \"relevanceScore\": 85,\n" +
      "      \"contactEmail\": \"string or null\",\n" +
      "      \"socialLinks\": { \"linkedin\": \"string or null\", \"twitter\": \"string or null\" },\n" +
      "      \"source\": \"string\"\n" +
      "    }\n" +
      "  ],\n" +
      "  \"summary\": \"2-3 sentences about the findings\",\n" +
      "  \"totalFound\": 0\n" +
      "}\n\n" +
      "Rules:\n" +
      "- Only REAL, verifiable companies\n" +
      "- Max " + Math.min(maxResults, 20) + " companies\n" +
      "- relevanceScore 0-100\n" +
      "- Do NOT invent any data\n" +
      "- Output ONLY the JSON object, nothing else\n\n" +
      "Web content:\n" + context;

    let rawJSON = "";
    try {
      rawJSON = await callGemini(apiKey, prompt, 0.1);
      log("info", "Gemini response length: " + rawJSON.length + " chars");
      log("info", "Preview: " + rawJSON.slice(0, 180));
    } catch (ge) {
      log("err", "Gemini call failed: " + ge.message);
      throw ge;
    }

    let extracted;
    try {
      extracted = JSON.parse(rawJSON);
    } catch (pe) {
      log("err", "JSON parse failed: " + pe.message);
      log("err", "Raw was: " + rawJSON.slice(0, 300));
      throw new Error("Gemini returned invalid JSON — " + pe.message);
    }

    // Sort by relevance
    if (Array.isArray(extracted.companies)) {
      extracted.companies.sort(function(a, b) {
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      });
    }
    extracted.totalFound = (extracted.companies || []).length;

    log("ok", "Done — " + extracted.totalFound + " companies extracted");

    return res.json({
      success     : true,
      query       : query,
      companies   : extracted.companies || [],
      summary     : extracted.summary || "",
      totalFound  : extracted.totalFound,
      searchedUrls: toScrape.map(function(r) { return r.url; }),
      logs        : logs,
      meta        : {
        queriesUsed : allQueries,
        pagesScraped: goodCount,
        deepScrape  : deepScrape,
        offset      : offset,
      },
    });

  } catch (err) {
    log("err", "FATAL: " + err.message);
    if (err.response) {
      log("err", "HTTP status: " + err.response.status);
      log("err", "Response data: " + JSON.stringify(err.response.data).slice(0, 200));
    }

    const status  = err.response && err.response.status === 400 ? 401
                  : err.response && err.response.status === 429 ? 429
                  : 500;
    const message = status === 401 ? "Invalid Gemini API key. Get a free key at aistudio.google.com"
                  : status === 429 ? "Gemini rate limit hit — wait 60 seconds and retry"
                  : err.message || "Internal server error";

    return res.status(status).json({ error: message, logs });
  }
});

// ── Fallback: serve index.html for all non-API routes ────────────────────────
app.get("*", function(req, res) {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", function() {
  console.log("CompanyScout v4 running on http://0.0.0.0:" + PORT);
});

// ═════════════════════════════════════════════════════════════════════════════
// HELPER: Gemini REST (no npm package — plain HTTP)
// ═════════════════════════════════════════════════════════════════════════════
async function callGemini(apiKey, prompt, temperature) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
    apiKey.trim();

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature   : temperature || 0.2,
      maxOutputTokens: 8192,
    },
  };

  const response = await axios.post(url, body, {
    timeout: 60000,
    headers: { "Content-Type": "application/json" },
  });

  const text =
    response.data &&
    response.data.candidates &&
    response.data.candidates[0] &&
    response.data.candidates[0].content &&
    response.data.candidates[0].content.parts &&
    response.data.candidates[0].content.parts[0] &&
    response.data.candidates[0].content.parts[0].text
      ? response.data.candidates[0].content.parts[0].text
      : "";

  // Strip markdown code fences if Gemini wraps in ```json ... ```
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPER: DuckDuckGo HTML search
// ═════════════════════════════════════════════════════════════════════════════
async function ddgSearch(query, maxResults) {
  maxResults = maxResults || 6;
  try {
    const response = await axios.get(
      "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
      {
        headers: {
          "User-Agent"     : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 12000,
      }
    );

    const $ = cheerio.load(response.data);
    const results = [];

    $(".result__body").each(function(_, el) {
      const title   = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      const href    = $(el).find(".result__url").attr("href") || $(el).find("a.result__url").text().trim();
      const link    = $(el).find("a.result__a").attr("href");
      const url     = link || ("https://" + href);

      if (title && url) {
        results.push({ title, snippet, url });
      }
      if (results.length >= maxResults) return false;
    });

    return results;
  } catch (_) {
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPER: Scrape a web page
// ═════════════════════════════════════════════════════════════════════════════
async function scrapePage(url) {
  try {
    const response = await axios.get(url, {
      timeout     : 8000,
      maxRedirects: 4,
      headers     : {
        "User-Agent": "Mozilla/5.0 (compatible; CompanyScoutBot/4.0)",
        "Accept"    : "text/html,application/xhtml+xml",
      },
    });

    const $ = cheerio.load(response.data);
    $("script, style, nav, footer, header, aside, noscript, svg, iframe").remove();

    return {
      url,
      title      : $("title").text().trim().slice(0, 120),
      description: ($("meta[name='description']").attr("content") || "").slice(0, 200),
      text       : $("body").text().replace(/\s+/g, " ").trim().slice(0, 4500),
    };
  } catch (_) {
    return null;
  }
}
