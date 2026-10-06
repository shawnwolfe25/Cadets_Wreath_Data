This file is copyrighted by Shawn Miller - Springfield, Illinois
# CAP Springfield WAA Tracker

A live fundraising dashboard for Civil Air Patrol Springfield Composite Squadron cadets
participating in Wreaths Across America.

Live site: https://cadets-wreath-data.vercel.app

## Features
- Password sign-in with two roles: **Admin** (full control) and **Read Only** (view only)
- Squadron banner showing the official WAA squadron total vs. squadron goal
- Cadet table showing wreaths sponsored, personal goal, and % progress, with sorting and top-cadet medals
- Live scraping of each cadet's WAA profile page
- Upstash Redis storage (no repeated scrapes on every page load)
- Analytics page: squadron goal coverage, squadron status, top cadets, share of squadron
  total, sponsored vs. goal, and wreaths still needed per cadet
- Add / Edit / Remove cadets and one-click Refresh (admin only)

## Setup

### 1. Clone the repo
```
git clone https://github.com/shawnwolfe25/Cadets_Wreath_Data.git
cd Cadets_Wreath_Data
```

### 2. Create Upstash Redis database
- Go to https://console.upstash.com
- Create a new Redis database (free tier works fine)
- Copy the REST URL and REST Token

### 3. Deploy to Vercel
- Import the GitHub repo at https://vercel.com/new
- In Vercel → Settings → Environment Variables, add:

  | Variable | Required | Purpose |
  |---|---|---|
  | `UPSTASH_REDIS_REST_URL` | Yes | Upstash REST URL |
  | `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash REST token |
  | `WAA_PASS_ADMIN` | Yes | Password for admin sign-in |
  | `WAA_PASS_READ` | Yes | Password for read-only sign-in |
  | `WAA_TOKEN_SECRET` | Recommended | Long random string used to sign login sessions. If unset, one is derived from the two passwords. |

- Click Deploy. Pushes to `main` redeploy production automatically.
- To confirm the variables are set, open `/api/proxy?action=debug` on your deployed site.
  It shows true/false for each one (never the values).

### 4. Add the Squadron entry
- Sign in with the admin password
- Click "Add Cadet" and enter the squadron's WAA page URL and the squadron goal, with a
  temporary name (the Add form won't accept the name `Squadron`)
- Click Edit on that row and rename it to exactly `Squadron`
- This record drives the squadron banner and is not listed as a cadet

### 5. Add Cadets
- Click "Add Cadet"
- Enter the cadet's name, their WAA profile URL
  (e.g. https://wreathsacrossamerica.org/pages/190619/Overview), and their personal wreath goal
- Optionally enter wreaths sponsored, used only if the automatic fetch fails
- The app scrapes and saves the count automatically

## Security
- Signing in returns a session token that lasts 12 hours. The server checks it on every request.
- Viewing data needs either role. Add, edit, refresh, and delete need admin.
- Changing either password, or `WAA_TOKEN_SECRET`, signs everyone out.

## File Structure
```
/
├── index.html          ← Frontend (sign-in, dashboard, analytics charts)
├── api/
│   └── proxy.js        ← Vercel serverless function (auth, scraper, Redis)
├── vercel.json         ← Vercel routing config
├── .env.example        ← Environment variable template
├── dashboard2.png      ← Dashboard screenshot
├── analytics2.png      ← Analytics screenshot
└── README.md
```

## Notes
- Data is saved in Redis. Click "Refresh Live Data" to re-scrape every WAA page.
- Personal goals are entered by the admin, not pulled from WAA. Change them in the Edit modal.
- If a scrape fails or returns 0, the last known count is kept. Use "Wreaths Sponsored
  (manual override)" in the Edit modal to set it by hand.
- The "Wreaths Still Needed" chart color-codes bars: green = goal met, red = still in progress.
- **Matched wreaths**: during a WAA matching period, a cadet's live page can double-count
  sponsorships (10 sponsored shows as 20). Open the cadet's Edit modal and enter the number to
  subtract in "Matched Wreaths to Subtract". That number is re-applied automatically every
  time the count refreshes, so it stays correct until you reset it to 0.
