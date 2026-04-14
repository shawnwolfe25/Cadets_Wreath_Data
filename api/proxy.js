// api/proxy.js — Vercel Serverless Function
// Scrapes WAA cadet pages and caches data in Upstash Redis

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CADETS_KEY = "waa:cadets";

// --- Redis helpers ---
async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ value: JSON.stringify(value) })
  });
}

// --- WAA page scraper ---
async function scrapeWAAPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WAATracker/1.0)" }
    });
    const html = await res.text();

    // Extract cadet name from <title> or page heading
    const nameMatch =
      html.match(/Cadet\s([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    let name = "Unknown Cadet";
    if (nameMatch) {
      name = nameMatch[1].includes("Cadet") ? nameMatch[1] : `Cadet ${nameMatch[1]}`;
      name = name.replace(/\s*-\s*Civil Air Patrol.*$/i, "").trim();
    }

    // Extract wreaths sold — "X Wreaths so Far"
    const soldMatch = html.match(/(\d[\d,]*)\s+Wreaths?\s+so\s+Far/i);
    const sold = soldMatch ? parseInt(soldMatch[1].replace(/,/g, ""), 10) : 0;

    // Extract year
    const yearMatch = html.match(/(\d{4})\s+So\s+Far/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    // Extract goal from Coverage Goal line
    const goalMatch = html.match(/Coverage\s+Goal[:\s]*([0-9,]+)/i);
    const goal = goalMatch ? parseInt(goalMatch[1].replace(/,/g, ""), 10) : null;

    // Individual cadet goal — look for "goal of X" near the top
    const cadetGoalMatch = html.match(/goal\s+of\s+(\d[\d,]*)/i);
    const cadetGoal = cadetGoalMatch
      ? parseInt(cadetGoalMatch[1].replace(/,/g, ""), 10)
      : null;

    return {
      name,
      sold,
      year,
      goal: cadetGoal || goal || 0,
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    return { name: "Error", sold: 0, year: new Date().getFullYear(), goal: 0, error: err.message };
  }
}

// --- Main handler ---
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  // GET /api/proxy?action=list — return cached cadet list
  if (req.method === "GET" && action === "list") {
    const cadets = (await redisGet(CADETS_KEY)) || [];
    return res.status(200).json({ cadets });
  }

  // POST /api/proxy?action=add — add a new cadet
  if (req.method === "POST" && action === "add") {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: "name and url required" });

    const cadets = (await redisGet(CADETS_KEY)) || [];
    const id = Date.now().toString();
    const scraped = await scrapeWAAPage(url);

    const newCadet = { id, name, url, ...scraped };
    cadets.push(newCadet);
    await redisSet(CADETS_KEY, cadets);
    return res.status(200).json({ cadet: newCadet });
  }

  // POST /api/proxy?action=refresh — re-scrape all cadets
  if (req.method === "POST" && action === "refresh") {
    const cadets = (await redisGet(CADETS_KEY)) || [];
    const updated = await Promise.all(
      cadets.map(async c => {
        const scraped = await scrapeWAAPage(c.url);
        return { ...c, ...scraped };
      })
    );
    await redisSet(CADETS_KEY, updated);
    return res.status(200).json({ cadets: updated });
  }

  // DELETE /api/proxy?action=delete&id=XXX — remove a cadet
  if (req.method === "DELETE" && action === "delete") {
    const { id } = req.query;
    let cadets = (await redisGet(CADETS_KEY)) || [];
    cadets = cadets.filter(c => c.id !== id);
    await redisSet(CADETS_KEY, cadets);
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: "Unknown action" });
}
