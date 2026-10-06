const crypto = require("crypto");

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PASS_ADMIN  = process.env.WAA_PASS_ADMIN;
const PASS_READ   = process.env.WAA_PASS_READ;
const CADETS_KEY  = "waa:cadets";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // sessions last 12 hours

// Signing secret for session tokens. If WAA_TOKEN_SECRET isn't set, derive one
// from the two passwords — changing either password then logs everyone out.
const TOKEN_SECRET = process.env.WAA_TOKEN_SECRET
  || ((PASS_ADMIN || PASS_READ) ? `${PASS_ADMIN || ""}:${PASS_READ || ""}` : null);

// --- Auth helpers ---
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(data) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(data).digest("base64url");
}

function issueToken(role) {
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Returns "admin" | "readonly" | null
function verifyToken(req) {
  if (!TOKEN_SECRET) return null;
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || Date.now() > exp) return null;
    return role === "admin" || role === "readonly" ? role : null;
  } catch { return null; }
}

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

// --- Redis SET ---
async function redisSet(key, value) {
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([["SET", key, JSON.stringify(value)]])
  });
  if (!r.ok) throw new Error(`Redis SET failed: ${await r.text()}`);
}

// --- WAA Scraper ---
// The WAA page renders stats server-side inside a div with data-template="wreaths-statistics"
// Example: <center>15 Wreaths Sponsored<br>30.0% to Goal<br>35 To Go!<br></center>
// We parse that block directly — no JS execution needed.
async function scrapeWAAPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Primary: parse the wreaths-statistics block
    // Matches: "15 Wreaths Sponsored" inside the data-template="wreaths-statistics" div
    const statsBlockMatch = html.match(/data-template=["']wreaths-statistics["'][^>]*>([\s\S]*?)<\/div>/i);
    let scrapedSold = 0;
    let scrapeError = null;

    if (statsBlockMatch) {
      const block = statsBlockMatch[1];
      // Match "15 Wreaths Sponsored" or "1,234 Wreaths Sponsored"
      const soldMatch = block.match(/([\d,]+)\s+Wreaths?\s+Sponsored/i);
      if (soldMatch) {
        scrapedSold = parseInt(soldMatch[1].replace(/,/g, ""), 10);
      } else {
        scrapeError = "Stats block found but could not parse wreath count.";
      }
    } else {
      // Fallback: look for the pattern anywhere in the page
      const fallbackMatch = html.match(/([\d,]+)\s+Wreaths?\s+Sponsored/i);
      if (fallbackMatch) {
        scrapedSold = parseInt(fallbackMatch[1].replace(/,/g, ""), 10);
      } else {
        scrapeError = "Could not find wreath count in page — WAA may have changed their layout.";
      }
    }

    // Extract year from "2026 So Far" heading
    const yearMatch = html.match(/(\d{4})\s+So\s+Far/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    return { scrapedSold, year, lastUpdated: new Date().toISOString(), scrapeError };
  } catch (err) {
    return { scrapedSold: 0, year: new Date().getFullYear(), lastUpdated: new Date().toISOString(), scrapeError: err.message };
  }
}

// --- Duplicate/matched-wreath adjustment ---
// During certain windows WAA's live page includes matched wreaths, which can
// double-count what a cadet actually sold (e.g. 10 sold shows as 20 sponsored).
// `duplicates` is an admin-entered number that gets subtracted from the raw
// scraped/manual count to produce the "sold" figure the dashboard displays.
function netSold(raw, duplicates) {
  const d = Math.max(0, parseInt(duplicates, 10) || 0);
  return Math.max(0, (raw || 0) - d);
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") return res.status(200).end();

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const action = urlObj.searchParams.get("action");
  const id     = urlObj.searchParams.get("id");

  try {

    // ── LOGIN ──
    if (req.method === "POST" && action === "login") {
      const body = await parseBody(req);
      const password = body.password;
      if (!password) return res.status(400).json({ error: "Password required" });
      if (!TOKEN_SECRET) return res.status(500).json({ error: "Server passwords are not configured" });
      let role = null;
      if (PASS_ADMIN && safeEqual(password, PASS_ADMIN))     role = "admin";
      else if (PASS_READ && safeEqual(password, PASS_READ)) role = "readonly";
      if (!role) return res.status(401).json({ error: "Incorrect password" });
      return res.status(200).json({ role, token: issueToken(role) });
    }

    // ── DEBUG ──
    if (req.method === "GET" && action === "debug") {
      return res.status(200).json({
        hasRedisUrl:   !!REDIS_URL,
        hasRedisToken: !!REDIS_TOKEN,
        hasPassAdmin:  !!PASS_ADMIN,
        hasPassRead:   !!PASS_READ
      });
    }

    // ── AUTH GATE ──
    // Everything below requires a valid session token. Reads need any role;
    // writes (add/edit/refresh/delete) need admin.
    const role = verifyToken(req);
    if (!role) return res.status(401).json({ error: "Not signed in or session expired" });
    const isRead = req.method === "GET" && action === "list";
    if (!isRead && role !== "admin") return res.status(403).json({ error: "Admin access required" });

    // ── LIST ──
    if (req.method === "GET" && action === "list") {
      const cadets = await redisGet(CADETS_KEY);
      return res.status(200).json({ cadets });
    }

    // ── ADD ──
    if (req.method === "POST" && action === "add") {
      const { name, url: waaUrl, goal, manualSold, duplicates } = await parseBody(req);
      if (!name || !waaUrl) return res.status(400).json({ error: "name and url are required" });
      const cadets  = await redisGet(CADETS_KEY);
      const scraped = await scrapeWAAPage(waaUrl);
      // Use scraped value if available; fall back to manually entered value
      const rawSold = scraped.scrapedSold > 0
        ? scraped.scrapedSold
        : (manualSold !== undefined && manualSold !== "" ? parseInt(manualSold, 10) || 0 : 0);
      const dup = Math.max(0, parseInt(duplicates, 10) || 0);
      const newCadet = {
        id: Date.now().toString(),
        name, url: waaUrl,
        goal: parseInt(goal, 10) || 0,
        rawSold,
        duplicates: dup,
        sold: netSold(rawSold, dup),
        manualSold: (manualSold !== undefined && manualSold !== "") ? parseInt(manualSold, 10) || 0 : rawSold,
        year: scraped.year,
        lastUpdated: scraped.lastUpdated,
        scrapeError: scraped.scrapeError
      };
      cadets.push(newCadet);
      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: newCadet });
    }

    // ── EDIT ──
    if (req.method === "PUT" && action === "edit") {
      const { name, goal, manualSold, duplicates } = await parseBody(req);
      if (!id) return res.status(400).json({ error: "id is required" });
      const cadets = await redisGet(CADETS_KEY);
      const idx = cadets.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ error: "Cadet not found" });
      if (name) cadets[idx].name = name.trim();
      if (goal !== undefined) cadets[idx].goal = parseInt(goal, 10) || 0;

      // Older records saved before the duplicates feature won't have rawSold yet —
      // reconstruct it from the last known sold + duplicates already subtracted.
      if (cadets[idx].rawSold === undefined) {
        cadets[idx].rawSold = (cadets[idx].sold || 0) + (cadets[idx].duplicates || 0);
      }

      if (manualSold !== undefined && manualSold !== "") {
        // A manual override replaces the raw (pre-duplicate) count.
        cadets[idx].rawSold    = parseInt(manualSold, 10) || 0;
        cadets[idx].manualSold = cadets[idx].rawSold;
      }

      if (duplicates !== undefined && duplicates !== "") {
        cadets[idx].duplicates = Math.max(0, parseInt(duplicates, 10) || 0);
      }

      cadets[idx].sold = netSold(cadets[idx].rawSold, cadets[idx].duplicates || 0);

      await redisSet(CADETS_KEY, cadets);
      return res.status(200).json({ cadet: cadets[idx] });
    }

    // ── REFRESH ──
    // Re-scrapes every cadet's WAA page and updates live counts.
    // If scraping succeeds (scrapedSold > 0), that value wins.
    // Otherwise, keep the last known manualSold.
    // Each cadet's saved `duplicates` count is re-applied to the fresh raw
    // total every time, since WAA's matching-period double-count keeps
    // recurring on every refresh until the matching window ends.
    if (req.method === "POST" && action === "refresh") {
      const cadets  = await redisGet(CADETS_KEY);
      const updated = await Promise.all(cadets.map(async c => {
        const scraped = await scrapeWAAPage(c.url);
        const rawSold = scraped.scrapedSold > 0
          ? scraped.scrapedSold
          : (c.manualSold ?? c.rawSold ?? c.sold ?? 0);
        const dup = c.duplicates || 0;
        return {
          ...c,
          rawSold,
          duplicates: dup,
          sold: netSold(rawSold, dup),
          year: scraped.year,
          lastUpdated: scraped.lastUpdated,
          scrapeError: scraped.scrapeError
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
