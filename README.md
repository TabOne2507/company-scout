# CompanyScout 🔍

**AI-powered company discovery engine** — searches the web, scrapes pages, and extracts structured business intelligence using OpenAI GPT-4o.

![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![Express](https://img.shields.io/badge/Express-4.x-blue) ![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-orange) ![Docker](https://img.shields.io/badge/Docker-ready-blue)

---

## How it Works

1. **User enters a query** — e.g. _"AI startups in India focused on healthcare"_
2. **OpenAI generates search queries** — 3 diverse queries optimized for discovery
3. **DuckDuckGo is searched** — no API key required for search
4. **Pages are scraped** — axios + cheerio fetch and parse web content
5. **OpenAI extracts company data** — structured JSON with name, description, industry, founded, location, products, tags, relevance score

---

## Features

- ✅ **No search API key required** — uses DuckDuckGo HTML search
- ✅ **User-supplied OpenAI key** — never stored on server
- ✅ **Deep Scan mode** — crawl more pages for richer results
- ✅ **JSON export** — download all results
- ✅ **Rate limiting** — 30 requests per 15 min per IP
- ✅ **Helmet.js** security headers
- ✅ **Docker-ready** — single command deploy
- ✅ **Health check endpoint** — `/api/health`

---

## Quick Start

### Prerequisites
- Node.js 18+
- OpenAI API key (GPT-4o access)

### Local Development

```bash
# Clone and install
git clone <your-repo>
cd company-scout
npm install

# Copy env file
cp .env.example .env

# Start dev server (with auto-reload)
npm run dev

# Or production mode
npm start
```

Open: http://localhost:3000

---

## Deployment Options

### 1. Docker (Recommended)

```bash
# Build and run
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### 2. Render.com (Free tier)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `NODE_ENV=production`
5. Deploy!

### 3. Railway.app

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### 4. VPS / Ubuntu Server

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and install
git clone <your-repo>
cd company-scout
npm install

# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start server.js --name company-scout
pm2 save
pm2 startup

# Optional: Nginx reverse proxy
# sudo apt install nginx
# Configure nginx to proxy :3000 → :80/:443
```

#### Sample Nginx config

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5. Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch
fly launch
fly deploy
```

---

## API Reference

### `POST /api/search`

**Body:**
```json
{
  "query": "SaaS fintech startups in Europe",
  "apiKey": "sk-...",
  "maxResults": 10,
  "deepScrape": false
}
```

**Response:**
```json
{
  "success": true,
  "query": "SaaS fintech startups in Europe",
  "companies": [
    {
      "name": "Acme Corp",
      "website": "https://acme.com",
      "description": "...",
      "industry": "Fintech",
      "founded": "2019",
      "location": "Berlin, Germany",
      "size": "Startup",
      "keyProducts": ["Payments API", "KYC Suite"],
      "tags": ["payments", "B2B", "API-first"],
      "relevanceScore": 92,
      "contactEmail": null,
      "socialLinks": {"linkedin": "...", "twitter": null},
      "source": "https://..."
    }
  ],
  "summary": "Found 10 fintech companies...",
  "totalFound": 10,
  "searchedUrls": ["..."],
  "meta": {
    "queriesUsed": ["..."],
    "pagesScraped": 12,
    "deepScrape": false
  }
}
```

### `GET /api/health`

Returns `{ "status": "ok", "ts": "..." }` — used for health checks.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `ALLOWED_ORIGIN` | `*` | CORS allowed origin |
| `NODE_ENV` | `production` | Environment |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CompanyScout                         │
│                                                         │
│  Browser ──→ Express Server ──→ DuckDuckGo Search       │
│                  │                      │                │
│                  │              Scrape URLs (axios)      │
│                  │                      │                │
│                  └─────→ OpenAI GPT-4o ←┘               │
│                              │                           │
│                    Structured Company JSON               │
└─────────────────────────────────────────────────────────┘
```

---

## Security Notes

- OpenAI API keys are **never logged or stored** — used per-request and discarded
- Rate limiting: 30 requests / 15 min per IP
- Helmet.js sets secure HTTP headers
- Non-root Docker user

---

## License

MIT
