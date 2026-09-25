import {
  analyseSoil,
  isFiniteNumber
} from "./analytics.js";

import {
  fetchEnvironmentalContext,
  contextRelations,
  validCoordinate
} from "./external-context.js";

lucide.createIcons();

function savedPreference(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function storePreference(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
let noticeTimer;
function showNotice(message) {
  let notice = document.getElementById('notice');
  if (!notice) { notice = document.createElement('div'); notice.id = 'notice'; notice.className = 'notice'; notice.setAttribute('role', 'status'); document.body.appendChild(notice); }
  notice.textContent = message; notice.hidden = false; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}
document.getElementById('todayDate').textContent = new Date().toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'});

/* =========================================================
   BASIC HELPERS
========================================================= */

function validNumber(value) {
  return isFiniteNumber(value);
}

function fmt(value, digits = 1) {
  return validNumber(value) ? Number(value).toFixed(digits) : "—";
}

function formatUptime(ms) {
  if (!validNumber(ms)) return "--";

  const total = Math.floor(Number(ms) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function chartNumber(value) { return validNumber(value) ? Number(value) : null; }

function average(values) {
  const clean = values.filter(validNumber).map(Number);
  if (!clean.length) return null;
  return clean.reduce((a,b) => a + b, 0) / clean.length;
}

function tsMs(sample) {
  if (!sample || !validNumber(sample.timestamp)) return null;
  const n = Number(sample.timestamp);
  return n > 1e12 ? n : n * 1000;
}

function clearStateClasses(el) {
  if (!el) return;
  el.classList.remove(
    "trend-up","trend-down","trend-stable",
    "state-good","state-warning","state-danger"
  );
}

/* =========================================================
   MULTI-VIEW NAVIGATION
========================================================= */

const viewMeta = {
  dashboard: ['Workspace', 'Overview'], live: ['Workspace', 'Live readings'],
  history: ['Workspace', 'History'], analytics: ['Workspace', 'Soil insights'],
  weather: ['Workspace', 'Weather'], device: ['Workspace', 'Device'], settings: ['Workspace', 'Settings']
};

const navItems = [...document.querySelectorAll("[data-view]")];
const views = [...document.querySelectorAll(".view")];
const pageEyebrow = document.getElementById("pageEyebrow");
const pageTitle = document.getElementById("pageTitle");

function switchView(name, updateHash = true) {
  if (!viewMeta[name]) name = "dashboard";

  navItems.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === name);
    if (btn.dataset.view === name) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
  });

  views.forEach(view => {
    view.classList.toggle("active", view.id === `view-${name}`);
  });

  pageEyebrow.textContent = viewMeta[name][0];
  pageTitle.textContent = viewMeta[name][1];
  document.title = `${viewMeta[name][1]} — AgroSentra`;
  document.getElementById("mobileMenuButton").setAttribute("aria-expanded", "false");

  if (updateHash) {
    history.pushState(null, "", `#${name}`);
  }

  document.body.classList.remove("menu-open");
  window.scrollTo({ top: 0, behavior: "instant" });

  // Chart.js may need a resize after a hidden view becomes visible.
  setTimeout(() => {
    if (name === "dashboard") overviewChart.resize();
    if (name === "live") sensorChart.resize();
    if (name === "history") historyChart.resize();
  }, 80);
}

navItems.forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.querySelectorAll("[data-jump]").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.jump));
});

const initialView = location.hash.replace("#","") || "dashboard";
switchView(initialView, false);
window.addEventListener("hashchange", () => { if (location.hash !== '#mainContent') switchView(location.hash.slice(1), false); });

document.getElementById("mobileMenuButton").addEventListener("click", () => {
  const open = document.body.classList.toggle("menu-open");
  document.getElementById("mobileMenuButton").setAttribute("aria-expanded", String(open));
  if (open) document.querySelector(".nav-item.active").focus();
});

function closeMenu() { document.body.classList.remove('menu-open'); document.getElementById('mobileMenuButton').setAttribute('aria-expanded','false'); }
document.getElementById('mobileOverlay').addEventListener('click', closeMenu);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('menu-open')) { closeMenu(); document.getElementById('mobileMenuButton').focus(); } });

/* =========================================================
   THEME
========================================================= */

const THEME_KEY = "agrosentra-theme-v3";

function applyTheme(theme) {
  if (!["dark","midnight","light"].includes(theme)) theme = "light";

  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;
  storePreference(THEME_KEY, theme);
  document.querySelector("meta[name=theme-color]").content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();

  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeChoice === theme);
    btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === theme));
  });
}

document.querySelectorAll("[data-theme-choice]").forEach(btn => {
  btn.addEventListener("click", () => { applyTheme(btn.dataset.themeChoice); recolorCharts(); });
});

applyTheme(savedPreference(THEME_KEY) || "light");

/* =========================================================
   STATE
========================================================= */

let currentLiveData = null;
let historicalSamples = [];
let environmentalContext = null;
let monitoringLocation = null;
let lastFirebaseUpdate = 0;
let externalRefreshTimer = null;


const LOCATION_KEY = "agrosentra-monitoring-location-v2";
const EXTERNAL_REFRESH_MS = 10 * 60 * 1000;

const DEFAULT_LOCATION = {
  latitude: 1.560,
  longitude: 110.345,
  label: "The Waterfront Hotel, Kuching",
  source: "default"
};

/* =========================================================
   LIVE CHART
========================================================= */

Chart.defaults.font.family = "'DM Sans', Arial, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#70796b';
Chart.defaults.plugins.tooltip.backgroundColor = '#293324';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 4;
const sensorChart = new Chart(
  document.getElementById("sensorChart"),
  {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Temperature °C",
          data: [],
          borderColor: "#6a8057",
          backgroundColor: "#6a8057",
          borderWidth: 2,
          pointRadius: 0,
          tension: .36
        },
        {
          label: "Moisture %",
          data: [],
          borderColor: "#788d9b",
          backgroundColor: "#788d9b",
          borderWidth: 2,
          pointRadius: 0,
          tension: .36
        },
        {
          label: "pH",
          data: [],
          borderColor: "#aa8b65",
          backgroundColor: "#aa8b65",
          borderWidth: 2,
          pointRadius: 0,
          tension: .36
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 7,
            padding: 17,
            color: "#718692",
            font: { size: 10 }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(127,146,158,.08)" },
          ticks: { color: "#647985", maxTicksLimit: 7, font: { size: 10 } }
        },
        y: {
          grid: { color: "rgba(127,146,158,.08)" },
          ticks: { color: "#647985", font: { size: 10 } }
        }
      }
    }
  }
);

let lastLiveChartTimestamp = null;

function addLiveChartReading(data) {
  if (
    !validNumber(data.temperature) ||
    !validNumber(data.moisture) ||
    !validNumber(data.ph)
  ) return;

  const key = validNumber(data.timestamp) ? Number(data.timestamp) : Date.now();

  if (key === lastLiveChartTimestamp) return;
  lastLiveChartTimestamp = key;

  sensorChart.data.labels.push(
    new Date(tsMs(data) || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  );

  sensorChart.data.datasets[0].data.push(chartNumber(data.temperature));
  sensorChart.data.datasets[1].data.push(chartNumber(data.moisture));
  sensorChart.data.datasets[2].data.push(chartNumber(data.ph));

  while (sensorChart.data.labels.length > 40) {
    sensorChart.data.labels.shift();
    sensorChart.data.datasets.forEach(ds => ds.data.shift());
  }

  sensorChart.update("none");
}

/* =========================================================
   HISTORY CHART
========================================================= */

const historyChart = new Chart(
  document.getElementById("historyChart"),
  {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Moisture %",
          data: [],
          borderColor: "#788d9b",
          backgroundColor: "#788d9b",
          borderWidth: 2,
          pointRadius: 0,
          tension: .3
        },
        {
          label: "Temperature °C",
          data: [],
          borderColor: "#6a8057",
          backgroundColor: "#6a8057",
          borderWidth: 2,
          pointRadius: 0,
          tension: .3
        },
        {
          label: "pH",
          data: [],
          borderColor: "#aa8b65",
          backgroundColor: "#aa8b65",
          borderWidth: 2,
          pointRadius: 0,
          tension: .3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 180 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 7,
            padding: 17,
            color: "#718692",
            font: { size: 10 }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(127,146,158,.08)" },
          ticks: { color: "#647985", maxTicksLimit: 8, font: { size: 10 } }
        },
        y: {
          grid: { color: "rgba(127,146,158,.08)" },
          ticks: { color: "#647985", font: { size: 10 } }
        }
      }
    }
  }
);

document.getElementById("historyChartRange").addEventListener("change", renderHistory);
let overviewRange = 1440;
const overviewChart = new Chart(document.getElementById('overviewChart'), {
  type:'line', data:{labels:[], datasets:[{label:'Moisture %', data:[], borderColor:'#6a8057', backgroundColor:'rgba(106,128,87,.07)', fill:true, borderWidth:2, pointRadius:0, pointHoverRadius:4, tension:.3}]},
  options:{responsive:true, maintainAspectRatio:false, animation:false, interaction:{intersect:false,mode:'index'}, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},border:{display:false},ticks:{maxTicksLimit:5,font:{size:9},maxRotation:0}}, y:{min:0,max:100,border:{display:false},grid:{color:'rgba(120,130,100,.1)'},ticks:{stepSize:25,padding:10,font:{size:9}}}}}
});
function renderOverviewTrend() {
  const rows = filterHistoryByMinutes(overviewRange);
  overviewChart.data.labels = rows.map(s => new Date(tsMs(s)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
  overviewChart.data.datasets[0].data = rows.map(s => chartNumber(s.moisture));
  overviewChart.update('none');
  document.getElementById('overviewEmpty').hidden = rows.some(s => validNumber(s.moisture));
  document.getElementById('overviewCoverage').textContent = rows.length ? rows.length + ' samples' : 'No samples yet';
  document.getElementById('overviewPeriod').textContent = rows.length ? new Date(tsMs(rows.at(-1))).toLocaleDateString([], {day:'numeric',month:'short',year:'numeric'}) + ' · Most recent recorded window' : 'Recorded measurements will appear here';
}
document.querySelectorAll('[data-overview-range]').forEach(button => button.addEventListener('click', () => {
  overviewRange = Number(button.dataset.overviewRange);
  document.querySelectorAll('[data-overview-range]').forEach(b => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  renderOverviewTrend();
}));
function recolorCharts() {
  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue('--muted').trim();
  const colors = ['--green', '--blue', '--orange'].map(v => styles.getPropertyValue(v).trim());
  [sensorChart, historyChart, overviewChart].forEach(chart => {
    chart.data.datasets.forEach((d,i) => { d.borderColor = colors[i % colors.length]; if(chart !== overviewChart) d.backgroundColor = d.borderColor; });
    chart.options.scales.x.ticks.color = muted; chart.options.scales.y.ticks.color = muted;
    if(chart.options.plugins.legend.labels) chart.options.plugins.legend.labels.color = muted;
    chart.update('none');
  });
}
recolorCharts();


/* =========================================================
   LIVE VALUES / DASHBOARD
========================================================= */

const liveIds = {
  voltage: ["voltage", 2],
  current: ["current", 1],
  temperature: ["temperature", 1],
  moisture: ["moisture", 1],
  ph: ["ph", 1],
  ec: ["ec", 0],
  nitrogen: ["nitrogen", 0],
  phosphorus: ["phosphorus", 0],
  potassium: ["potassium", 0],
  salinity: ["salinity", 0]
};

function updateLiveValues(data) {
  for (const [field, [id, digits]] of Object.entries(liveIds)) {
    const el = document.getElementById(id);
    if (el) el.textContent = fmt(data[field], digits);
  }

  document.getElementById("dashMoisture").textContent = fmt(data.moisture, 1);
  document.getElementById("dashPh").textContent = fmt(data.ph, 1);
  document.getElementById("dashTemperature").textContent = fmt(data.temperature, 1);
  document.getElementById("dashEc").textContent = fmt(data.ec, 0);

  const rssi = validNumber(data.rssi) ? `${data.rssi} dBm` : "--";
  const uptime = formatUptime(data.uptime_ms);

  document.getElementById("rssi").textContent = rssi;
  document.getElementById("uptime").textContent = uptime;
  document.getElementById("dashRssi").textContent = rssi;
  document.getElementById("dashUptime").textContent = uptime;

  document.getElementById("soilStatus").textContent =
    data.soil_ok === false ? "Probe Error" : "Online";

  document.getElementById("powerStatus").textContent =
    data.power_ok === false ? "INA219 Error" : "Online";

  document.getElementById("firebaseStatus").textContent = "Connected";
}

function liveHealthScore(data) {
  let score = 100;

  const m = chartNumber(data.moisture);
  const p = chartNumber(data.ph);
  const t = chartNumber(data.temperature);
  const ec = Number(data.ec);

  if (Number.isFinite(m) && (m < 30 || m > 80)) score -= 20;
  if (Number.isFinite(p) && (p < 5.5 || p > 7.5)) score -= 25;
  if (Number.isFinite(t) && (t < 15 || t > 35)) score -= 15;
  if (Number.isFinite(ec) && ec > 2000) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function updateDashboardCondition(data) {
  if (![data.moisture, data.ph, data.temperature, data.ec].every(validNumber)) {
    document.getElementById('dashHealthScore').textContent = '—';
    document.getElementById('dashHealthRing').style.background = 'var(--surface-3)';
    document.getElementById('dashHealthBadge').className = 'status-pill neutral';
    document.getElementById('dashHealthBadge').textContent = 'Incomplete data';
    document.getElementById('dashHealthTitle').textContent = 'A few readings are missing.';
    document.getElementById('dashHealthText').textContent = 'Moisture, pH, temperature and conductivity are needed to calculate a condition score.';
    return;
  }
  const score = liveHealthScore(data);
  const ring = document.getElementById("dashHealthRing");
  const badge = document.getElementById("dashHealthBadge");
  const title = document.getElementById("dashHealthTitle");
  const text = document.getElementById("dashHealthText");

  document.getElementById("dashHealthScore").textContent = score;

  ring.style.background =
    `conic-gradient(var(--green) ${score}%, rgba(127,146,158,.13) ${score}%)`;

  badge.className = "status-pill";

  if (score === 100) {
    badge.classList.add("good");
    badge.textContent = "Healthy";
    title.textContent = "Latest readings are in range";
    text.textContent =
      "The latest measured soil values are within the prototype preferred ranges.";
  } else if (score >= 60) {
    badge.classList.add("warning");
    badge.textContent = "Attention";
    title.textContent = "Some readings need attention";
    text.textContent =
      "One or more soil parameters are outside the prototype preferred ranges.";
  } else {
    badge.classList.add("danger");
    badge.textContent = "Warning";
    title.textContent = "Multiple parameters require attention";
    text.textContent =
      "Several current readings are outside the prototype preferred ranges.";
  }
}

/* =========================================================
   ONLINE STATUS
========================================================= */

function setConnection(online) {
  for (const id of ['sidebarStatusDot', 'topStatusDot']) document.getElementById(id).className = 'online-dot ' + (online ? 'online' : 'offline');
  document.getElementById('sidebarDeviceStatus').textContent = online ? 'Station online' : 'Station offline';
  document.getElementById('topStatusText').textContent = online ? 'Online' : 'Offline';
  document.getElementById('liveFeedBadge').innerHTML = '<span></span>' + (online ? 'Live readings' : 'Awaiting readings');
  const stamp = currentLiveData ? tsMs(currentLiveData) : null;
  document.getElementById('readingAge').textContent = stamp ? (online ? 'Updated ' : 'Last reading ') + new Date(stamp).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Awaiting sensor data';
  document.getElementById('sidebarLastUpdate').textContent = stamp ? 'Last reading ' + new Date(stamp).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Waiting for a reading';
}
function isReadingFresh() { const stamp = currentLiveData ? tsMs(currentLiveData) : null; return Boolean(stamp && Date.now() - stamp < 30000 && stamp - Date.now() < 60000); }
setInterval(() => { if (currentLiveData) setConnection(isReadingFresh()); }, 3000);

/* =========================================================
   HISTORY
========================================================= */

function historyCoverage(samples) {
  if (samples.length < 2) return samples.length ? "1 sample" : "--";

  const times = samples.map(tsMs).filter(Number.isFinite).sort((a,b) => a-b);
  if (times.length < 2) return "--";

  const minutes = Math.max(0, Math.round((times.at(-1) - times[0]) / 60000));

  if (minutes >= 1440) return `${(minutes/1440).toFixed(1)} d`;
  if (minutes >= 60) return `${(minutes/60).toFixed(1)} h`;
  return `${minutes} min`;
}

function filterHistoryByMinutes(minutes) {
  if (!historicalSamples.length) return [];

  const sorted = [...historicalSamples]
    .filter(s => tsMs(s) !== null)
    .sort((a,b) => tsMs(a) - tsMs(b));

  if (!sorted.length) return [];

  const newest = tsMs(sorted.at(-1));
  const cutoff = newest - Number(minutes) * 60000;

  return sorted.filter(s => tsMs(s) >= cutoff);
}

function renderHistory() {
  renderOverviewTrend();
  const countEl = document.getElementById("historyCount");
  const coverageEl = document.getElementById("historyCoverageCard");
  const avgMoistureEl = document.getElementById("historyAvgMoisture");
  const avgPhEl = document.getElementById("historyAvgPh");
  const tbody = document.getElementById("historyTableBody");

  countEl.textContent = historicalSamples.length;
  coverageEl.textContent = historyCoverage(historicalSamples);

  const avgM = average(historicalSamples.map(s => s.moisture));
  const avgP = average(historicalSamples.map(s => s.ph));

  avgMoistureEl.textContent = avgM === null ? "--" : `${avgM.toFixed(1)}%`;
  avgPhEl.textContent = avgP === null ? "--" : avgP.toFixed(2);

  const minutes = Number(document.getElementById("historyChartRange").value);
  const chartRows = filterHistoryByMinutes(minutes);

  historyChart.data.labels = chartRows.map(s =>
    new Date(tsMs(s)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  historyChart.data.datasets[0].data = chartRows.map(s => chartNumber(s.moisture));
  historyChart.data.datasets[1].data = chartRows.map(s => chartNumber(s.temperature));
  historyChart.data.datasets[2].data = chartRows.map(s => chartNumber(s.ph));
  historyChart.update("none");

  const rows = [...historicalSamples]
    .filter(s => tsMs(s) !== null)
    .sort((a,b) => tsMs(b) - tsMs(a))
    .slice(0, 100);

  if (!rows.length) {
    tbody.innerHTML =
      `<tr><td colspan="9" class="empty-row">No Firebase history has been recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => `
    <tr>
      <td>${new Date(tsMs(s)).toLocaleString()}</td>
      <td>${fmt(s.temperature,1)}</td>
      <td>${fmt(s.moisture,1)}</td>
      <td>${fmt(s.ph,2)}</td>
      <td>${fmt(s.ec,0)}</td>
      <td>${fmt(s.nitrogen,0)}</td>
      <td>${fmt(s.phosphorus,0)}</td>
      <td>${fmt(s.potassium,0)}</td>
      <td>${fmt(s.salinity,0)}</td>
    </tr>
  `).join("");
}

document.getElementById("downloadHistoryButton").addEventListener("click", () => {
  if (!historicalSamples.length) {
    showNotice("No measurements to export yet. Your records will appear when the station sends data.");
    return;
  }

  const headers = [
    "timestamp","date_time","temperature_c","moisture_percent","ph","ec",
    "nitrogen","phosphorus","potassium","salinity","voltage_v","current_ma"
  ];

  const lines = [headers.join(",")];

  [...historicalSamples]
    .sort((a,b) => (tsMs(a) || 0) - (tsMs(b) || 0))
    .forEach(s => {
      const t = tsMs(s);
      const row = [
        s.timestamp ?? "",
        t ? `"${new Date(t).toISOString()}"` : "",
        s.temperature ?? "",
        s.moisture ?? "",
        s.ph ?? "",
        s.ec ?? "",
        s.nitrogen ?? "",
        s.phosphorus ?? "",
        s.potassium ?? "",
        s.salinity ?? "",
        s.voltage ?? "",
        s.current ?? ""
      ];
      lines.push(row.join(","));
    });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AgroSentra001-history-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotice(`CSV prepared with ${historicalSamples.length} readings.`);
});



/* =========================================================
   CLEAR HISTORY
========================================================= */

const clearHistoryButton = document.getElementById("clearHistoryButton");
const clearHistoryModal = document.getElementById("clearHistoryModal");
const cancelClearHistoryButton = document.getElementById("cancelClearHistoryButton");
const confirmClearHistoryButton = document.getElementById("confirmClearHistoryButton");
const clearHistoryStatus = document.getElementById("clearHistoryStatus");

function openClearHistoryModal() {
  clearHistoryStatus.textContent = "";
  clearHistoryModal.classList.add("open");
  clearHistoryModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  cancelClearHistoryButton.focus();
}

function closeClearHistoryModal() {
  if (confirmClearHistoryButton.disabled) return;

  clearHistoryModal.classList.remove("open");
  clearHistoryModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  clearHistoryButton.focus();
}

clearHistoryButton.addEventListener("click", openClearHistoryModal);
cancelClearHistoryButton.addEventListener("click", closeClearHistoryModal);

document.querySelectorAll("[data-close-clear-history]").forEach(el => {
  el.addEventListener("click", closeClearHistoryModal);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && clearHistoryModal.classList.contains("open")) {
    closeClearHistoryModal();
  }
});

confirmClearHistoryButton.addEventListener("click", async () => {
  confirmClearHistoryButton.disabled = true;
  cancelClearHistoryButton.disabled = true;
  clearHistoryStatus.className = "confirm-modal-status working";
  clearHistoryStatus.textContent = "Clearing Firebase history...";

  try {
    if (!removeHistory) throw new Error("The data connection is unavailable.");
    await removeHistory();

    historicalSamples = [];
    renderHistory();
    renderAnalytics();

    clearHistoryStatus.className = "confirm-modal-status success";
    clearHistoryStatus.textContent = "History cleared successfully.";

    setTimeout(() => {
      confirmClearHistoryButton.disabled = false;
      cancelClearHistoryButton.disabled = false;
      closeClearHistoryModal();
    }, 850);

  } catch (error) {
    console.error("Clear history failed:", error);

    clearHistoryStatus.className = "confirm-modal-status error";
    clearHistoryStatus.textContent =
      "Could not clear history. Check Firebase write permissions.";

    confirmClearHistoryButton.disabled = false;
    cancelClearHistoryButton.disabled = false;
  }
});


/* =========================================================
   ANALYTICS
========================================================= */

function applyTrendDisplay(valueEl, detailEl, display) {
  clearStateClasses(valueEl);
  valueEl.textContent = display.label;
  detailEl.textContent = display.detail;
  if (display.className) valueEl.classList.add(display.className);
}

function renderAnalytics() {
  if (!currentLiveData) return;

  const minutes = Number(document.getElementById("analyticsWindow").value);
  const result = analyseSoil(currentLiveData, historicalSamples, minutes);

  document.getElementById("analyticsScore").textContent = result.score;
  document.getElementById("analyticsScoreRing").style.background =
    `conic-gradient(var(--green) ${result.score}%, rgba(127,146,158,.13) ${result.score}%)`;

  const status = document.getElementById("analysisStatus");
  clearStateClasses(status);
  status.className = "status-pill";
  status.textContent = result.status;

  if (result.statusClass === "state-good") status.classList.add("good");
  else if (result.statusClass === "state-warning") status.classList.add("warning");
  else if (result.statusClass === "state-danger") status.classList.add("danger");
  else status.classList.add("neutral");

  document.getElementById("analysisStatusSub").textContent = result.statusSub;

  applyTrendDisplay(
    document.getElementById("moistureTrend"),
    document.getElementById("moistureTrendDetail"),
    result.moistureDisplay
  );

  applyTrendDisplay(
    document.getElementById("phTrend"),
    document.getElementById("phTrendDetail"),
    result.phDisplay
  );

  document.getElementById("nutrientBalance").textContent = result.nutrients.label;
  document.getElementById("nutrientBalanceDetail").textContent = result.nutrients.detail;

  document.getElementById("salinityRisk").textContent = result.salinity.label;
  document.getElementById("salinityRiskDetail").textContent = result.salinity.detail;

  const anomalies = Object.entries(result.anomalies)
    .filter(([,v]) => v.anomalous);

  if (result.sampleCount < 5) {
    document.getElementById("anomalyState").textContent = "Learning";
    document.getElementById("anomalyDetail").textContent = "At least 5 history samples recommended";
  } else if (!anomalies.length) {
    document.getElementById("anomalyState").textContent = "Normal";
    document.getElementById("anomalyDetail").textContent = "Latest values follow recent baseline";
  } else {
    document.getElementById("anomalyState").textContent =
      `${anomalies.length} detected`;
    document.getElementById("anomalyDetail").textContent =
      anomalies.map(([field]) => field).join(", ");
  }

  document.getElementById("historySampleCount").textContent = result.sampleCount;
  document.getElementById("historyCoverage").textContent = historyCoverage(result.samples);
  document.getElementById("insightConfidence").textContent =
    `Baseline: ${result.confidence.label}`;

  const relations = contextRelations(currentLiveData, result, environmentalContext);

  document.getElementById("analyticsInsight").textContent =
    result.insight + (relations.sentence ? ` ${relations.sentence}` : "");

  const flags = [...result.flags, ...relations.flags];
  const unique = [];

  flags.forEach(flag => {
    if (!unique.some(x => x.text === flag.text)) unique.push(flag);
  });

  document.getElementById("insightFlags").innerHTML =
    unique.slice(0,8).map(flag =>
      `<span class="insight-chip ${flag.level}">${flag.text}</span>`
    ).join("") || `<span class="insight-chip neutral">Collecting data</span>`;

  renderContextRelations(relations);
}

document.getElementById("analyticsWindow").addEventListener("change", renderAnalytics);

/* =========================================================
   LOCATION + EXTERNAL WEATHER
========================================================= */

function savedLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      validCoordinate(parsed.latitude, "latitude") &&
      validCoordinate(parsed.longitude, "longitude")
    ) return parsed;
  } catch (_) {}

  return null;
}

function firebaseLocation(data) {
  if (
    data &&
    validCoordinate(data.latitude, "latitude") &&
    validCoordinate(data.longitude, "longitude")
  ) {
    return {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      label: (data.location_label || "Probe location").trim(),
      source: "firebase"
    };
  }

  return null;
}

function updateLocationUI() {
  if (!monitoringLocation) return;

  const lat = Number(monitoringLocation.latitude);
  const lon = Number(monitoringLocation.longitude);
  const coordText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  document.getElementById("topbarLocation").textContent = monitoringLocation.label;
  document.getElementById("monitoringLocation").textContent = monitoringLocation.label;
  document.getElementById("contextCoordinates").textContent = coordText;

  document.getElementById("settingsCurrentLocation").textContent = monitoringLocation.label;
  document.getElementById("settingsCurrentCoordinates").textContent =
    `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? "E" : "W"}`;

  document.getElementById("latitudeInput").value = lat;
  document.getElementById("longitudeInput").value = lon;
  document.getElementById("locationNameInput").value = monitoringLocation.label;
}

function setContextBadge(state, text) {
  const badge = document.getElementById("contextSyncBadge");
  badge.className = `context-sync ${state || ""}`;
  badge.innerHTML = `<span></span>${text}`;
}

function renderWeather() {
  if (!environmentalContext) return;

  document.getElementById("rainfall6h").textContent =
    fmt(environmentalContext.rainfall6h, 1);

  const rainfall = Number(environmentalContext.rainfall6h);
  document.getElementById("rainfallInterpretation").textContent =
    !Number.isFinite(rainfall) ? "Recent rainfall unavailable" :
    rainfall < .2 ? "No meaningful recent rainfall" :
    rainfall < 2.5 ? "Light recent rainfall" :
    rainfall < 10 ? "Recent rainfall detected" :
    "Heavy recent rainfall";

  document.getElementById("externalAirTemperature").textContent =
    fmt(environmentalContext.airTemperature, 1);

  document.getElementById("externalHumidity").textContent =
    fmt(environmentalContext.humidity, 0);

  const humidity = Number(environmentalContext.humidity);
  document.getElementById("humidityInterpretation").textContent =
    !Number.isFinite(humidity) ? "Humidity unavailable" :
    humidity >= 85 ? "Very humid atmospheric conditions" :
    humidity >= 65 ? "Humid atmospheric conditions" :
    humidity >= 40 ? "Moderate atmospheric humidity" :
    "Relatively dry atmospheric conditions";

  document.getElementById("modelSoilTemperature").textContent =
    fmt(environmentalContext.modelSoilTemperature, 1);

  document.getElementById("modelSoilMoisture").textContent =
    fmt(environmentalContext.modelSoilMoisturePercent, 1);

  document.getElementById("weatherContextState").textContent =
    environmentalContext.weatherLabel || "Synced";

  document.getElementById("weatherContextDetail").textContent =
    validNumber(environmentalContext.precipitationNow)
      ? `${Number(environmentalContext.precipitationNow).toFixed(1)} mm current precipitation`
      : "Current precipitation unavailable";

  document.getElementById("contextUpdated").textContent =
    `External sync ${new Date(environmentalContext.fetchedAt).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit"
    })}`;
}

function renderContextRelations(relations = null) {
  if (!relations) {
    if (!currentLiveData || !environmentalContext) return;

    const result = analyseSoil(
      currentLiveData,
      historicalSamples,
      Number(document.getElementById("analyticsWindow").value)
    );

    relations = contextRelations(currentLiveData, result, environmentalContext);
  }

  document.getElementById("moistureWeatherRelation").textContent =
    relations.moisture.label;
  document.getElementById("moistureWeatherRelationDetail").textContent =
    relations.moisture.detail;

  document.getElementById("temperatureRelation").textContent =
    relations.temperature.label;
  document.getElementById("temperatureRelationDetail").textContent =
    relations.temperature.detail;

  document.getElementById("environmentConfidence").textContent =
    relations.confidence.label;
  document.getElementById("environmentConfidenceDetail").textContent =
    relations.confidence.detail;
}

async function syncWeather(force = false) {
  if (!monitoringLocation) return;

  const age = environmentalContext
    ? Date.now() - Number(environmentalContext.fetchedAt)
    : Infinity;

  if (!force && age < EXTERNAL_REFRESH_MS) return;

  setContextBadge("", "Syncing");

  try {
    environmentalContext = await fetchEnvironmentalContext(
      monitoringLocation.latitude,
      monitoringLocation.longitude
    );

    setContextBadge("synced", "Context synced");
    renderWeather();
    renderAnalytics();
  } catch (error) {
    console.error("External context error:", error);
    setContextBadge("error", "Context unavailable");
    document.getElementById("contextUpdated").textContent = "External sync failed";
  }
}

function applyLocation(location, save = false) {
  monitoringLocation = location;

  if (save && location.source !== "firebase") {
    storePreference(LOCATION_KEY, JSON.stringify(location));
  }

  updateLocationUI();
  syncWeather(true);

  if (externalRefreshTimer) clearInterval(externalRefreshTimer);

  externalRefreshTimer = setInterval(
    () => syncWeather(true),
    EXTERNAL_REFRESH_MS
  );
}

document.getElementById("saveLocationButton").addEventListener("click", () => {
  const latInput = document.getElementById("latitudeInput").value.trim();
  const lonInput = document.getElementById("longitudeInput").value.trim();
  const lat = latInput === "" ? NaN : Number(latInput);
  const lon = lonInput === "" ? NaN : Number(lonInput);
  const label = document.getElementById("locationNameInput").value.trim() || "Monitoring site";
  const error = document.getElementById("locationError");

  error.textContent = "";

  if (!validCoordinate(lat, "latitude")) {
    error.textContent = "Enter a valid latitude between -90 and 90.";
    return;
  }

  if (!validCoordinate(lon, "longitude")) {
    error.textContent = "Enter a valid longitude between -180 and 180.";
    return;
  }

  applyLocation({ latitude: lat, longitude: lon, label, source: "browser" }, true);
  showNotice("Location saved. Updating your weather context.");
});

document.getElementById("resetLocationButton").addEventListener("click", () => {
  try { localStorage.removeItem(LOCATION_KEY); } catch (_) {}
  applyLocation(DEFAULT_LOCATION, false);
});

document.getElementById("useCurrentLocationButton").addEventListener("click", () => {
  const btn = document.getElementById("useCurrentLocationButton");
  const error = document.getElementById("locationError");
  error.textContent = "";

  if (!navigator.geolocation) {
    error.textContent = "Geolocation is not supported by this browser.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Requesting location...";

  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById("latitudeInput").value =
        pos.coords.latitude.toFixed(6);
      document.getElementById("longitudeInput").value =
        pos.coords.longitude.toFixed(6);

      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="locate-fixed"></i>Use this device location';
      lucide.createIcons();
    },
    err => {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="locate-fixed"></i>Use this device location';
      error.textContent = err.message || "Location permission was not granted.";
      lucide.createIcons();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});

const initialLocation = savedLocation() || DEFAULT_LOCATION;
applyLocation({ ...initialLocation, source: initialLocation.source || "browser" }, false);



/* =========================================================
   DEVICE INFO — INTEGRATED ASSEMBLY ANIMATION
========================================================= */

const integratedDeviceStage = document.getElementById("integratedDeviceStage");
const explodeDeviceButton = document.getElementById("explodeDeviceButton");
const assembleDeviceButton = document.getElementById("assembleDeviceButton");
const deviceAssemblyState = document.getElementById("deviceAssemblyState");
const deviceStageStatusText = document.getElementById("deviceStageStatusText");

let deviceAssemblyMode = "assembled";
let deviceAssemblyTimer = null;

function setDeviceControlState(mode) {
  explodeDeviceButton.classList.toggle("active", mode === "exploded");
  assembleDeviceButton.classList.toggle("active", mode === "assembled");

  deviceAssemblyState.textContent =
    mode === "exploded" ? "EXPLODED" :
    mode === "assembling" ? "ASSEMBLING" :
    mode === "exploding" ? "SEPARATING" :
    "ASSEMBLED";
}

function clearDeviceAssemblyTimer() {
  if (deviceAssemblyTimer) {
    clearTimeout(deviceAssemblyTimer);
    deviceAssemblyTimer = null;
  }
}

function explodeIntegratedDevice() {
  if (!integratedDeviceStage || deviceAssemblyMode === "exploded" || deviceAssemblyMode === "exploding") {
    return;
  }

  clearDeviceAssemblyTimer();

  deviceAssemblyMode = "exploding";
  setDeviceControlState("exploding");
  deviceStageStatusText.textContent = "Opening hardware assembly";

  integratedDeviceStage.classList.remove("assembling", "exploded");
  integratedDeviceStage.classList.add("pre-explode");

  /*
    First: fade the complete black enclosure out.
    Then: reveal and separate the internal components.
  */
  deviceAssemblyTimer = setTimeout(() => {
    integratedDeviceStage.classList.remove("pre-explode");
    integratedDeviceStage.classList.add("exploded");

    deviceAssemblyMode = "exploded";
    setDeviceControlState("exploded");
    deviceStageStatusText.textContent =
      window.matchMedia("(max-width: 820px)").matches
        ? "Vertical exploded assembly"
        : "Horizontal exploded assembly";
  }, 330);
}

function assembleIntegratedDevice() {
  if (!integratedDeviceStage || deviceAssemblyMode === "assembled" || deviceAssemblyMode === "assembling") {
    return;
  }

  clearDeviceAssemblyTimer();

  deviceAssemblyMode = "assembling";
  setDeviceControlState("assembling");
  deviceStageStatusText.textContent = "Returning components to enclosure";

  /*
    Remove exploded: components animate back into the center.
    Keep .assembling active so the complete black device remains hidden
    until all components have collapsed.
  */
  integratedDeviceStage.classList.add("assembling");
  integratedDeviceStage.classList.remove("pre-explode", "exploded");

  deviceAssemblyTimer = setTimeout(() => {
    integratedDeviceStage.classList.remove("assembling");

    deviceAssemblyMode = "assembled";
    setDeviceControlState("assembled");
    deviceStageStatusText.textContent = "Ready to inspect";
  }, 1180);
}

if (explodeDeviceButton && assembleDeviceButton && integratedDeviceStage) {
  explodeDeviceButton.addEventListener("click", explodeIntegratedDevice);
  assembleDeviceButton.addEventListener("click", assembleIntegratedDevice);

  window.addEventListener("resize", () => {
    if (deviceAssemblyMode === "exploded") {
      deviceStageStatusText.textContent =
        window.matchMedia("(max-width: 820px)").matches
          ? "Vertical exploded assembly"
          : "Horizontal exploded assembly";
    }
  });
}


/* =========================================================
   FIREBASE LIVE
========================================================= */

let removeHistory = null;

function applyLiveData(data, source = "realtime") {
  if (!data) return;

  currentLiveData = data;

  const probeLocation = firebaseLocation(data);

  if (probeLocation) {
    const changed =
      monitoringLocation?.source !== "firebase" ||
      Number(monitoringLocation.latitude) !== Number(probeLocation.latitude) ||
      Number(monitoringLocation.longitude) !== Number(probeLocation.longitude);

    if (changed) {
      applyLocation(probeLocation, false);
    }
  }

  updateLiveValues(data);
  updateDashboardCondition(data);
  addLiveChartReading(data);
  lastFirebaseUpdate = Date.now();
  setConnection(isReadingFresh());
  renderAnalytics();

  const refreshText = document.getElementById("liveRefreshText");
  if (refreshText) {
    refreshText.textContent = "Live push · device 10s";
  }
}

async function connectData() {
  try {
    const [{database}, sdk] = await Promise.all([import('./firebase-config.js'), import('https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js')]);
    const { ref, onValue, remove, query, orderByChild, limitToLast } = sdk;
    const liveRef = ref(database, 'devices/agrosentra-001/live');
    const historyRef = ref(database, 'devices/agrosentra-001/history');
    removeHistory = () => remove(historyRef);
    onValue(liveRef, snapshot => {
      if (snapshot.exists()) applyLiveData(snapshot.val());
      else { document.getElementById('firebaseStatus').textContent = 'No readings yet'; setConnection(false); }
    }, () => { document.getElementById('firebaseStatus').textContent = 'Connection unavailable'; setConnection(false); });
    onValue(query(historyRef, orderByChild('timestamp'), limitToLast(1440)), snapshot => {
      const rows = []; snapshot.forEach(child => { const value = child.val(); if(value) rows.push({ id:child.key, ...value }); });
      historicalSamples = rows; renderHistory(); renderAnalytics();
    }, () => {
      document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="9" class="empty-row">History is unavailable. Check your connection and database access.</td></tr>';
      document.getElementById('overviewCoverage').textContent = 'History unavailable';
    });
  } catch (error) {
    console.warn('The data connection is unavailable.', error);
    document.getElementById('firebaseStatus').textContent = 'Connection unavailable';
    document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="9" class="empty-row">Unable to connect. Reload when your connection is restored.</td></tr>';
    setConnection(false);
  }
}
setTimeout(() => { if (!lastFirebaseUpdate) setConnection(false); }, 10000);
connectData();

document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || !clearHistoryModal.classList.contains('open')) return;
  const buttons = [...clearHistoryModal.querySelectorAll('button:not(:disabled)')];
  if (!buttons.length) { event.preventDefault(); return; }
  const first=buttons[0], last=buttons.at(-1);
  if(event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
