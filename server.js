// CompanyScout v4 – server.js
// HTML is written to disk at startup so it always exists in any environment
// No helmet, no @google/generative-ai, no template literals

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import axios from "axios";
import * as cheerio from "cheerio";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Write index.html to disk at startup (works in Docker, Render, Railway, etc) ─
const _publicDir = path.join(__dirname, "public");
const _htmlPath  = path.join(_publicDir, "index.html");
const _htmlContent = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>CompanyScout — AI Company Discovery</title>\n  <link\n    href=\"https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap\"\n    rel=\"stylesheet\"\n  />\n  <style>\n    /* ── Reset ── */\n    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n\n    /* ── Tokens ── */\n    :root {\n      --bg:    #0c0c10;\n      --bg2:   #111116;\n      --bg3:   #17171d;\n      --bg4:   #1d1d24;\n      --bd:    #22222c;\n      --bd2:   #2c2c3a;\n      --tx:    #eeedf2;\n      --mt:    #888799;\n      --mt2:   #50505f;\n      --ac:    #6c63ff;\n      --acg:   rgba(108,99,255,.15);\n      --gr:    #3ecf8e;\n      --ye:    #f5c842;\n      --re:    #ff6060;\n      --bl:    #60a5fa;\n      --card:  #0f0f14;\n      --r:     10px;\n    }\n\n    html { font-size: 16px; scroll-behavior: smooth; }\n    body {\n      font-family: Inter, sans-serif;\n      background: var(--bg);\n      color: var(--tx);\n      min-height: 100vh;\n      overflow-x: hidden;\n      line-height: 1.6;\n    }\n\n    /* Scrollbar */\n    ::-webkit-scrollbar { width: 5px; height: 5px; }\n    ::-webkit-scrollbar-track { background: var(--bg2); }\n    ::-webkit-scrollbar-thumb { background: var(--bd2); border-radius: 3px; }\n\n    /* Layout */\n    .w { max-width: 1100px; margin: 0 auto; padding: 0 28px; }\n    @media (max-width: 600px) { .w { padding: 0 14px; } }\n\n    /* ── Nav ── */\n    nav {\n      padding: 14px 0;\n      border-bottom: 1px solid var(--bd);\n      background: rgba(12,12,16,.96);\n      backdrop-filter: blur(20px);\n      position: sticky;\n      top: 0;\n      z-index: 100;\n    }\n    .nav-inner { display: flex; align-items: center; justify-content: space-between; }\n    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }\n    .brand-icon {\n      width: 32px; height: 32px;\n      background: var(--ac);\n      border-radius: 8px;\n      display: grid; place-items: center;\n      flex-shrink: 0;\n    }\n    .brand-icon svg { width: 17px; height: 17px; stroke: #fff; fill: none; stroke-width: 2.2; }\n    .brand-name {\n      font-family: Syne, sans-serif;\n      font-size: 1.1rem;\n      font-weight: 800;\n      color: var(--tx);\n      letter-spacing: -.02em;\n    }\n    .nav-pill {\n      font-size: .6rem;\n      font-weight: 600;\n      letter-spacing: .1em;\n      text-transform: uppercase;\n      color: var(--mt);\n      background: var(--bg3);\n      border: 1px solid var(--bd2);\n      padding: 4px 11px;\n      border-radius: 20px;\n    }\n\n    /* ── Hero ── */\n    .hero { padding: 52px 0 40px; }\n    .hero-tag {\n      display: inline-flex;\n      align-items: center;\n      gap: 7px;\n      font-size: .67rem;\n      font-weight: 600;\n      letter-spacing: .1em;\n      text-transform: uppercase;\n      color: var(--ac);\n      background: var(--acg);\n      border: 1px solid rgba(108,99,255,.3);\n      padding: 5px 13px;\n      border-radius: 20px;\n      margin-bottom: 20px;\n    }\n    .blink { width: 6px; height: 6px; background: var(--ac); border-radius: 50%; animation: blink 1.8s infinite; }\n    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }\n\n    h1 {\n      font-family: Syne, sans-serif;\n      font-size: clamp(2rem, 4.2vw, 3.3rem);\n      font-weight: 800;\n      line-height: 1.05;\n      letter-spacing: -.04em;\n      color: var(--tx);\n      max-width: 640px;\n      margin-bottom: 16px;\n    }\n    h1 .hi { color: var(--ac); }\n\n    .hero-sub {\n      font-size: .9rem;\n      color: var(--mt);\n      max-width: 460px;\n      line-height: 1.85;\n      font-weight: 300;\n      margin-bottom: 32px;\n    }\n\n    .features { display: flex; gap: 10px; flex-wrap: wrap; }\n    .feat {\n      display: flex;\n      align-items: center;\n      gap: 7px;\n      font-size: .72rem;\n      font-weight: 500;\n      color: var(--mt);\n      background: var(--bg3);\n      border: 1px solid var(--bd);\n      padding: 6px 13px;\n      border-radius: 7px;\n    }\n    .feat svg { width: 13px; height: 13px; stroke: var(--ac); fill: none; stroke-width: 2; flex-shrink: 0; }\n\n    /* ── Panel ── */\n    .panel {\n      background: var(--card);\n      border: 1px solid var(--bd);\n      border-radius: 14px;\n      padding: 30px;\n      margin-bottom: 26px;\n    }\n    .panel-title {\n      font-size: .6rem;\n      font-weight: 700;\n      letter-spacing: .14em;\n      text-transform: uppercase;\n      color: var(--mt2);\n      margin-bottom: 22px;\n      display: flex;\n      align-items: center;\n      gap: 10px;\n    }\n    .panel-title::after { content: \"\"; flex: 1; height: 1px; background: var(--bd); }\n\n    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }\n    @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }\n    .span2 { grid-column: 1 / -1; }\n\n    .field { display: flex; flex-direction: column; gap: 6px; }\n    .field-label {\n      font-size: .63rem;\n      font-weight: 600;\n      letter-spacing: .08em;\n      text-transform: uppercase;\n      color: var(--mt);\n    }\n    .field-hint { font-size: .59rem; color: var(--mt2); margin-top: 2px; }\n\n    input, select {\n      font-family: Inter, sans-serif;\n      font-size: .86rem;\n      padding: 12px 14px;\n      border: 1px solid var(--bd2);\n      border-radius: 8px;\n      background: var(--bg2);\n      color: var(--tx);\n      outline: none;\n      transition: border-color .15s, box-shadow .15s;\n      width: 100%;\n    }\n    input:focus, select:focus {\n      border-color: var(--ac);\n      box-shadow: 0 0 0 3px var(--acg);\n    }\n    input::placeholder { color: var(--mt2); font-weight: 300; }\n    select option { background: var(--bg2); }\n\n    .toggle {\n      display: flex;\n      align-items: center;\n      gap: 11px;\n      padding: 12px 14px;\n      border: 1px solid var(--bd2);\n      border-radius: 8px;\n      background: var(--bg2);\n      cursor: pointer;\n      user-select: none;\n      transition: border-color .15s;\n    }\n    .toggle:hover { border-color: var(--ac); }\n    .toggle input[type=\"checkbox\"] { width: 15px; height: 15px; accent-color: var(--ac); flex-shrink: 0; cursor: pointer; }\n    .toggle-text { font-size: .82rem; color: var(--mt); line-height: 1.4; }\n    .toggle-text b { color: var(--tx); font-weight: 500; display: block; margin-bottom: 2px; }\n\n    /* ── Search button ── */\n    #searchBtn {\n      width: 100%;\n      font-family: Syne, sans-serif;\n      font-size: .92rem;\n      font-weight: 700;\n      letter-spacing: .05em;\n      text-transform: uppercase;\n      padding: 16px 24px;\n      background: var(--ac);\n      color: #fff;\n      border: none;\n      border-radius: 10px;\n      cursor: pointer;\n      transition: background .15s, box-shadow .15s, opacity .1s;\n      display: flex;\n      align-items: center;\n      justify-content: center;\n      gap: 11px;\n      box-shadow: 0 4px 18px rgba(108,99,255,.34);\n    }\n    #searchBtn:hover { background: #7c74ff; box-shadow: 0 6px 26px rgba(108,99,255,.5); }\n    #searchBtn:active { opacity: .9; }\n    #searchBtn:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }\n    .spin {\n      display: none;\n      width: 17px; height: 17px;\n      border: 2.5px solid rgba(255,255,255,.3);\n      border-top-color: #fff;\n      border-radius: 50%;\n      animation: rotate .65s linear infinite;\n      flex-shrink: 0;\n    }\n    @keyframes rotate { to { transform: rotate(360deg); } }\n    #searchBtn.busy .spin { display: block; }\n    #searchBtn.busy .btn-label { opacity: .55; }\n\n    /* ── Live log ── */\n    #logPanel {\n      background: var(--bg2);\n      border: 1px solid var(--bd2);\n      border-radius: 12px;\n      margin-bottom: 24px;\n      overflow: hidden;\n    }\n    .log-header {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 9px 15px;\n      border-bottom: 1px solid var(--bd);\n      background: var(--bg3);\n    }\n    .log-title {\n      display: flex;\n      align-items: center;\n      gap: 8px;\n      font-size: .6rem;\n      font-weight: 700;\n      letter-spacing: .1em;\n      text-transform: uppercase;\n      color: var(--mt);\n    }\n    #logDot { width: 7px; height: 7px; border-radius: 50%; background: var(--mt2); flex-shrink: 0; }\n    #logDot.live { background: var(--gr); animation: blink 1s infinite; }\n    .log-btns { display: flex; gap: 5px; }\n    .log-btn {\n      font-family: \"JetBrains Mono\", monospace;\n      font-size: .58rem;\n      padding: 3px 9px;\n      border: 1px solid var(--bd2);\n      background: transparent;\n      color: var(--mt2);\n      border-radius: 4px;\n      cursor: pointer;\n    }\n    .log-btn:hover { color: var(--mt); border-color: var(--mt); }\n    #logBody {\n      font-family: \"JetBrains Mono\", monospace;\n      font-size: .71rem;\n      line-height: 1.55;\n      padding: 12px 15px;\n      max-height: 270px;\n      overflow-y: auto;\n      display: flex;\n      flex-direction: column;\n      gap: 2px;\n    }\n    .log-row { display: flex; gap: 9px; align-items: baseline; }\n    .log-ts { color: var(--mt2); flex-shrink: 0; font-size: .62rem; }\n    .log-lvl {\n      flex-shrink: 0;\n      font-size: .58rem;\n      font-weight: 700;\n      padding: 1px 5px;\n      border-radius: 3px;\n      text-transform: uppercase;\n      min-width: 38px;\n      text-align: center;\n    }\n    .log-lvl.info { background: rgba(96,165,250,.1);  color: var(--bl); }\n    .log-lvl.ok   { background: rgba(62,207,142,.1);  color: var(--gr); }\n    .log-lvl.warn { background: rgba(245,200,66,.1);  color: var(--ye); }\n    .log-lvl.err  { background: rgba(255,96,96,.1);   color: var(--re); }\n    .log-lvl.step { background: rgba(108,99,255,.15); color: var(--ac); }\n    .log-msg { color: var(--tx); word-break: break-all; }\n\n    /* ── Error box ── */\n    #errBox {\n      display: none;\n      padding: 13px 17px;\n      background: rgba(255,96,96,.07);\n      border: 1px solid rgba(255,96,96,.25);\n      border-radius: 9px;\n      color: var(--re);\n      font-size: .82rem;\n      margin-bottom: 20px;\n      line-height: 1.6;\n    }\n    #errBox.show { display: block; }\n\n    /* ── Results bar ── */\n    #resultsBar {\n      display: none;\n      align-items: center;\n      justify-content: space-between;\n      padding: 18px 0;\n      border-bottom: 1px solid var(--bd);\n      margin-bottom: 22px;\n      flex-wrap: wrap;\n      gap: 12px;\n    }\n    #resultsBar.show { display: flex; }\n    #resultCount {\n      font-family: Syne, sans-serif;\n      font-size: 1.6rem;\n      font-weight: 800;\n      color: var(--tx);\n      line-height: 1;\n    }\n    #resultCount em { color: var(--ac); font-style: normal; }\n    #resultMeta { font-size: .64rem; color: var(--mt2); margin-top: 5px; }\n    .result-actions { display: flex; gap: 8px; flex-wrap: wrap; }\n    .btn-sm {\n      font-size: .68rem;\n      font-weight: 500;\n      padding: 7px 15px;\n      border: 1px solid var(--bd2);\n      background: transparent;\n      color: var(--mt);\n      border-radius: 7px;\n      cursor: pointer;\n      transition: all .15s;\n      display: flex;\n      align-items: center;\n      gap: 6px;\n      white-space: nowrap;\n    }\n    .btn-sm:hover { border-color: var(--tx); color: var(--tx); }\n    .btn-sm.accent { background: var(--ac); color: #fff; border-color: var(--ac); }\n    .btn-sm.accent:hover { background: #7c74ff; border-color: #7c74ff; }\n\n    /* ── Summary ── */\n    #summaryBox {\n      display: none;\n      font-size: .83rem;\n      color: var(--mt);\n      line-height: 1.85;\n      padding: 14px 18px;\n      background: var(--bg3);\n      border-left: 3px solid var(--ac);\n      border-radius: 0 8px 8px 0;\n      margin-bottom: 22px;\n    }\n    #summaryBox.show { display: block; }\n\n    /* ── Filter chips ── */\n    #filterBar {\n      display: none;\n      gap: 7px;\n      margin-bottom: 20px;\n      flex-wrap: wrap;\n      align-items: center;\n    }\n    #filterBar.show { display: flex; }\n    .filter-label { font-size: .59rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mt2); }\n    .chip {\n      font-size: .64rem;\n      font-weight: 500;\n      padding: 4px 12px;\n      border: 1px solid var(--bd2);\n      border-radius: 20px;\n      background: transparent;\n      color: var(--mt);\n      cursor: pointer;\n      transition: all .15s;\n      white-space: nowrap;\n    }\n    .chip:hover { border-color: var(--ac); color: var(--ac); }\n    .chip.active { background: var(--ac); color: #fff; border-color: var(--ac); }\n\n    /* ── Cards grid ── */\n    #cardsGrid {\n      display: grid;\n      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));\n      gap: 18px;\n      margin-bottom: 36px;\n    }\n    @media (max-width: 700px) { #cardsGrid { grid-template-columns: 1fr; } }\n\n    .card {\n      background: var(--card);\n      border: 1px solid var(--bd);\n      border-radius: 13px;\n      overflow: hidden;\n      transition: border-color .2s, transform .2s, box-shadow .2s;\n      animation: fadeUp .38s ease both;\n      display: flex;\n      flex-direction: column;\n    }\n    @keyframes fadeUp { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }\n    .card:hover { border-color: var(--ac); transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,.55); }\n    .card-stripe { height: 3px; background: linear-gradient(90deg, var(--ac), #a78bfa); opacity: 0; transition: opacity .2s; }\n    .card:hover .card-stripe { opacity: 1; }\n\n    .card-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; flex: 1; }\n    .card-header { display: flex; align-items: flex-start; gap: 12px; }\n    .card-avatar {\n      width: 42px; height: 42px;\n      border-radius: 9px;\n      background: var(--bg3);\n      border: 1px solid var(--bd2);\n      display: grid; place-items: center;\n      font-family: Syne, sans-serif;\n      font-weight: 800;\n      font-size: .92rem;\n      color: var(--ac);\n      flex-shrink: 0;\n      text-transform: uppercase;\n    }\n    .card-title-wrap { flex: 1; min-width: 0; }\n    .card-name {\n      font-family: Syne, sans-serif;\n      font-size: .97rem;\n      font-weight: 700;\n      color: var(--tx);\n      line-height: 1.2;\n      white-space: nowrap;\n      overflow: hidden;\n      text-overflow: ellipsis;\n      margin-bottom: 3px;\n    }\n    .card-industry { font-size: .62rem; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--mt2); }\n    .card-score-wrap { text-align: right; flex-shrink: 0; }\n    .card-score-num { font-family: Syne, sans-serif; font-size: 1.2rem; font-weight: 800; line-height: 1; }\n    .card-score-lbl { font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: var(--mt2); margin-top: 1px; }\n    .card-desc { font-size: .79rem; color: var(--mt); line-height: 1.75; font-weight: 300; }\n\n    .card-details { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }\n    .card-detail { padding: 8px 10px; background: var(--bg2); border-radius: 6px; border: 1px solid var(--bd); }\n    .detail-label { font-size: .5rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mt2); margin-bottom: 2px; }\n    .detail-value { font-size: .73rem; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n\n    .card-products { padding: 10px 12px; background: var(--bg2); border-radius: 6px; border: 1px solid var(--bd); }\n    .products-label { font-size: .5rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mt2); margin-bottom: 7px; }\n    .products-list { display: flex; flex-wrap: wrap; gap: 5px; }\n    .product-pill { font-size: .63rem; font-weight: 500; padding: 2px 9px; background: var(--bg3); border: 1px solid var(--bd2); border-radius: 3px; color: var(--tx); }\n\n    .card-tags { display: flex; flex-wrap: wrap; gap: 4px; }\n    .tag { font-size: .57rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 2px 7px; background: rgba(108,99,255,.1); color: var(--ac); border-radius: 3px; border: 1px solid rgba(108,99,255,.2); }\n\n    .card-footer {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 11px 20px;\n      border-top: 1px solid var(--bd);\n      background: var(--bg2);\n      flex-wrap: wrap;\n      gap: 7px;\n    }\n    .card-link { font-size: .66rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ac); text-decoration: none; display: flex; align-items: center; gap: 4px; transition: gap .15s; }\n    .card-link:hover { gap: 7px; }\n    .card-socials { display: flex; gap: 6px; }\n    .card-socials a { font-size: .59rem; font-weight: 500; color: var(--mt); padding: 2px 7px; border: 1px solid var(--bd2); border-radius: 3px; text-decoration: none; transition: all .15s; }\n    .card-socials a:hover { border-color: var(--ac); color: var(--ac); }\n    .card-src { font-size: .55rem; color: var(--mt2); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n\n    /* ── Load more ── */\n    #moreSection { display: none; text-align: center; padding: 6px 0 48px; }\n    #moreSection.show { display: block; }\n    #moreBtn {\n      font-family: Syne, sans-serif;\n      font-size: .82rem;\n      font-weight: 700;\n      letter-spacing: .05em;\n      text-transform: uppercase;\n      padding: 13px 42px;\n      background: transparent;\n      color: var(--tx);\n      border: 1.5px solid var(--bd2);\n      border-radius: 10px;\n      cursor: pointer;\n      transition: all .2s;\n      display: inline-flex;\n      align-items: center;\n      gap: 10px;\n    }\n    #moreBtn:hover { border-color: var(--ac); color: var(--ac); box-shadow: 0 0 20px var(--acg); }\n    #moreBtn:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }\n    #moreBtn .spin { width: 14px; height: 14px; border-width: 2px; display: none; }\n    #moreBtn.busy .spin { display: block; }\n    .more-hint { font-size: .65rem; color: var(--mt2); margin-top: 10px; }\n\n    /* ── Sources ── */\n    #sourcesSection { display: none; margin-bottom: 44px; padding: 20px 24px; background: var(--bg3); border-radius: 12px; border: 1px solid var(--bd); }\n    #sourcesSection.show { display: block; }\n    .sources-label { font-size: .58rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--mt2); margin-bottom: 11px; display: flex; align-items: center; gap: 9px; }\n    .sources-label::after { content: \"\"; flex: 1; height: 1px; background: var(--bd); }\n    .sources-list { display: flex; flex-wrap: wrap; gap: 7px; }\n    .source-link { font-size: .61rem; padding: 4px 10px; background: var(--bg2); border: 1px solid var(--bd); border-radius: 4px; color: var(--mt2); text-decoration: none; max-width: 190px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; display: block; transition: all .15s; }\n    .source-link:hover { border-color: var(--ac); color: var(--ac); }\n\n    /* ── Footer ── */\n    footer { border-top: 1px solid var(--bd); padding: 22px 0; text-align: center; font-size: .64rem; color: var(--mt2); line-height: 1.9; }\n  </style>\n</head>\n<body>\n\n<!-- NAV -->\n<nav>\n  <div class=\"w nav-inner\">\n    <a class=\"brand\" href=\"/\">\n      <div class=\"brand-icon\">\n        <svg viewBox=\"0 0 24 24\">\n          <circle cx=\"11\" cy=\"11\" r=\"7\"/>\n          <path d=\"m21 21-4.35-4.35\"/>\n          <path d=\"M11 8v6M8 11h6\"/>\n        </svg>\n      </div>\n      <span class=\"brand-name\">CompanyScout</span>\n    </a>\n    <span class=\"nav-pill\">Gemini AI</span>\n  </div>\n</nav>\n\n<main>\n<div class=\"w\">\n\n  <!-- HERO -->\n  <div class=\"hero\">\n    <div class=\"hero-tag\">\n      <span class=\"blink\"></span>\n      AI-Powered Discovery\n    </div>\n    <h1>Find any company<br/>across the <span class=\"hi\">entire web.</span></h1>\n    <p class=\"hero-sub\">\n      Describe what you're looking for. Our AI searches the web, scrapes company pages,\n      and extracts structured business intelligence — instantly.\n    </p>\n    <div class=\"features\">\n      <span class=\"feat\">\n        <svg viewBox=\"0 0 24 24\"><polyline points=\"22 12 18 12 15 21 9 3 6 12 2 12\"/></svg>\n        Live web scraping\n      </span>\n      <span class=\"feat\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z\"/></svg>\n        Up to 50 companies\n      </span>\n      <span class=\"feat\">\n        <svg viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M9 21V9\"/></svg>\n        CSV &amp; JSON export\n      </span>\n      <span class=\"feat\">\n        <svg viewBox=\"0 0 24 24\"><polyline points=\"16 18 22 12 16 6\"/><polyline points=\"8 6 2 12 8 18\"/></svg>\n        Live debug log\n      </span>\n    </div>\n  </div>\n\n  <!-- SEARCH PANEL -->\n  <div class=\"panel\">\n    <div class=\"panel-title\">Configure Search</div>\n    <div class=\"grid2\">\n\n      <div class=\"field span2\">\n        <span class=\"field-label\">What companies are you looking for?</span>\n        <input\n          id=\"inputQuery\"\n          type=\"text\"\n          placeholder=\"e.g. AI healthcare startups in India, SaaS fintech in Europe, B2B logistics software...\"\n          autocomplete=\"off\"\n        />\n        <span class=\"field-hint\">Be specific — include industry, geography, company stage, or technology</span>\n      </div>\n\n      <div class=\"field span2\">\n        <span class=\"field-label\">Gemini API Key</span>\n        <input\n          id=\"inputKey\"\n          type=\"password\"\n          placeholder=\"AIzaSy...\"\n          autocomplete=\"off\"\n        />\n        <span class=\"field-hint\">\n          Free key at <strong>aistudio.google.com</strong> &rarr; Sign in &rarr; Get API key &mdash; Never stored on this server\n        </span>\n      </div>\n\n      <div class=\"field\">\n        <span class=\"field-label\">Max Companies</span>\n        <select id=\"inputMax\">\n          <option value=\"10\">10 companies</option>\n          <option value=\"20\" selected>20 companies</option>\n          <option value=\"30\">30 companies</option>\n          <option value=\"50\">50 companies</option>\n        </select>\n      </div>\n\n      <div class=\"field\">\n        <span class=\"field-label\">Scan Depth</span>\n        <label class=\"toggle\">\n          <input type=\"checkbox\" id=\"inputDeep\" />\n          <span class=\"toggle-text\">\n            <b>Deep Scan</b>\n            Crawl more pages for richer results (2&times; slower)\n          </span>\n        </label>\n      </div>\n\n      <div class=\"span2\">\n        <button id=\"searchBtn\" type=\"button\">\n          <div class=\"spin\"></div>\n          <span class=\"btn-label\">Discover Companies &rarr;</span>\n        </button>\n      </div>\n\n    </div>\n  </div>\n\n  <!-- LIVE LOG -->\n  <div id=\"logPanel\">\n    <div class=\"log-header\">\n      <div class=\"log-title\">\n        <span id=\"logDot\"></span>\n        Live Log\n      </div>\n      <div class=\"log-btns\">\n        <button class=\"log-btn\" id=\"clearLogBtn\">Clear</button>\n        <button class=\"log-btn\" id=\"toggleLogBtn\">Hide</button>\n      </div>\n    </div>\n    <div id=\"logBody\"></div>\n  </div>\n\n  <!-- ERROR -->\n  <div id=\"errBox\"></div>\n\n  <!-- RESULTS BAR -->\n  <div id=\"resultsBar\">\n    <div>\n      <div id=\"resultCount\"><em>0</em> Companies Found</div>\n      <div id=\"resultMeta\"></div>\n    </div>\n    <div class=\"result-actions\">\n      <button class=\"btn-sm\" id=\"btnCSV\"  style=\"display:none\" onclick=\"exportCSV()\">&#8595; CSV</button>\n      <button class=\"btn-sm\" id=\"btnJSON\" style=\"display:none\" onclick=\"exportJSON()\">&#8595; JSON</button>\n      <button class=\"btn-sm accent\" id=\"btnNext\" style=\"display:none\" onclick=\"search(true)\">&#8635; Find Next Batch</button>\n    </div>\n  </div>\n\n  <!-- SUMMARY -->\n  <div id=\"summaryBox\"></div>\n\n  <!-- FILTER CHIPS -->\n  <div id=\"filterBar\"></div>\n\n  <!-- CARDS -->\n  <div id=\"cardsGrid\"></div>\n\n  <!-- LOAD MORE -->\n  <div id=\"moreSection\">\n    <button id=\"moreBtn\" onclick=\"search(true)\">\n      <div class=\"spin\"></div>\n      <span>Find Next Companies &rarr;</span>\n    </button>\n    <div class=\"more-hint\">Continues with new queries to find additional companies</div>\n  </div>\n\n  <!-- SOURCES -->\n  <div id=\"sourcesSection\">\n    <div class=\"sources-label\">Pages Scraped</div>\n    <div class=\"sources-list\" id=\"sourcesList\"></div>\n  </div>\n\n</div>\n</main>\n\n<footer>\n  <div class=\"w\">\n    CompanyScout &mdash; API keys are never stored or logged &mdash;\n    Built with Express, Cheerio &amp; Google Gemini\n  </div>\n</footer>\n\n<script>\n// ─────────────────────────────────────────────────────────────────────────────\n// State\n// ─────────────────────────────────────────────────────────────────────────────\nvar allCompanies = [];\nvar currentQuery = \"\";\nvar isNextBatch  = false;\nvar batchOffset  = 0;\nvar logBodyEl    = document.getElementById(\"logBody\");\nvar logVisible   = true;\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Log helpers\n// ─────────────────────────────────────────────────────────────────────────────\nfunction logTS() {\n  var d = new Date();\n  var hh = String(d.getHours()).padStart(2, \"0\");\n  var mm = String(d.getMinutes()).padStart(2, \"0\");\n  var ss = String(d.getSeconds()).padStart(2, \"0\");\n  var ms = String(d.getMilliseconds()).padStart(3, \"0\");\n  return hh + \":\" + mm + \":\" + ss + \".\" + ms;\n}\n\nfunction addLog(lvl, msg) {\n  var row = document.createElement(\"div\");\n  row.className = \"log-row\";\n  // safe-encode\n  var safemsg = String(msg)\n    .replace(/&/g, \"&amp;\")\n    .replace(/</g, \"&lt;\")\n    .replace(/>/g, \"&gt;\");\n  row.innerHTML =\n    '<span class=\"log-ts\">' + logTS() + '</span>' +\n    '<span class=\"log-lvl ' + lvl + '\">' + lvl.toUpperCase() + '</span>' +\n    '<span class=\"log-msg\">' + safemsg + '</span>';\n  logBodyEl.appendChild(row);\n  logBodyEl.scrollTop = logBodyEl.scrollHeight;\n  // Keep max 400 lines\n  while (logBodyEl.children.length > 400) {\n    logBodyEl.removeChild(logBodyEl.firstChild);\n  }\n}\n\nfunction injectServerLogs(logs) {\n  if (!Array.isArray(logs)) return;\n  for (var i = 0; i < logs.length; i++) {\n    var l = logs[i];\n    addLog(l.lvl || \"info\", \"[SRV] \" + l.msg);\n  }\n}\n\ndocument.getElementById(\"clearLogBtn\").onclick = function () {\n  logBodyEl.innerHTML = \"\";\n};\ndocument.getElementById(\"toggleLogBtn\").onclick = function () {\n  logVisible = !logVisible;\n  logBodyEl.style.display = logVisible ? \"\" : \"none\";\n  document.getElementById(\"toggleLogBtn\").textContent = logVisible ? \"Hide\" : \"Show\";\n};\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Error / UI helpers\n// ─────────────────────────────────────────────────────────────────────────────\nfunction showErr(msg) {\n  var el = document.getElementById(\"errBox\");\n  el.innerHTML = \"<strong>Error:</strong> \" + escHTML(msg);\n  el.classList.add(\"show\");\n}\nfunction hideErr() {\n  document.getElementById(\"errBox\").classList.remove(\"show\");\n}\nfunction escHTML(s) {\n  return String(s || \"\")\n    .replace(/&/g, \"&amp;\")\n    .replace(/</g, \"&lt;\")\n    .replace(/>/g, \"&gt;\")\n    .replace(/\"/g, \"&quot;\");\n}\n\nfunction setBusy(busy) {\n  var btn = document.getElementById(\"searchBtn\");\n  btn.disabled = busy;\n  if (busy) { btn.classList.add(\"busy\"); }\n  else       { btn.classList.remove(\"busy\"); }\n}\nfunction setMoreBusy(busy) {\n  var btn = document.getElementById(\"moreBtn\");\n  btn.disabled = busy;\n  if (busy) { btn.classList.add(\"busy\"); }\n  else       { btn.classList.remove(\"busy\"); }\n  var b2 = document.getElementById(\"btnNext\");\n  if (b2) b2.disabled = busy;\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Main search function\n// ─────────────────────────────────────────────────────────────────────────────\nfunction search(isNext) {\n  var query   = document.getElementById(\"inputQuery\").value.trim();\n  var apiKey  = document.getElementById(\"inputKey\").value.trim();\n  var maxRes  = parseInt(document.getElementById(\"inputMax\").value, 10);\n  var deep    = document.getElementById(\"inputDeep\").checked;\n\n  addLog(\"info\", \"=== Search triggered ===\");\n  addLog(\"info\", \"Query: \" + query);\n  addLog(\"info\", \"Key prefix: \" + (apiKey.slice(0, 8) || \"(empty)\"));\n  addLog(\"info\", \"Max: \" + maxRes + \" | Deep: \" + deep + \" | Next: \" + !!isNext);\n\n  if (!query) {\n    addLog(\"err\", \"No query provided\");\n    showErr(\"Please enter a search query.\");\n    return;\n  }\n  if (!apiKey) {\n    addLog(\"err\", \"No API key provided\");\n    showErr(\"Please enter your Gemini API key. Get one free at aistudio.google.com\");\n    return;\n  }\n\n  isNextBatch  = !!isNext;\n  currentQuery = query;\n  hideErr();\n\n  if (isNextBatch) {\n    batchOffset += allCompanies.length;\n    setMoreBusy(true);\n    addLog(\"info\", \"Next batch — offset: \" + batchOffset);\n  } else {\n    batchOffset = 0;\n    allCompanies = [];\n    setBusy(true);\n    clearResults();\n  }\n\n  document.getElementById(\"logDot\").classList.add(\"live\");\n  addLog(\"step\", \"Sending POST /api/search ...\");\n\n  var payload = JSON.stringify({\n    query      : query,\n    apiKey     : apiKey,\n    maxResults : maxRes,\n    deepScrape : deep,\n    offset     : batchOffset,\n  });\n\n  var t0 = Date.now();\n\n  fetch(\"/api/search\", {\n    method  : \"POST\",\n    headers : { \"Content-Type\": \"application/json\" },\n    body    : payload,\n  })\n  .then(function (resp) {\n    addLog(\"info\", \"HTTP \" + resp.status + \" in \" + (Date.now() - t0) + \"ms\");\n    return resp.text().then(function (txt) {\n      addLog(\"info\", \"Response size: \" + txt.length + \" bytes\");\n      if (txt.length > 0) {\n        addLog(\"info\", \"Preview: \" + txt.slice(0, 120));\n      }\n      var data;\n      try {\n        data = JSON.parse(txt);\n      } catch (pe) {\n        addLog(\"err\", \"JSON parse error: \" + pe.message);\n        addLog(\"err\", \"Raw: \" + txt.slice(0, 200));\n        throw new Error(\"Server returned invalid response: \" + txt.slice(0, 100));\n      }\n      if (!resp.ok) {\n        if (data.logs) injectServerLogs(data.logs);\n        throw new Error(data.error || (\"Server error \" + resp.status));\n      }\n      return data;\n    });\n  })\n  .then(function (data) {\n    if (data.logs) injectServerLogs(data.logs);\n\n    var companies = Array.isArray(data.companies) ? data.companies : [];\n    addLog(\"ok\", \"Received \" + companies.length + \" companies\");\n\n    if (data.meta) {\n      addLog(\"info\", \"Pages scraped: \" + (data.meta.pagesScraped || 0));\n      addLog(\"info\", \"Queries used: \" + (data.meta.queriesUsed || []).join(\" | \"));\n    }\n\n    allCompanies = isNextBatch\n      ? allCompanies.concat(companies)\n      : companies;\n\n    if (isNextBatch) {\n      appendCards(companies, allCompanies.length - companies.length);\n    } else {\n      renderResults(data);\n    }\n\n    updateResultsBar(allCompanies.length, data);\n    addLog(\"ok\", \"=== Done — \" + allCompanies.length + \" total companies ===\");\n  })\n  .catch(function (err) {\n    addLog(\"err\", \"FETCH ERROR: \" + err.message);\n    showErr(err.message);\n  })\n  .finally(function () {\n    setBusy(false);\n    setMoreBusy(false);\n    document.getElementById(\"logDot\").classList.remove(\"live\");\n  });\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Render results\n// ─────────────────────────────────────────────────────────────────────────────\nfunction renderResults(data) {\n  var companies = Array.isArray(data.companies) ? data.companies : [];\n\n  document.getElementById(\"resultsBar\").classList.add(\"show\");\n\n  if (data.summary) {\n    var sb = document.getElementById(\"summaryBox\");\n    sb.textContent = data.summary;\n    sb.classList.add(\"show\");\n  }\n\n  buildFilters(companies);\n\n  var grid = document.getElementById(\"cardsGrid\");\n  for (var i = 0; i < companies.length; i++) {\n    grid.appendChild(buildCard(companies[i], i));\n  }\n\n  // Sources\n  if (data.searchedUrls && data.searchedUrls.length > 0) {\n    document.getElementById(\"sourcesSection\").classList.add(\"show\");\n    var sl = document.getElementById(\"sourcesList\");\n    var urls = data.searchedUrls.slice(0, 24);\n    for (var j = 0; j < urls.length; j++) {\n      var a = document.createElement(\"a\");\n      a.className = \"source-link\";\n      a.href      = urls[j];\n      a.target    = \"_blank\";\n      a.rel       = \"noopener\";\n      try { a.textContent = new URL(urls[j]).hostname; }\n      catch (_) { a.textContent = urls[j]; }\n      sl.appendChild(a);\n    }\n  }\n\n  if (companies.length > 0) {\n    document.getElementById(\"btnCSV\").style.display  = \"flex\";\n    document.getElementById(\"btnJSON\").style.display = \"flex\";\n    document.getElementById(\"btnNext\").style.display = \"flex\";\n    document.getElementById(\"moreSection\").classList.add(\"show\");\n  }\n}\n\nfunction appendCards(companies, startIdx) {\n  var grid = document.getElementById(\"cardsGrid\");\n  for (var i = 0; i < companies.length; i++) {\n    grid.appendChild(buildCard(companies[i], startIdx + i));\n  }\n  document.getElementById(\"moreSection\").classList.add(\"show\");\n}\n\nfunction updateResultsBar(count, data) {\n  document.getElementById(\"resultCount\").innerHTML =\n    \"<em>\" + count + \"</em> Compan\" + (count === 1 ? \"y\" : \"ies\") + \" Found\";\n\n  var meta = data.meta || {};\n  document.getElementById(\"resultMeta\").textContent =\n    (meta.pagesScraped || 0) + \" pages scraped \\u00b7 \" +\n    ((meta.queriesUsed && meta.queriesUsed.length) || 0) + \" queries used\" +\n    (isNextBatch ? \" \\u00b7 expanded batch\" : \"\");\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Filter chips\n// ─────────────────────────────────────────────────────────────────────────────\nfunction buildFilters(companies) {\n  var industries = [];\n  for (var i = 0; i < companies.length; i++) {\n    var ind = companies[i].industry;\n    if (ind && industries.indexOf(ind) === -1) industries.push(ind);\n  }\n\n  var bar = document.getElementById(\"filterBar\");\n  bar.innerHTML = '<span class=\"filter-label\">Industry:</span>' +\n    '<span class=\"chip active\" data-industry=\"all\">All</span>';\n\n  for (var j = 0; j < Math.min(industries.length, 8); j++) {\n    var s = document.createElement(\"span\");\n    s.className = \"chip\";\n    s.textContent = industries[j];\n    s.setAttribute(\"data-industry\", industries[j]);\n    bar.appendChild(s);\n  }\n\n  bar.classList.add(\"show\");\n\n  bar.addEventListener(\"click\", function (e) {\n    var target = e.target;\n    if (!target.classList.contains(\"chip\")) return;\n    var chips = document.querySelectorAll(\"#filterBar .chip\");\n    for (var k = 0; k < chips.length; k++) chips[k].classList.remove(\"active\");\n    target.classList.add(\"active\");\n    var ind = target.getAttribute(\"data-industry\");\n    var cards = document.querySelectorAll(\"#cardsGrid .card\");\n    for (var m = 0; m < cards.length; m++) {\n      cards[m].style.display =\n        (ind === \"all\" || cards[m].getAttribute(\"data-industry\") === ind) ? \"\" : \"none\";\n    }\n  });\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Build a company card\n// ─────────────────────────────────────────────────────────────────────────────\nfunction buildCard(c, idx) {\n  var card = document.createElement(\"div\");\n  card.className = \"card\";\n  card.setAttribute(\"data-industry\", c.industry || \"\");\n  card.style.animationDelay = Math.min(idx, 14) * 40 + \"ms\";\n\n  var score     = typeof c.relevanceScore === \"number\" ? c.relevanceScore : 0;\n  var scoreColor = score >= 80 ? \"#3ecf8e\" : score >= 60 ? \"#6c63ff\" : \"#888799\";\n  var initials  = (c.name || \"?\")\n    .split(\" \")\n    .map(function (w) { return w.charAt(0) || \"\"; })\n    .join(\"\")\n    .slice(0, 2)\n    .toUpperCase();\n  var website = c.website || c.source || \"#\";\n\n  // Details block\n  var detailsHTML = \"\";\n  var detailPairs = [];\n  if (c.founded)  detailPairs.push({ l: \"Founded\",  v: c.founded });\n  if (c.location) detailPairs.push({ l: \"Location\", v: c.location });\n  if (c.size)     detailPairs.push({ l: \"Size\",     v: c.size });\n  if (c.funding)  detailPairs.push({ l: \"Funding\",  v: c.funding });\n  if (detailPairs.length > 0) {\n    detailsHTML = '<div class=\"card-details\">';\n    for (var i = 0; i < detailPairs.length; i++) {\n      detailsHTML +=\n        '<div class=\"card-detail\">' +\n        '<div class=\"detail-label\">'  + escHTML(detailPairs[i].l) + '</div>' +\n        '<div class=\"detail-value\" title=\"' + escHTML(detailPairs[i].v) + '\">' +\n        escHTML(detailPairs[i].v) + '</div></div>';\n    }\n    detailsHTML += '</div>';\n  }\n\n  // Products block\n  var productsHTML = \"\";\n  if (Array.isArray(c.keyProducts) && c.keyProducts.length > 0) {\n    var pills = c.keyProducts.slice(0, 5)\n      .map(function (p) { return '<span class=\"product-pill\">' + escHTML(p) + '</span>'; })\n      .join(\"\");\n    productsHTML =\n      '<div class=\"card-products\">' +\n      '<div class=\"products-label\">Key Products</div>' +\n      '<div class=\"products-list\">' + pills + '</div>' +\n      '</div>';\n  }\n\n  // Tags block\n  var tagsHTML = \"\";\n  if (Array.isArray(c.tags) && c.tags.length > 0) {\n    tagsHTML = '<div class=\"card-tags\">' +\n      c.tags.slice(0, 6).map(function (t) {\n        return '<span class=\"tag\">' + escHTML(t) + '</span>';\n      }).join(\"\") +\n      '</div>';\n  }\n\n  // Social links\n  var socialsHTML = \"\";\n  if (c.socialLinks) {\n    if (c.socialLinks.linkedin) {\n      socialsHTML += '<a href=\"' + escHTML(c.socialLinks.linkedin) + '\" target=\"_blank\" rel=\"noopener\">LinkedIn &#8599;</a>';\n    }\n    if (c.socialLinks.twitter) {\n      socialsHTML += '<a href=\"' + escHTML(c.socialLinks.twitter) + '\" target=\"_blank\" rel=\"noopener\">Twitter &#8599;</a>';\n    }\n  }\n\n  // Source domain\n  var srcDomain = \"\";\n  try { srcDomain = new URL(c.source || website).hostname; } catch (_) {}\n\n  card.innerHTML =\n    '<div class=\"card-stripe\"></div>' +\n    '<div class=\"card-body\">' +\n      '<div class=\"card-header\">' +\n        '<div class=\"card-avatar\">' + initials + '</div>' +\n        '<div class=\"card-title-wrap\">' +\n          '<div class=\"card-name\" title=\"' + escHTML(c.name) + '\">' + escHTML(c.name) + '</div>' +\n          '<div class=\"card-industry\">' + escHTML(c.industry || \"\\u2014\") + '</div>' +\n        '</div>' +\n        '<div class=\"card-score-wrap\">' +\n          '<div class=\"card-score-num\" style=\"color:' + scoreColor + '\">' + score + '%</div>' +\n          '<div class=\"card-score-lbl\">match</div>' +\n        '</div>' +\n      '</div>' +\n      '<div class=\"card-desc\">' + escHTML(c.description || \"\") + '</div>' +\n      detailsHTML +\n      productsHTML +\n      tagsHTML +\n    '</div>' +\n    '<div class=\"card-footer\">' +\n      '<a class=\"card-link\" href=\"' + escHTML(website) + '\" target=\"_blank\" rel=\"noopener\">Visit Site &#8594;</a>' +\n      '<div class=\"card-socials\">' + socialsHTML + '</div>' +\n      (srcDomain ? '<span class=\"card-src\">' + escHTML(srcDomain) + '</span>' : '') +\n    '</div>';\n\n  return card;\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Clear results\n// ─────────────────────────────────────────────────────────────────────────────\nfunction clearResults() {\n  document.getElementById(\"cardsGrid\").innerHTML    = \"\";\n  document.getElementById(\"sourcesList\").innerHTML  = \"\";\n  document.getElementById(\"filterBar\").innerHTML    = \"\";\n\n  var toHide = [\"resultsBar\", \"summaryBox\", \"filterBar\", \"sourcesSection\", \"moreSection\"];\n  for (var i = 0; i < toHide.length; i++) {\n    document.getElementById(toHide[i]).classList.remove(\"show\");\n  }\n\n  var toHideDisplay = [\"btnCSV\", \"btnJSON\", \"btnNext\"];\n  for (var j = 0; j < toHideDisplay.length; j++) {\n    document.getElementById(toHideDisplay[j]).style.display = \"none\";\n  }\n\n  allCompanies = [];\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Exports\n// ─────────────────────────────────────────────────────────────────────────────\nfunction exportJSON() {\n  var data = { query: currentQuery, total: allCompanies.length, companies: allCompanies };\n  var blob = new Blob([JSON.stringify(data, null, 2)], { type: \"application/json\" });\n  var a = document.createElement(\"a\");\n  a.href     = URL.createObjectURL(blob);\n  a.download = \"companyscout-\" + Date.now() + \".json\";\n  a.click();\n}\n\nfunction exportCSV() {\n  var headers = [\"Name\",\"Website\",\"Industry\",\"Founded\",\"Location\",\"Size\",\"Funding\",\"Description\",\"Tags\",\"Score\",\"LinkedIn\",\"Twitter\"];\n  var rows = allCompanies.map(function (c) {\n    return [\n      c.name, c.website, c.industry, c.founded, c.location,\n      c.size, c.funding, c.description,\n      (Array.isArray(c.tags) ? c.tags.join(\"; \") : \"\"),\n      c.relevanceScore,\n      (c.socialLinks && c.socialLinks.linkedin) || \"\",\n      (c.socialLinks && c.socialLinks.twitter)  || \"\",\n    ].map(function (v) {\n      return '\"' + String(v == null ? \"\" : v).replace(/\"/g, '\"\"') + '\"';\n    }).join(\",\");\n  });\n  var csv  = [headers.join(\",\")].concat(rows).join(\"\\n\");\n  var blob = new Blob([csv], { type: \"text/csv\" });\n  var a    = document.createElement(\"a\");\n  a.href     = URL.createObjectURL(blob);\n  a.download = \"companyscout-\" + Date.now() + \".csv\";\n  a.click();\n}\n\n// ─────────────────────────────────────────────────────────────────────────────\n// Wire up button and Enter key\n// ─────────────────────────────────────────────────────────────────────────────\ndocument.getElementById(\"searchBtn\").addEventListener(\"click\", function () {\n  search(false);\n});\n\ndocument.getElementById(\"inputQuery\").addEventListener(\"keydown\", function (e) {\n  if (e.key === \"Enter\") search(false);\n});\ndocument.getElementById(\"inputKey\").addEventListener(\"keydown\", function (e) {\n  if (e.key === \"Enter\") search(false);\n});\n\n// Initial log message — proves JS is running\naddLog(\"info\", \"CompanyScout v4 ready\");\naddLog(\"info\", \"Enter your query and Gemini API key above, then click Discover\");\n</script>\n</body>\n</html>\n";
mkdirSync(_publicDir, { recursive: true });
writeFileSync(_htmlPath, _htmlContent, "utf8");
console.log("index.html written to " + _htmlPath);

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
