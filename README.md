/ ===================== README.md =====================
# CAP Springfield WAA Tracker

A live fundraising dashboard for Civil Air Patrol Springfield Composite Squadron cadets
participating in Wreaths Across America.

## Features
- Cadet cards showing wreaths sold, goal, and % progress
- Live scraping of individual WAA profile pages
- Upstash Redis caching (no repeated scrapes on every page load)
- Bar chart: Goal vs. Wreaths Sold per cadet
- Add / Remove cadets
- One-click Refresh

## Setup

### 1. Clone the repo
```
git clone https://github.com/YOUR_ORG/waa-tracker.git
cd waa-tracker
```

### 2. Create Upstash Redis database
- Go to https://console.upstash.com
- Create a new Redis database (free tier works fine)
- Copy the REST URL and REST Token

### 3. Deploy to Vercel
- Push repo to GitHub
- Import project at https://vercel.com/new
- In Vercel → Settings → Environment Variables, add:
  - UPSTASH_REDIS_REST_URL  = your Upstash REST URL
  - UPSTASH_REDIS_REST_TOKEN = your Upstash token
- Click Deploy

### 4. Add Cadets
- Open your deployed app
- Click "Add Cadet"
- Enter the cadet's name and their WAA profile URL
  (e.g. https://wreathsacrossamerica.org/pages/190619/Overview)
- The app will scrape and cache the data automatically

## File Structure
```
/
├── index.html          ← Frontend (dashboard + chart)
├── api/
│   └── proxy.js        ← Vercel serverless function (scraper + Redis)
├── vercel.json         ← Vercel routing config
├── .env.example        ← Environment variable template
└── README.md
```

## Notes
- Data is cached in Redis; click "Refresh Data" to re-scrape live WAA pages
- Cadet goals are pulled from their WAA page; you can override by setting
  a manual goal when adding a cadet
- The chart color-codes bars: green = goal met, red = still in progress
