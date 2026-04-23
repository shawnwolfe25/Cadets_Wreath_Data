// api/proxy.js — Vercel Serverless Function
// WAA sold count is JS-rendered — scraper used as best-effort fallback.
// Manual sold override stored per-cadet and used when scrape returns 0.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PASS_ADMIN  = process.env.WAA_PASS_ADMIN;
const PASS_READ   = process.env.WAA_PASS_READ;
const CADETS_KEY  = "waa:cadets";

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
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([["SET", key, JSON.stringify(value)]])
  });
  if (!r.ok) throw new Error(`Redis SET failed: ${await r.text()}`);
}

// --- WAA Scraper (best-effort — sold count is JS-rendered, may return 0) ---
async function scrapeWAAPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Year — static in HTML
    const yearMatch = html.match(/(\d{4})\s+So\s+Far/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    // Sold — JS-rendered, will almost always be 0 from static HTML
    const soldMatch = html.match(/(\d[\d,]*)\s+Wreaths?\s+so\s+Far/i);
    const scrapedSold = soldMatch ? parseInt(soldMatch[1].replace(/,/g, ""), 10) : 0;

    // Try to find gauge image as a hint (wreath_00.png = 0, wreath_50.png = ~50%, etc.)
    const gaugeMatch = html.match(/wreath_(\d+)\.(?:png|webp)/i);
    const gaugePct = gaugeMatch ? parseInt(gaugeMatch[1], 10) : 0;

    return {
      scrapedSold,
      gaugePct,   // 0–100 rough indicator from gauge image name
      year,
      lastUpdated: new Date().toISOString(),
      scrapeError: null
    };
  } catch (err) {
    return { scrapedSold: 0, gaugePct: 0, year: new Date().getFullYear(), lastUpdated: new Date().toISOString(), scrapeError: err.message };
  }
}

// --- Body parser ---
async function parseBody(req) {
  return new Promise(resolve => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
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

    // ── LOGIN ──
    if (req.method === "POST" && action === "login") {
      const { password } = await parseBody(req);
      if (password === PASS_ADMIN) return res.status(200).json({ role: "admin" });
      if (password === PASS_READ)  return res.status(200).json({ role: "readonly" });
      return res.status(401).json({ error: "Invalid password" });
    }

    // ── LIST ──
    if (req.method === "GET" && action === "list") {
      const cadets = await redisGet(CADETS_KEY);
      return res.status(200).json({ cadets });
    }

    // ── ADD ──
    if (req.method === "POST" && action === "add") {
      const { name, url: waaUrl, goal, manualSold } = await parseBody(req);
      if (!name || !waaUrl) return res.status(400).json({ error: "name and url are required" });

      const cadets  = await redisGet(CADETS_KEY);
      const scraped = await scrapeWAAPage(waaUrl);

      // Use manualSold if provided, otherwise use scraper result
      const sold = (manualSold !== undefined && manualSold !== "")
        ? parseInt(manualSold, 10) || 0
        : scraped.scrapedSold;

      const newCadet = {
        id: Date.now().toString(),
        name, url: waaUrl,
        goal: parseInt(goal, 10) || 0,
        sold,
        manualSold: sold,   // remember the last manually set value
        year: scraped.year,
        lastUpdated: scraped.lastUpdated,
        scrapeError: scraped.scrapeError
      };
      cadets.push(newCadet);
      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: newCadet });
    }

    // ── EDIT (name, goal, and manual sold override) ──
    if (req.method === "PUT" && action === "edit") {
      const { name, goal, manualSold } = await parseBody(req);
      if (!id) return res.status(400).json({ error: "id is required" });

      const cadets = await redisGet(CADETS_KEY);
      const idx = cadets.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ error: "Cadet not found" });

      if (name) cadets[idx].name = name.trim();
      if (goal !== undefined) cadets[idx].goal = parseInt(goal, 10) || 0;
      if (manualSold !== undefined && manualSold !== "") {
        const s = parseInt(manualSold, 10) || 0;
        cadets[idx].sold = s;
        cadets[idx].manualSold = s;
      }

      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: cadets[idx] });
    }

    // ── REFRESH ──
    // Tries scraper — if it returns > 0 it's a lucky hit; otherwise keeps manualSold.
    if (req.method === "POST" && action === "refresh") {
      const cadets  = await redisGet(CADETS_KEY);
      const updated = await Promise.all(cadets.map(async c => {
        const scraped = await scrapeWAAPage(c.url);

        // Only update sold from scraper if it returns a non-zero value
        // (zero almost certainly means JS-rendering blocked it)
        const soldToUse = scraped.scrapedSold > 0
          ? scraped.scrapedSold
          : (c.manualSold ?? c.sold ?? 0);

        return {
          ...c,
          sold: soldToUse,
          year: scraped.year,
          lastUpdated: scraped.lastUpdated,
          scrapeError: scraped.scrapedSold === 0 && !scraped.scrapeError
            ? "Live count JS-rendered — showing last known value. Update manually if needed."
            : scraped.scrapeError
        };
      }));
      await redisSet(CADETS_KEY, updated);
      return res.status(200).json({ cadets: updated });
    }

    // ── DELETE ──
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
