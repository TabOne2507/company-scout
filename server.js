import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security & Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "10mb" }));

// Resolve public directory — works locally and on Render/Railway/Fly
const publicDir = join(__dirname, "public");
console.log(`📁 Serving static files from: ${publicDir} (exists: ${existsSync(publicDir)})`);
app.use(express.static(publicDir));

// Explicit root + catch-all so "Cannot GET /" never appears
app.get("/", (_, res) => res.sendFile(join(publicDir, "index.html")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Search DuckDuckGo HTML (no API key needed) */
async function searchDuckDuckGo(query, maxResults = 12) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
      if (title && (link || href)) {
        results.push({ title, snippet, url: link || `https://${href}` });
      }
      if (results.length >= maxResults) return false;
    });
    return results;
  } catch (err) {
    console.error("DDG search error:", err.message);
    return [];
  }
}

/** Scrape a page and return text content */
async function scrapePage(url, maxLen = 4000) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CompanyScoutBot/1.0; +https://companyscout.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 5,
    });
    const $ = cheerio.load(data);
    $("script, style, nav, footer, header, aside, .cookie, .popup, noscript, svg").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, maxLen);
    const title = $("title").text().trim();
    const description = $('meta[name="description"]').attr("content") || "";
    return { text, title, description, url };
  } catch {
    return null;
  }
}

/** Use OpenAI to extract structured company data from scraped text */
async function extractCompanyData(openai, pages, originalQuery) {
  const context = pages
    .filter(Boolean)
    .map(
      (p, i) =>
        `--- Source ${i + 1}: ${p.url} ---\nTitle: ${p.title}\nDescription: ${p.description}\n${p.text}`
    )
    .join("\n\n");

  const prompt = `You are an expert business intelligence analyst. Based on the web content below, extract information about companies relevant to the user's query: "${originalQuery}".

Return a JSON object with this structure:
{
  "companies": [
    {
      "name": "Company Name",
      "website": "https://...",
      "description": "2-3 sentence description",
      "industry": "Primary industry/sector",
      "founded": "Year or null",
      "location": "City, Country or null",
      "size": "Startup/SMB/Mid-size/Enterprise or null",
      "keyProducts": ["product1", "product2"],
      "tags": ["tag1", "tag2", "tag3"],
      "relevanceScore": 85,
      "contactEmail": "email or null",
      "socialLinks": {"linkedin": "url or null", "twitter": "url or null"},
      "source": "URL where found"
    }
  ],
  "summary": "Brief 2-sentence summary of findings",
  "totalFound": 0
}

Rules:
- Only include REAL companies with verifiable info
- relevanceScore: 0-100 based on match to query
- Extract only companies clearly mentioned or described in the content
- If a field is unknown, use null
- Return max 15 companies, prioritize most relevant
- Do NOT invent data — only use what's in the sources
- Return ONLY valid JSON, no markdown fences

WEB CONTENT:
${context.slice(0, 20000)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content;
  const parsed = JSON.parse(raw);
  return parsed;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/** Health check */
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date() }));

/** Main search endpoint */
app.post("/api/search", async (req, res) => {
  const { query, apiKey, maxResults = 10, deepScrape = false } = req.body;

  if (!query?.trim()) return res.status(400).json({ error: "Query is required." });
  if (!apiKey?.trim()) return res.status(400).json({ error: "OpenAI API key is required." });
  if (query.length > 300) return res.status(400).json({ error: "Query too long." });

  try {
    const openai = new OpenAI({ apiKey: apiKey.trim() });

    // Step 1: Generate optimized search queries via OpenAI
    const queryGen = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Generate 3 diverse Google/web search queries to find companies matching: "${query}". 
Return JSON: {"queries": ["query1", "query2", "query3"]}
Make them specific and varied. Focus on finding company websites and lists.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.4,
    });

    const { queries } = JSON.parse(queryGen.choices[0].message.content);
    const searchQueries = [query, ...(queries || [])].slice(0, 4);

    // Step 2: Search DuckDuckGo for each query
    const searchLimit = deepScrape ? 6 : 4;
    const allResults = [];
    for (const q of searchQueries) {
      const results = await searchDuckDuckGo(q, searchLimit);
      allResults.push(...results);
    }

    // Deduplicate URLs
    const seen = new Set();
    const uniqueResults = allResults.filter((r) => {
      try {
        const host = new URL(r.url).hostname;
        if (seen.has(host)) return false;
        seen.add(host);
        return true;
      } catch {
        return false;
      }
    });

    const topResults = uniqueResults.slice(0, deepScrape ? 15 : 10);

    // Step 3: Scrape pages concurrently
    const scrapeLimit = deepScrape ? 12 : 8;
    const pages = await Promise.all(
      topResults.slice(0, scrapeLimit).map((r) => scrapePage(r.url))
    );

    // Augment with search snippets for pages that failed to scrape
    const enrichedPages = pages.map((page, i) => {
      if (page) return page;
      const r = topResults[i];
      return {
        text: r.snippet || "",
        title: r.title || "",
        description: r.snippet || "",
        url: r.url,
      };
    });

    // Step 4: Extract company data with OpenAI
    const result = await extractCompanyData(openai, enrichedPages, query);
    result.totalFound = result.companies?.length || 0;

    if (result.companies) {
      result.companies.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }

    return res.json({
      success: true,
      query,
      ...result,
      searchedUrls: topResults.map((r) => r.url),
      meta: {
        queriesUsed: searchQueries,
        pagesScraped: enrichedPages.filter(Boolean).length,
        deepScrape,
      },
    });
  } catch (err) {
    console.error("Search error:", err.message);
    if (err.status === 401 || err.message?.includes("API key")) {
      return res.status(401).json({ error: "Invalid OpenAI API key." });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: "OpenAI rate limit reached. Try again soon." });
    }
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── Catch-all: serve index.html for any unmatched GET (SPA fallback) ──────────
app.get("*", (_, res) => res.sendFile(join(publicDir, "index.html")));

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 CompanyScout running on http://0.0.0.0:${PORT}`);
});
