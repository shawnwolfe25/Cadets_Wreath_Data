// api/proxy.js — Vercel Serverless Function
// Scrapes WAA cadet pages and caches data in Upstash Redis

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CADETS_KEY = "waa:cadets";

// --- Redis GET ---
async function redisGet(key) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const j = await r.json();
  if (!j.result) return [];

  let val = j.result;
  for (let i = 0; i < 5; i++) {
    if (Array.isArray(val)) {
      if (val.length === 1 && typeof val[0] === "string") {
        try { val = JSON.parse(val[0]); continue; } catch { break; }
      }
      if (val.length === 0 || typeof val[0] === "object") break;
    }
    if (typeof val === "string") {
      try { val = JSON.parse(val); continue; } catch { break; }
    }
    break;
  }
  return Array.isArray(val) ? val : [];
}

// --- Redis SET (pipeline) ---
async function redisSet(key, value) {
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([["SET", key, JSON.stringify(value)]])
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Redis SET failed: ${txt}`);
  }
}

// --- WAA Page Scraper ---
async function scrapeWAAPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const yearMatch = html.match(/(\d{4})\s+So\s+Far/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    const soldMatch = html.match(/(\d[\d,]*)\s+Wreaths?\s+so\s+Far/i);
    const sold = soldMatch ? parseInt(soldMatch[1].replace(/,/g, ""), 10) : 0;

    return { sold, year, lastUpdated: new Date().toISOString(), scrapeError: null };
  } catch (err) {
    return { sold: 0, year: new Date().getFullYear(), lastUpdated: new Date().toISOString(), scrapeError: err.message };
  }
}

// --- Body parser ---
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

// --- Main Handler ---
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const action = urlObj.searchParams.get("action");
  const id     = urlObj.searchParams.get("id");

  try {

    // LIST
    if (req.method === "GET" && action === "list") {
      const cadets = await redisGet(CADETS_KEY);
      return res.status(200).json({ cadets });
    }

    // DEBUG
    if (req.method === "GET" && action === "debug") {
      const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(CADETS_KEY)}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
      const raw = await r.json();
      return res.status(200).json({ raw, resultType: typeof raw.result });
    }

    // ADD
    if (req.method === "POST" && action === "add") {
      const body = await parseBody(req);
      const { name, url: waaUrl, goal } = body;
      if (!name || !waaUrl) return res.status(400).json({ error: "name and url are required" });

      const cadets = await redisGet(CADETS_KEY);
      const scraped = await scrapeWAAPage(waaUrl);

      const newCadet = {
        id: Date.now().toString(),
        name,
        url: waaUrl,
        goal: parseInt(goal, 10) || 0,
        sold: scraped.sold,
        year: scraped.year,
        lastUpdated: scraped.lastUpdated,
        scrapeError: scraped.scrapeError
      };

      cadets.push(newCadet);
      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: newCadet });
    }

    // EDIT — update name and/or goal only
    if (req.method === "PUT" && action === "edit") {
      const body = await parseBody(req);
      const { name, goal } = body;
      if (!id) return res.status(400).json({ error: "id is required" });

      const cadets = await redisGet(CADETS_KEY);
      const idx = cadets.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ error: "Cadet not found" });

      if (name) cadets[idx].name = name.trim();
      if (goal !== undefined) cadets[idx].goal = parseInt(goal, 10) || 0;

      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: cadets[idx] });
    }

    // REFRESH
    if (req.method === "POST" && action === "refresh") {
      const cadets = await redisGet(CADETS_KEY);
      const updated = await Promise.all(
        cadets.map(async c => {
          const scraped = await scrapeWAAPage(c.url);
          return {
            ...c,
            sold: scraped.sold,
            year: scraped.year,
            lastUpdated: scraped.lastUpdated,
            scrapeError: scraped.scrapeError
          };
        })
      );
      await redisSet(CADETS_KEY, updated);
      return res.status(200).json({ cadets: updated });
    }

    // DELETE
    if (req.method === "DELETE" && action === "delete") {
      let cadets = await redisGet(CADETS_KEY);
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
