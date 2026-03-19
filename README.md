# BoligTracker

Personal tool for tracking the Copenhagen apartment market. Scrapes active listings and sold data from Boliga.dk, stores it in Supabase, and displays it in a React dashboard.

## Architecture

```
Boliga.dk API
     │
     ▼
scraper/scraper.py   ← runs daily via cron at 04:00 CET
     │
     ▼
Supabase (PostgreSQL)
     │
     ▼
frontend/            ← React + Vite + Tailwind, queries Supabase directly
```

## Views

- **Til salg** — active listings with filters (area, rooms, price, size). Click a row to open on Boliga.dk.
- **Solgte** — historical sold data with a kr/m² trend chart and filters.
- **Vores lejlighed** — estimated current value of your apartment based on recent comparable sales.

## Coverage

- Copenhagen municipality (101)
- Frederiksberg municipality (147)
- Property type: apartments only
- Sold history: 5 years

## Setup

### Scraper

```bash
cd /path/to/boligtracker
pip install supabase python-dotenv

# Create .env with:
# SUPABASE_URL=...
# SUPABASE_SERVICE_KEY=...

python3 scraper/scraper.py backfill   # one-time historical fetch
python3 scraper/scraper.py daily      # incremental update (run via cron)
```

### Cron (daily at 04:00 CET)

```
0 3 * * * python3 /path/to/boligtracker/scraper/scraper.py daily >> /path/to/boligtracker/logs/scraper.log 2>&1
```

### Frontend (local dev)

```bash
cd frontend
npm install

# Create frontend/.env with:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_KEY=...   ← use publishable/anon key, not service key

npm run dev
```

### Database

Run `db/schema.sql` in the Supabase SQL editor to create the four tables:
`listings`, `sold`, `daily_snapshots`, `scrape_runs`

## Ethical scraping

- Minimum 3s between requests + random jitter
- `pageSize=500` (maximum allowed) to minimise number of calls
- Municipality-level queries (2 calls covers all of Copenhagen + Frederiksberg)
- Daily run makes ~10–15 API calls total
- Exponential backoff on 429 responses
- Polite User-Agent identifying this as a personal hobby project
