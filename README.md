<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CAP Springfield — WAA Tracker</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', sans-serif;
      background: #f0f2f5;
      color: #1a1a2e;
      min-height: 100vh;
    }

    header {
      background: linear-gradient(135deg, #1a2744 0%, #0d3b6e 100%);
      color: white;
      padding: 20px 32px;
      display: flex;
      align-items: center;
      gap: 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,.3);
    }
    header img { height: 52px; }
    header h1 { font-size: 1.4rem; font-weight: 700; line-height: 1.2; }
    header p { font-size: .85rem; opacity: .75; margin-top: 2px; }

    nav {
      display: flex;
      gap: 0;
      background: #162039;
      padding: 0 32px;
    }
    nav button {
      background: none;
      border: none;
      color: #aac4e8;
      padding: 12px 22px;
      font-size: .9rem;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all .2s;
    }
    nav button.active, nav button:hover {
      color: white;
      border-bottom-color: #5b9bd5;
    }

    .toolbar {
      display: flex;
      gap: 10px;
      padding: 18px 32px 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .btn {
      padding: 9px 18px;
      border-radius: 7px;
      border: none;
      font-size: .88rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: opacity .15s;
    }
    .btn:hover { opacity: .85; }
    .btn-primary { background: #1a6fc4; color: white; }
    .btn-success { background: #2e7d32; color: white; }
    .btn-danger  { background: #c62828; color: white; }
    .btn-sm { padding: 5px 11px; font-size: .8rem; }

    .status-bar {
      font-size: .8rem;
      color: #666;
      margin-left: auto;
      padding-right: 32px;
    }

    /* CARDS */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 18px;
      padding: 18px 32px 32px;
    }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
      padding: 20px;
      position: relative;
      border-top: 4px solid #1a6fc4;
      transition: transform .15s, box-shadow .15s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.12); }

    .card-name {
      font-size: 1.05rem;
      font-weight: 700;
      color: #1a2744;
      margin-bottom: 14px;
    }

    .card-stats {
      display: flex;
      gap: 12px;
      margin-bottom: 14px;
    }
    .stat-box {
      flex: 1;
      background: #f0f4fa;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .stat-box .val {
      font-size: 1.5rem;
      font-weight: 800;
      color: #1a6fc4;
    }
    .stat-box .lbl {
      font-size: .72rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: .05em;
      margin-top: 2px;
    }

    .progress-wrap { margin-bottom: 10px; }
    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: .78rem;
      color: #666;
      margin-bottom: 4px;
    }
    .progress-bar {
      height: 10px;
      background: #e0e7ef;
      border-radius: 99px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 99px;
      transition: width .6s ease;
      background: linear-gradient(90deg, #1a6fc4, #5b9bd5);
    }
    .progress-fill.done { background: linear-gradient(90deg, #2e7d32, #66bb6a); }

    .card-meta {
      font-size: .75rem;
      color: #aaa;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-del {
      background: none;
      border: none;
      color: #e57373;
      cursor: pointer;
      font-size: .78rem;
      padding: 2px 4px;
    }
    .card-del:hover { text-decoration: underline; }

    /* CHART PAGE */
    #chart-page { padding: 24px 32px; display: none; }
    #chart-page h2 { font-size: 1.1rem; font-weight: 700; color: #1a2744; margin-bottom: 18px; }
    .chart-wrap {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
      max-width: 900px;
    }

    /* MODAL */
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    .modal {
      background: white;
      border-radius: 14px;
      padding: 28px;
      width: 400px;
      max-width: 95vw;
      box-shadow: 0 8px 32px rgba(0,0,0,.2);
    }
    .modal h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 18px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 5px; color: #444; }
    .form-group input {
      width: 100%;
      padding: 9px 12px;
      border: 1.5px solid #d0d7e2;
      border-radius: 7px;
      font-size: .9rem;
      outline: none;
      transition: border-color .15s;
    }
    .form-group input:focus { border-color: #1a6fc4; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #aaa;
      grid-column: 1/-1;
    }
    .empty-state .icon { font-size: 3rem; margin-bottom: 12px; }
    .empty-state p { font-size: .95rem; }

    .spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,.4);
      border-top-color: white;
      border-radius: 50%;
      animation: spin .6s linear infinite;
      margin-right: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: .72rem;
      font-weight: 700;
    }
    .badge-green { background: #e8f5e9; color: #2e7d32; }
    .badge-yellow { background: #fff8e1; color: #f57f17; }
    .badge-red { background: #ffebee; color: #c62828; }

    @media (max-width: 600px) {
      header { padding: 14px 16px; }
      .toolbar { padding: 12px 16px 6px; }
      .cards-grid { padding: 12px 16px 24px; }
      #chart-page { padding: 16px; }
    }
  </style>
</head>
<body>

<header>
  <div>
    <h1>✈️ CAP Springfield Composite Squadron</h1>
    <p>Wreaths Across America — Cadet Fundraising Tracker</p>
  </div>
</header>

<nav>
  <button class="active" onclick="showPage('dashboard')">📋 Dashboard</button>
  <button onclick="showPage('chart')">📊 Goal vs. Progress</button>
</nav>

<div id="dashboard-page">
  <div class="toolbar">
    <button class="btn btn-success" onclick="openAddModal()">➕ Add Cadet</button>
    <button class="btn btn-primary" id="refreshBtn" onclick="refreshData()">🔄 Refresh Data</button>
    <div class="status-bar" id="statusBar">Loading...</div>
  </div>
  <div class="cards-grid" id="cardsGrid"></div>
</div>

<div id="chart-page">
  <h2>Goal vs. Wreaths Sold — All Cadets</h2>
  <div class="chart-wrap">
    <canvas id="myChart" height="120"></canvas>
  </div>
</div>

<!-- Add Cadet Modal -->
<div class="modal-overlay" id="addModal" style="display:none">
  <div class="modal">
    <h2>➕ Add Cadet</h2>
    <div class="form-group">
      <label>Cadet Name</label>
      <input id="inp-name" type="text" placeholder="e.g. Cadet Jane Smith" />
    </div>
    <div class="form-group">
      <label>WAA Profile URL</label>
      <input id="inp-url" type="url" placeholder="https://wreathsacrossamerica.org/pages/XXXXXX/Overview" />
    </div>
    <div class="form-group">
      <label>Personal Goal (wreaths)</label>
      <input id="inp-goal" type="number" placeholder="e.g. 50" min="0" />
    </div>
    <div id="addError" style="color:#c62828;font-size:.82rem;min-height:18px;"></div>
    <div class="modal-actions">
      <button class="btn" style="background:#eee;color:#333" onclick="closeAddModal()">Cancel</button>
      <button class="btn btn-success" id="addBtn" onclick="addCadet()">Add & Scrape</button>
    </div>
  </div>
</div>

<script>
  const API = "/api/proxy";
  let cadets = [];
  let chart = null;

  // ---- Page switcher ----
  function showPage(page) {
    document.querySelectorAll("nav button").forEach((b, i) => {
      b.classList.toggle("active", (i === 0 && page === "dashboard") || (i === 1 && page === "chart"));
    });
    document.getElementById("dashboard-page").style.display = page === "dashboard" ? "" : "none";
    document.getElementById("chart-page").style.display = page === "chart" ? "" : "none";
    if (page === "chart") renderChart();
  }

  // ---- Load data ----
  async function loadCadets() {
    setStatus("Loading cadets...");
    try {
      const r = await fetch(`${API}?action=list`);
      const d = await r.json();
      cadets = d.cadets || [];
      renderCards();
      setStatus(`Last loaded: ${new Date().toLocaleTimeString()} · ${cadets.length} cadet(s)`);
    } catch (e) {
      setStatus("⚠️ Could not load data. Check API config.");
    }
  }

  // ---- Refresh ----
  async function refreshData() {
    const btn = document.getElementById("refreshBtn");
    btn.innerHTML = `<span class="spinner"></span> Refreshing...`;
    btn.disabled = true;
    try {
      const r = await fetch(`${API}?action=refresh`, { method: "POST" });
      const d = await r.json();
      cadets = d.cadets || [];
      renderCards();
      if (chart) renderChart();
      setStatus(`Refreshed: ${new Date().toLocaleTimeString()} · ${cadets.length} cadet(s)`);
    } catch (e) {
      setStatus("⚠️ Refresh failed.");
    }
    btn.innerHTML = "🔄 Refresh Data";
    btn.disabled = false;
  }

  // ---- Add cadet ----
  function openAddModal() {
    document.getElementById("addModal").style.display = "flex";
    document.getElementById("addError").textContent = "";
    document.getElementById("inp-name").value = "";
    document.getElementById("inp-url").value = "";
    document.getElementById("inp-goal").value = "";
  }
  function closeAddModal() {
    document.getElementById("addModal").style.display = "none";
  }

  async function addCadet() {
    const name = document.getElementById("inp-name").value.trim();
    const url  = document.getElementById("inp-url").value.trim();
    const goal = parseInt(document.getElementById("inp-goal").value, 10) || 0;
    const errEl = document.getElementById("addError");

    if (!name) { errEl.textContent = "Please enter cadet name."; return; }
    if (!url || !url.startsWith("http")) { errEl.textContent = "Please enter a valid WAA URL."; return; }

    const btn = document.getElementById("addBtn");
    btn.innerHTML = `<span class="spinner"></span> Scraping...`;
    btn.disabled = true;

    try {
      const r = await fetch(`${API}?action=add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, goal })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      cadets.push(d.cadet);
      renderCards();
      closeAddModal();
      setStatus(`Added ${name} · ${cadets.length} cadet(s)`);
    } catch (e) {
      errEl.textContent = "Error: " + e.message;
    }
    btn.innerHTML = "Add & Scrape";
    btn.disabled = false;
  }

  // ---- Delete cadet ----
  async function deleteCadet(id, name) {
    if (!confirm(`Remove ${name} from the tracker?`)) return;
    await fetch(`${API}?action=delete&id=${id}`, { method: "DELETE" });
    cadets = cadets.filter(c => c.id !== id);
    renderCards();
    if (chart) renderChart();
    setStatus(`Removed ${name} · ${cadets.length} cadet(s)`);
  }

  // ---- Render cards ----
  function renderCards() {
    const grid = document.getElementById("cardsGrid");
    if (!cadets.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">🎗️</div><p>No cadets yet.<br>Click <strong>Add Cadet</strong> to get started.</p></div>`;
      return;
    }
    grid.innerHTML = cadets.map(c => {
      const pct = c.goal > 0 ? Math.min(100, Math.round((c.sold / c.goal) * 100)) : 0;
      const done = pct >= 100;
      const badge = pct >= 100
        ? `<span class="badge badge-green">✅ Goal Met!</span>`
        : pct >= 75
        ? `<span class="badge badge-yellow">🔥 Almost There</span>`
        : `<span class="badge badge-red">🎯 In Progress</span>`;
      const updated = c.lastUpdated
        ? new Date(c.lastUpdated).toLocaleDateString()
        : "—";
      return `
        <div class="card">
          <div class="card-name">${c.name}</div>
          <div class="card-stats">
            <div class="stat-box">
              <div class="val">${c.sold ?? 0}</div>
              <div class="lbl">Sold (${c.year ?? new Date().getFullYear()})</div>
            </div>
            <div class="stat-box">
              <div class="val">${c.goal ?? 0}</div>
              <div class="lbl">Goal</div>
            </div>
          </div>
          <div class="progress-wrap">
            <div class="progress-label">
              <span>${badge}</span>
              <span>${pct}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${done ? 'done' : ''}" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="card-meta">
            <span>Updated: ${updated}</span>
            <button class="card-del" onclick="deleteCadet('${c.id}','${c.name}')">✕ Remove</button>
          </div>
        </div>`;
    }).join("");
  }

  // ---- Chart ----
  function renderChart() {
    const labels = cadets.map(c => c.name.replace(/^Cadet\s+/i, ""));
    const goals  = cadets.map(c => c.goal || 0);
    const sold   = cadets.map(c => c.sold || 0);

    if (chart) chart.destroy();
    const ctx = document.getElementById("myChart").getContext("2d");
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Goal",
            data: goals,
            backgroundColor: "rgba(26, 111, 196, 0.25)",
            borderColor: "rgba(26, 111, 196, 0.8)",
            borderWidth: 2,
            borderRadius: 6
          },
          {
            label: "Wreaths Sold",
            data: sold,
            backgroundColor: sold.map((s, i) =>
              s >= goals[i] ? "rgba(46, 125, 50, 0.75)" : "rgba(198, 40, 40, 0.65)"
            ),
            borderColor: sold.map((s, i) =>
              s >= goals[i] ? "rgba(46, 125, 50, 1)" : "rgba(198, 40, 40, 1)"
            ),
            borderWidth: 2,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                if (ctx.datasetIndex === 1) {
                  const g = goals[ctx.dataIndex];
                  const s = sold[ctx.dataIndex];
                  const pct = g > 0 ? Math.round((s / g) * 100) : 0;
                  return `${pct}% of goal`;
                }
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Wreaths" }
          },
          x: {
            title: { display: true, text: "Cadet" }
          }
        }
      }
    });
  }

  function setStatus(msg) {
    document.getElementById("statusBar").textContent = msg;
  }

  // ---- Init ----
  loadCadets();
</script>
</body>
</html>
