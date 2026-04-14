// api/proxy.js — Vercel Serverless Function
// Fix: use module.exports (not export default) for non-Next.js Vercel projects

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CADETS_KEY = "waa:cadets";

// --- Redis helpers ---
async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
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
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract cadet name
    const nameMatch =
      html.match(/Cadet\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s*[-–]/i) ||
      html.match(/Cadet\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i);
    let name = "Unknown Cadet";
    if (nameMatch) {
      name = `Cadet ${nameMatch[1].trim()}`;
    }

    // Extract wreaths sold — "X Wreaths so Far"
    const soldMatch = html.match(/(\d[\d,]*)\s+Wreaths?\s+so\s+Far/i);
    const sold = soldMatch ? parseInt(soldMatch[1].replace(/,/g, ""), 10) : 0;

    // Extract year from "YYYY So Far"
    const yearMatch = html.match(/(\d{4})\s+So\s+Far/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    // Individual cadet goal
    const cadetGoalMatch = html.match(/goal\s+of\s+(\d[\d,]*)/i);
    const coverageGoalMatch = html.match(/Coverage\s+Goal[:\s]*([0-9,]+)/i);
    const goal = cadetGoalMatch
      ? parseInt(cadetGoalMatch[1].replace(/,/g, ""), 10)
      : coverageGoalMatch
      ? parseInt(coverageGoalMatch[1].replace(/,/g, ""), 10)
      : 0;

    return { name, sold, year, goal, lastUpdated: new Date().toISOString(), error: null };
  } catch (err) {
    return {
      name: "Scrape Error",
      sold: 0,
      year: new Date().getFullYear(),
      goal: 0,
      lastUpdated: new Date().toISOString(),
      error: err.message
    };
  }
}

// --- Body parser helper ---
async function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

// --- Main handler (module.exports — required for Vercel non-Next.js) ---
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get("action");
  const id = url.searchParams.get("id");

  try {
    // GET ?action=list
    if (req.method === "GET" && action === "list") {
      const cadets = (await redisGet(CADETS_KEY)) || [];
      return res.status(200).json({ cadets });
    }

    // POST ?action=add
    if (req.method === "POST" && action === "add") {
      const body = await parseBody(req);
      const { name, url: waaUrl, goal: manualGoal } = body;
      if (!name || !waaUrl) return res.status(400).json({ error: "name and url required" });

      const cadets = (await redisGet(CADETS_KEY)) || [];
      const scraped = await scrapeWAAPage(waaUrl);

      // Allow manual goal override
      if (manualGoal && parseInt(manualGoal, 10) > 0) {
        scraped.goal = parseInt(manualGoal, 10);
      }

      const newCadet = { id: Date.now().toString(), name, url: waaUrl, ...scraped };
      cadets.push(newCadet);
      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: newCadet });
    }

    // POST ?action=refresh
    if (req.method === "POST" && action === "refresh") {
      const cadets = (await redisGet(CADETS_KEY)) || [];
      const updated = await Promise.all(
        cadets.map(async c => {
          const scraped = await scrapeWAAPage(c.url);
          // Preserve manual goal if set higher than scraped
          if (c.manualGoal) scraped.goal = c.manualGoal;
          return { ...c, ...scraped };
        })
      );
      await redisSet(CADETS_KEY, updated);
      return res.status(200).json({ cadets: updated });
    }

    // DELETE ?action=delete&id=XXX
    if (req.method === "DELETE" && action === "delete") {
      let cadets = (await redisGet(CADETS_KEY)) || [];
      cadets = cadets.filter(c => c.id !== id);
      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
};
