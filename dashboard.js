// ============================================================
//  tiny · dashboard
// ============================================================

const DAY = 86400000;
const state = {
  user: null,
  links: {},        // key -> { url, title, createdAt }
  clicks: {},       // key -> [ { id, ts, ... } ]
  refs: {},         // key -> ref con listener activo
  range: 30,        // días (0 = todo)
  linkFilter: new URLSearchParams(location.search).get("link") || "all",
  search: "",
  firstFit: true,
};

// ============================================================
//  AUTENTICACIÓN
// ============================================================
let authMode = "login";

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    authMode = t.dataset.mode;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $("confirm-field").hidden = authMode !== "register";
    $("auth-password").autocomplete = authMode === "register" ? "new-password" : "current-password";
    $("auth-submit").querySelector(".btn-label").textContent = authMode === "register" ? "Crear cuenta" : "Entrar";
    $("forgot-btn").hidden = authMode === "register";
    $("auth-error").textContent = "";
  })
);

const AUTH_ERRORS = {
  "auth/invalid-email": "El email no es válido.",
  "auth/user-not-found": "Email o contraseña incorrectos.",
  "auth/wrong-password": "Email o contraseña incorrectos.",
  "auth/invalid-login-credentials": "Email o contraseña incorrectos.",
  "auth/invalid-credential": "Email o contraseña incorrectos.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese email.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
  "auth/operation-not-allowed": "Activa el inicio de sesión con Email/Contraseña en Firebase Console → Authentication.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
};
const authMsg = (err) =>
  AUTH_ERRORS[err.code] || (/INVALID_LOGIN_CREDENTIALS/.test(err.message) ? AUTH_ERRORS["auth/wrong-password"] : err.message);

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const pass = $("auth-password").value;
  $("auth-error").textContent = "";

  if (authMode === "register" && pass !== $("auth-password2").value) {
    $("auth-error").textContent = "Las contraseñas no coinciden.";
    return;
  }
  const btn = $("auth-submit");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    if (authMode === "register") await auth.createUserWithEmailAndPassword(email, pass);
    else await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    $("auth-error").textContent = authMsg(err);
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
});

$("forgot-btn").addEventListener("click", async () => {
  const email = $("auth-email").value.trim();
  if (!email) {
    $("auth-error").textContent = "Escribe tu email arriba y vuelve a pulsar aquí.";
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    showToast("Te enviamos un email para restablecer la contraseña");
  } catch (err) {
    $("auth-error").textContent = authMsg(err);
  }
});

$("logout-btn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged((user) => {
  $("boot").hidden = true;
  detachAll();
  state.user = user;
  $("auth-view").hidden = !!user;
  $("app-view").hidden = !user;
  if (!user) return;
  $("user-email").textContent = user.email;
  subscribe(user.uid);
  handleIncoming();
});

// ============================================================
//  PWA: link compartido desde otra app (share_target) y atajo "Nuevo link"
// ============================================================
let incomingHandled = false;
function handleIncoming() {
  if (incomingHandled) return;
  incomingHandled = true;
  const url = new URL(location.href);
  const p = url.searchParams;
  const shared = [p.get("share_url"), p.get("share_text"), p.get("share_title")].filter(Boolean).join(" ");
  const found = shared.match(/https?:\/\/[^\s<>"']+/i);
  const isNew = p.get("new") === "1";

  if (found || isNew || shared) {
    $("create-card").hidden = false;
    if (found) {
      $("new-url").value = found[0];
      const title = (p.get("share_title") || "").trim();
      if (title && !/^https?:\/\//i.test(title)) $("new-title").value = title.slice(0, 120);
      showToast("Link recibido: revisa y pulsa Crear");
    } else if (shared) {
      $("create-error").textContent = "No encontré un link en lo que compartiste.";
    }
    setTimeout(() => (found ? $("create-submit") : $("new-url")).focus(), 300);
  }
  ["share_url", "share_text", "share_title", "new", "source"].forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, "", url);
}

// Indicador de conexión en tiempo real (punto verde / gris)
db.ref(".info/connected").on("value", (snap) => {
  const on = snap.val() === true;
  const dot = document.querySelector(".live-dot");
  if (!dot) return;
  dot.classList.toggle("offline", !on);
  dot.title = on ? "Conectado · actualización en tiempo real" : "Sin conexión · reconectando…";
});

// ============================================================
//  UBICACIÓN APROXIMADA POR ZONA HORARIA (respaldo sin red)
//  Para clicks sin ubicación por IP (bloqueadores, límite diario…)
// ============================================================
const TZ_GEO = {
  "America/Mexico_City": ["MX", 19.43, -99.13], "America/Cancun": ["MX", 21.16, -86.85], "America/Monterrey": ["MX", 25.69, -100.32],
  "America/Merida": ["MX", 20.97, -89.62], "America/Chihuahua": ["MX", 28.63, -106.07], "America/Hermosillo": ["MX", 29.07, -110.96],
  "America/Mazatlan": ["MX", 23.25, -106.41], "America/Tijuana": ["MX", 32.51, -117.04], "America/Bogota": ["CO", 4.71, -74.07],
  "America/Caracas": ["VE", 10.48, -66.9], "America/Lima": ["PE", -12.05, -77.04], "America/Guayaquil": ["EC", -2.19, -79.89],
  "America/Santiago": ["CL", -33.45, -70.67], "America/Argentina/Buenos_Aires": ["AR", -34.6, -58.38], "America/Buenos_Aires": ["AR", -34.6, -58.38],
  "America/Argentina/Cordoba": ["AR", -31.42, -64.18], "America/Argentina/Mendoza": ["AR", -32.89, -68.84], "America/Montevideo": ["UY", -34.9, -56.16],
  "America/Asuncion": ["PY", -25.26, -57.58], "America/La_Paz": ["BO", -16.5, -68.15], "America/Sao_Paulo": ["BR", -23.55, -46.63],
  "America/Bahia": ["BR", -12.97, -38.5], "America/Fortaleza": ["BR", -3.73, -38.52], "America/Recife": ["BR", -8.05, -34.88],
  "America/Manaus": ["BR", -3.12, -60.02], "America/Belem": ["BR", -1.46, -48.49], "America/Panama": ["PA", 8.98, -79.52],
  "America/Costa_Rica": ["CR", 9.93, -84.08], "America/Guatemala": ["GT", 14.63, -90.51], "America/El_Salvador": ["SV", 13.69, -89.22],
  "America/Tegucigalpa": ["HN", 14.07, -87.19], "America/Managua": ["NI", 12.11, -86.24], "America/Havana": ["CU", 23.11, -82.37],
  "America/Santo_Domingo": ["DO", 18.49, -69.93], "America/Puerto_Rico": ["PR", 18.47, -66.11], "America/New_York": ["US", 40.71, -74.01],
  "America/Detroit": ["US", 42.33, -83.05], "America/Indiana/Indianapolis": ["US", 39.77, -86.16], "America/Kentucky/Louisville": ["US", 38.25, -85.76],
  "America/Chicago": ["US", 41.88, -87.63], "America/Denver": ["US", 39.74, -104.99], "America/Phoenix": ["US", 33.45, -112.07],
  "America/Los_Angeles": ["US", 34.05, -118.24], "America/Anchorage": ["US", 61.22, -149.9], "Pacific/Honolulu": ["US", 21.31, -157.86],
  "America/Toronto": ["CA", 43.65, -79.38], "America/Vancouver": ["CA", 49.28, -123.12], "America/Edmonton": ["CA", 53.55, -113.49],
  "America/Winnipeg": ["CA", 49.9, -97.14], "America/Halifax": ["CA", 44.65, -63.57], "Europe/Madrid": ["ES", 40.42, -3.7],
  "Atlantic/Canary": ["ES", 28.12, -15.43], "Europe/Lisbon": ["PT", 38.72, -9.14], "Europe/London": ["GB", 51.51, -0.13],
  "Europe/Dublin": ["IE", 53.35, -6.26], "Europe/Paris": ["FR", 48.86, 2.35], "Europe/Berlin": ["DE", 52.52, 13.4],
  "Europe/Rome": ["IT", 41.9, 12.5], "Europe/Amsterdam": ["NL", 52.37, 4.9], "Europe/Brussels": ["BE", 50.85, 4.35],
  "Europe/Zurich": ["CH", 47.38, 8.54], "Europe/Vienna": ["AT", 48.21, 16.37], "Europe/Stockholm": ["SE", 59.33, 18.07],
  "Europe/Oslo": ["NO", 59.91, 10.75], "Europe/Copenhagen": ["DK", 55.68, 12.57], "Europe/Warsaw": ["PL", 52.23, 21.01],
  "Europe/Prague": ["CZ", 50.08, 14.44], "Europe/Athens": ["GR", 37.98, 23.73], "Europe/Istanbul": ["TR", 41.01, 28.98],
  "Europe/Moscow": ["RU", 55.76, 37.62], "Europe/Kiev": ["UA", 50.45, 30.52], "Europe/Kyiv": ["UA", 50.45, 30.52],
  "Europe/Bucharest": ["RO", 44.43, 26.1], "Europe/Helsinki": ["FI", 60.17, 24.94], "Asia/Tokyo": ["JP", 35.68, 139.69],
  "Asia/Shanghai": ["CN", 31.23, 121.47], "Asia/Hong_Kong": ["HK", 22.32, 114.17], "Asia/Singapore": ["SG", 1.35, 103.82],
  "Asia/Kolkata": ["IN", 22.57, 88.36], "Asia/Calcutta": ["IN", 22.57, 88.36], "Asia/Dubai": ["AE", 25.2, 55.27],
  "Asia/Seoul": ["KR", 37.57, 126.98], "Asia/Manila": ["PH", 14.6, 120.98], "Asia/Jakarta": ["ID", -6.21, 106.85],
  "Asia/Bangkok": ["TH", 13.76, 100.5], "Australia/Sydney": ["AU", -33.87, 151.21], "Australia/Melbourne": ["AU", -37.81, 144.96],
  "Pacific/Auckland": ["NZ", -36.85, 174.76], "Africa/Johannesburg": ["ZA", -26.2, 28.05], "Africa/Cairo": ["EG", 30.04, 31.24],
  "Africa/Lagos": ["NG", 6.52, 3.38], "Africa/Casablanca": ["MA", 33.57, -7.59],
};

let regionNames;
try { regionNames = new Intl.DisplayNames(["es"], { type: "region" }); } catch {}
const countryName = (cc, fallback) => {
  try { return (cc && regionNames && regionNames.of(cc.toUpperCase())) || fallback; } catch { return fallback; }
};

function enrichClick(c) {
  const hasGeo = typeof c.lat === "number" && typeof c.lon === "number" && !(c.lat === 0 && c.lon === 0);
  if (!hasGeo && c.tz && TZ_GEO[c.tz]) {
    const [cc, lat, lon] = TZ_GEO[c.tz];
    c.cc = c.cc || cc;
    c.lat = lat;
    c.lon = lon;
    c.city = c.city || c.tz.split("/").pop().replace(/_/g, " ");
    c.approx = true;
  }
  if (c.cc) c.country = countryName(c.cc, c.country);
  return c;
}

// ============================================================
//  DATOS EN TIEMPO REAL
// ============================================================
let linksRef = null;

function subscribe(uid) {
  linksRef = db.ref(`users/${uid}/links`);
  linksRef.on(
    "value",
    (snap) => {
      state.links = snap.val() || {};
      const keys = Object.keys(state.links);

      // Nuevos listeners de clicks
      keys.forEach((key) => {
        if (state.refs[key]) return;
        const ref = db.ref("clicks/" + key);
        state.refs[key] = ref;
        ref.on(
          "value",
          (s) => {
            const val = s.val() || {};
            state.clicks[key] = Object.entries(val).map(([id, c]) => enrichClick({ id, key, ...c }));
            scheduleRender();
          },
          (err) => console.warn(`Sin acceso a clicks/${key}:`, err.message)
        );
      });
      // Links eliminados
      Object.keys(state.refs).forEach((key) => {
        if (!state.links[key]) {
          state.refs[key].off();
          delete state.refs[key];
          delete state.clicks[key];
        }
      });
      if (state.linkFilter !== "all" && !state.links[state.linkFilter]) state.linkFilter = "all";
      scheduleRender();
    },
    (err) => {
      console.error(err);
      showToast("Error leyendo tus links: " + err.message);
    }
  );
}

function detachAll() {
  if (linksRef) linksRef.off();
  Object.values(state.refs).forEach((r) => r.off());
  state.refs = {};
  state.links = {};
  state.clicks = {};
}

let renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 80);
}

// ============================================================
//  FILTROS
// ============================================================
$("range-filter").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.range = Number(b.dataset.range);
  document.querySelectorAll("#range-filter button").forEach((x) => x.classList.toggle("active", x === b));
  state.firstFit = true;
  render();
});

$("link-filter").addEventListener("change", (e) => setLinkFilter(e.target.value));

function setLinkFilter(key) {
  state.linkFilter = key;
  state.firstFit = true;
  const url = new URL(location.href);
  if (key === "all") url.searchParams.delete("link");
  else url.searchParams.set("link", key);
  history.replaceState(null, "", url);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("link-search").addEventListener("input", (e) => {
  state.search = e.target.value.toLowerCase();
  renderLinksTable(currentAllClicks(), rangeStart());
});

const rangeStart = () => (state.range ? Date.now() - state.range * DAY : 0);

function currentAllClicks() {
  const keys = state.linkFilter === "all" ? Object.keys(state.links) : [state.linkFilter];
  return keys.flatMap((k) => state.clicks[k] || []).filter((c) => typeof c.ts === "number");
}

// ============================================================
//  RENDER
// ============================================================
const nf = new Intl.NumberFormat("es");
const fmtNum = (n) => nf.format(n);
const fmtDate = (ts) => new Date(ts).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (ts) => new Date(ts).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function fmtAgo(ts) {
  const s = (ts - Date.now()) / 1000;
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, sec] of units) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
  return "justo ahora";
}
const linkName = (key) => (state.links[key] && state.links[key].title) || key;

function render() {
  if (!state.user) return;
  renderLinkSelect();

  const all = currentAllClicks();
  const start = rangeStart();
  const clicks = all.filter((c) => c.ts >= start);

  $("scope-label").textContent =
    state.linkFilter === "all"
      ? "Todos tus links"
      : `${linkName(state.linkFilter)} · ${shortUrlFor(state.linkFilter).replace(/^https?:\/\//, "")}`;

  renderKpis(all, clicks, start);
  renderTimeline(clicks, all);
  renderMap(clicks);
  renderBreakdowns(clicks);
  renderTimeCharts(clicks);
  renderLinksTable(all, start);
  renderRecent(clicks);
}

function renderLinkSelect() {
  const sel = $("link-filter");
  const keys = Object.keys(state.links).sort((a, b) => (state.links[b].createdAt || 0) - (state.links[a].createdAt || 0));
  sel.innerHTML =
    `<option value="all">Todos los links (${keys.length})</option>` +
    keys.map((k) => `<option value="${esc(k)}">${esc(linkName(k))}${state.links[k].title ? " · " + esc(k) : ""}</option>`).join("");
  sel.value = state.linkFilter;
}

// ---------- KPIs ----------
function delta(cur, prev) {
  if (!state.range) return "";
  if (!prev) return cur ? `<span class="up">nuevo</span> vs período anterior` : "sin datos previos";
  const pct = Math.round(((cur - prev) / prev) * 100);
  const cls = pct > 0 ? "up" : pct < 0 ? "down" : "";
  return `<span class="${cls}">${pct > 0 ? "▲" : pct < 0 ? "▼" : "="} ${Math.abs(pct)}%</span> vs período anterior`;
}

function renderKpis(all, clicks, start) {
  const prev = state.range ? all.filter((c) => c.ts >= start - state.range * DAY && c.ts < start) : [];
  const uniq = (arr) => new Set(arr.map((c) => c.vid || c.id)).size;

  $("kpi-clicks").textContent = fmtNum(clicks.length);
  $("kpi-clicks-sub").innerHTML = state.range ? delta(clicks.length, prev.length) : "desde el inicio";

  $("kpi-unique").textContent = fmtNum(uniq(clicks));
  $("kpi-unique-sub").innerHTML = state.range ? delta(uniq(clicks), uniq(prev)) : "navegadores distintos";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const nToday = all.filter((c) => c.ts >= t0).length;
  const nYesterday = all.filter((c) => c.ts >= t0 - DAY && c.ts < t0).length;
  $("kpi-today").textContent = fmtNum(nToday);
  $("kpi-today-sub").textContent = `ayer: ${fmtNum(nYesterday)}`;

  const keys = state.linkFilter === "all" ? Object.keys(state.links) : [state.linkFilter];
  const withClicks = keys.filter((k) => (state.clicks[k] || []).some((c) => c.ts >= start)).length;
  $("kpi-links").textContent = fmtNum(Object.keys(state.links).length);
  $("kpi-links-sub").textContent = `${withClicks} con clicks en el período`;

  const top = countBy(clicks, (c) => c.country)[0];
  if (top) {
    const cc = clicks.find((c) => c.country === top[0]);
    $("kpi-country").textContent = `${flag(cc && cc.cc)} ${top[0]}`;
    $("kpi-country-sub").textContent = `${Math.round((top[1] / clicks.length) * 100)}% de los clicks`;
  } else {
    $("kpi-country").textContent = "—";
    $("kpi-country-sub").textContent = "sin datos";
  }
}

// ---------- utilidades de conteo ----------
function countBy(arr, fn) {
  const m = new Map();
  arr.forEach((x) => {
    const k = fn(x);
    if (k == null || k === "") return;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------- Colores desde CSS ----------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------- Línea de tiempo ----------
let timelineChart, hourChart, weekdayChart;

function buildBuckets(clicks, all) {
  const hourly = state.range === 1;
  const step = hourly ? 3600000 : DAY;
  let startTs;
  const now = new Date();
  if (hourly) {
    const h = new Date(now);
    h.setMinutes(0, 0, 0);
    startTs = h.getTime() - 23 * step;
  } else {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    if (state.range) startTs = d.getTime() - (state.range - 1) * DAY;
    else {
      const keys = state.linkFilter === "all" ? Object.keys(state.links) : [state.linkFilter];
      const created = keys.map((k) => state.links[k] && state.links[k].createdAt).filter(Boolean);
      const first = Math.min(...all.map((c) => c.ts), ...created, d.getTime());
      const f = new Date(first);
      f.setHours(0, 0, 0, 0);
      startTs = Math.min(f.getTime(), d.getTime() - 6 * DAY);
    }
  }
  const buckets = [];
  for (let t = startTs; t <= now.getTime(); ) {
    buckets.push({ t, n: 0 });
    if (hourly) t += step;
    else {
      const x = new Date(t);
      x.setDate(x.getDate() + 1);
      t = x.getTime();
    }
  }
  clicks.forEach((c) => {
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (c.ts >= buckets[i].t) {
        buckets[i].n++;
        break;
      }
    }
  });
  return { buckets, hourly };
}

function chartBase() {
  const grid = cssVar("--grid");
  const muted = cssVar("--muted");
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: cssVar("--tooltip-bg"),
        titleColor: cssVar("--text"),
        bodyColor: cssVar("--text"),
        borderColor: cssVar("--border-strong"),
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        cornerRadius: 8,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: grid }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 16, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: muted, precision: 0, font: { size: 11 } } },
    },
  };
}

function renderTimeline(clicks, all) {
  const { buckets, hourly } = buildBuckets(clicks, all);
  const labels = buckets.map((b) =>
    hourly
      ? new Date(b.t).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
      : new Date(b.t).toLocaleDateString("es", { day: "numeric", month: "short" })
  );
  const data = buckets.map((b) => b.n);
  const accent = cssVar("--series");
  const peak = Math.max(0, ...data);
  $("timeline-note").textContent = peak ? `pico: ${fmtNum(peak)} ${hourly ? "en una hora" : "en un día"}` : "";

  const ctx = $("timeline-chart").getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, accent + "55");
  grad.addColorStop(1, accent + "00");

  const opts = chartBase();
  opts.plugins.tooltip.callbacks = { label: (i) => `${fmtNum(i.parsed.y)} clicks` };

  if (!timelineChart) {
    timelineChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data, borderColor: accent, backgroundColor: grad, fill: true, borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: accent, pointHoverBorderColor: cssVar("--surface"), pointHoverBorderWidth: 2 }] },
      options: opts,
    });
  } else {
    timelineChart.data.labels = labels;
    Object.assign(timelineChart.data.datasets[0], { data, borderColor: accent, backgroundColor: grad });
    timelineChart.options = opts;
    timelineChart.update();
  }
}

function barChart(existing, canvas, labels, data, tooltipTitle) {
  const accent = cssVar("--series");
  const opts = chartBase();
  opts.plugins.tooltip.callbacks = { title: tooltipTitle, label: (i) => `${fmtNum(i.parsed.y)} clicks` };
  if (!existing) {
    return new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: accent, hoverBackgroundColor: cssVar("--series-hover"), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 28, categoryPercentage: 0.8, barPercentage: 0.9 }] },
      options: opts,
    });
  }
  existing.data.labels = labels;
  Object.assign(existing.data.datasets[0], { data, backgroundColor: accent, hoverBackgroundColor: cssVar("--series-hover") });
  existing.options = opts;
  existing.update();
  return existing;
}

function renderTimeCharts(clicks) {
  const hours = Array(24).fill(0);
  const days = Array(7).fill(0);
  clicks.forEach((c) => {
    const d = new Date(c.ts);
    hours[d.getHours()]++;
    days[(d.getDay() + 6) % 7]++;
  });
  hourChart = barChart(hourChart, $("hour-chart"), hours.map((_, i) => String(i).padStart(2, "0")), hours, (i) => `${i[0].label}:00 – ${i[0].label}:59`);
  const names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const full = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  weekdayChart = barChart(weekdayChart, $("weekday-chart"), names, days, (i) => full[i[0].dataIndex]);
}

// ---------- Listas con barras ----------
function barList(el, rows, total, { labelFn = (k) => esc(k), max = 8 } = {}) {
  if (!rows.length) {
    el.innerHTML = `<p class="muted-empty">Sin datos</p>`;
    return;
  }
  let shown = rows.slice(0, max);
  if (rows.length > max) {
    const rest = rows.slice(max).reduce((s, r) => s + r[1], 0);
    shown = [...shown, ["__other", rest]];
  }
  const top = Math.max(...shown.map((r) => r[1]));
  el.innerHTML = shown
    .map(([k, n]) => {
      const pct = total ? Math.round((n / total) * 100) : 0;
      const label = k === "__other" ? `Otros (${rows.length - max})` : labelFn(k);
      return `<div class="bl-row" title="${esc(k === "__other" ? "Otros" : k)}: ${fmtNum(n)} clicks (${pct}%)">
        <div class="bl-bar" style="width:${Math.max(2, (n / top) * 100)}%"></div>
        <span class="bl-label">${label}</span>
        <span class="bl-val">${fmtNum(n)}<span class="bl-pct">${pct}%</span></span>
      </div>`;
    })
    .join("");
}

const DEVICE_ICON = { "Móvil": "📱", Tablet: "📲", Escritorio: "💻", Bot: "🤖" };

function renderBreakdowns(clicks) {
  const total = clicks.length;
  const ccOf = {};
  clicks.forEach((c) => c.country && c.cc && (ccOf[c.country] = c.cc));

  barList($("bl-country"), countBy(clicks, (c) => c.country || "Desconocido"), total, {
    labelFn: (k) => `${flag(ccOf[k])} ${esc(k)}`,
    max: 12,
  });
  barList($("bl-device"), countBy(clicks, (c) => c.device || "Desconocido"), total, {
    labelFn: (k) => `${DEVICE_ICON[k] || "❔"} ${esc(k)}`,
  });
  barList($("bl-browser"), countBy(clicks, (c) => c.browser || "Desconocido"), total);
  barList($("bl-os"), countBy(clicks, (c) => c.os || "Desconocido"), total);
  barList(
    $("bl-city"),
    countBy(clicks, (c) => (c.city ? `${c.city}|${c.cc || ""}` : null)),
    total,
    { labelFn: (k) => { const [city, cc] = k.split("|"); return `${flag(cc)} ${esc(city)}`; } }
  );
  barList($("bl-ref"), countBy(clicks, (c) => c.ref || "Directo"), total);
  barList($("bl-lang"), countBy(clicks, (c) => (c.lang || "").split("-")[0].toLowerCase() || null), total, {
    labelFn: (k) => {
      try {
        const n = new Intl.DisplayNames(["es"], { type: "language" }).of(k);
        return `${esc(n.charAt(0).toUpperCase() + n.slice(1))} <span class="dim">${esc(k)}</span>`;
      } catch {
        return esc(k);
      }
    },
  });
}

// ---------- Mapa ----------
let map, mapLayer, tileLayer, tileDark;

function isDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function ensureMap() {
  if (map) return;
  map = L.map("map", { worldCopyJump: true, zoomControl: true, attributionControl: true, minZoom: 1 }).setView([20, 0], 2);
  setTiles();
  mapLayer = L.layerGroup().addTo(map);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    setTiles();
    render();
  });
}

function setTiles() {
  const dark = isDark();
  $("map").classList.toggle("map-dark", dark);
  if (tileLayer) return;
  tileDark = dark;
  // OpenStreetMap: gratis y sin API key (requiere mostrar la atribución)
  tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
}

function renderMap(clicks) {
  ensureMap();
  mapLayer.clearLayers();

  const groups = new Map();
  clicks.forEach((c) => {
    if (typeof c.lat !== "number" || typeof c.lon !== "number" || (c.lat === 0 && c.lon === 0)) return;
    const k = `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
    if (!groups.has(k)) groups.set(k, { lat: c.lat, lon: c.lon, city: c.city, region: c.region, country: c.country, cc: c.cc, n: 0, devices: {}, approx: !!c.approx });
    const g = groups.get(k);
    g.n++;
    g.devices[c.device || "?"] = (g.devices[c.device || "?"] || 0) + 1;
  });

  const pts = [...groups.values()];
  const max = Math.max(1, ...pts.map((p) => p.n));
  const color = cssVar("--series");
  const ring = cssVar("--surface");

  pts.sort((a, b) => b.n - a.n).reverse().forEach((p) => {
    const radius = 6 + 16 * Math.sqrt(p.n / max);
    const devs = Object.entries(p.devices).map(([d, n]) => `${DEVICE_ICON[d] || "❔"} ${n}`).join(" · ");
    L.circleMarker([p.lat, p.lon], { radius, color: ring, weight: 2, fillColor: color, fillOpacity: 0.75 })
      .bindPopup(
        `<div class="map-pop"><b>${flag(p.cc)} ${esc(p.city || "—")}</b><br>${esc([p.region, p.country].filter(Boolean).join(", "))}` +
          `<div class="map-pop-n">${fmtNum(p.n)} click${p.n === 1 ? "" : "s"}</div><div class="map-pop-d">${devs}</div>` +
          (p.approx ? `<div class="map-pop-c">≈ aproximada por zona horaria</div>` : `<div class="map-pop-c">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</div>`) + `</div>`
      )
      .bindTooltip(`${esc(p.city || p.country || "")}: ${fmtNum(p.n)}`, { direction: "top", offset: [0, -radius] })
      .addTo(mapLayer);
  });

  const located = pts.reduce((s, p) => s + p.n, 0);
  const approxN = clicks.filter((c) => c.approx).length;
  $("map-note").textContent = clicks.length
    ? `${fmtNum(pts.length)} ubicaciones · ${fmtNum(located)} de ${fmtNum(clicks.length)} clicks con ubicación` + (approxN ? ` (${fmtNum(approxN)} aprox.)` : "")
    : "";

  map.invalidateSize();
  if (state.firstFit) {
    state.firstFit = false;
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], 6);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lon])).pad(0.25), { maxZoom: 8 });
    else map.setView([20, 0], 2);
  }
}

// ---------- Tabla de links ----------
function renderLinksTable(all, start) {
  const keys = Object.keys(state.links)
    .filter((k) => {
      if (!state.search) return true;
      const l = state.links[k];
      return [k, l.url, l.title].some((v) => (v || "").toLowerCase().includes(state.search));
    })
    .sort((a, b) => (state.links[b].createdAt || 0) - (state.links[a].createdAt || 0));

  $("links-empty").hidden = Object.keys(state.links).length > 0;
  $("links-table").hidden = !Object.keys(state.links).length;

  $("links-table").querySelector("tbody").innerHTML = keys
    .map((k) => {
      const l = state.links[k];
      const cs = state.clicks[k] || [];
      const inRange = cs.filter((c) => c.ts >= start);
      const uniq = new Set(inRange.map((c) => c.vid || c.id)).size;
      const last = cs.reduce((m, c) => Math.max(m, c.ts || 0), 0);
      const short = shortUrlFor(k);
      let host = "";
      try { host = new URL(l.url).hostname.replace(/^www\./, ""); } catch {}
      const active = state.linkFilter === k ? " selected" : "";
      return `<tr class="${active}">
        <td class="link-cell">
          <img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div>
            <div class="link-title">${esc(l.title || host || k)}</div>
            <a class="link-dest" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.url)}">${esc(l.url)}</a>
          </div>
        </td>
        <td><a class="short" href="${esc(short)}" target="_blank" rel="noopener">/${esc(k)}</a></td>
        <td class="num strong">${fmtNum(inRange.length)}</td>
        <td class="num">${fmtNum(uniq)}</td>
        <td>${last ? `<span title="${esc(fmtDateTime(last))}">${esc(fmtAgo(last))}</span>` : '<span class="dim">nunca</span>'}</td>
        <td>${l.createdAt ? esc(fmtDate(l.createdAt)) : "—"}</td>
        <td class="actions">
          <button class="icon-btn" title="Ver estadísticas" data-act="stats" data-key="${esc(k)}">📊</button>
          <button class="icon-btn" title="Copiar link" data-act="copy" data-key="${esc(k)}">📋</button>
          <button class="icon-btn" title="Código QR" data-act="qr" data-key="${esc(k)}">▦</button>
          <button class="icon-btn" title="Editar" data-act="edit" data-key="${esc(k)}">✏️</button>
          <button class="icon-btn del" title="Eliminar" data-act="delete" data-key="${esc(k)}">🗑</button>
        </td>
      </tr>`;
    })
    .join("");
}

$("links-table").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const key = b.dataset.key;
  switch (b.dataset.act) {
    case "stats":
      $("link-filter").value = key;
      setLinkFilter(key);
      break;
    case "copy":
      await copyText(shortUrlFor(key));
      showToast("Link copiado");
      break;
    case "qr":
      openQr(key);
      break;
    case "edit":
      openEdit(key);
      break;
    case "delete":
      openDelete(key);
      break;
  }
});

// ---------- Clicks recientes ----------
function renderRecent(clicks) {
  const rows = [...clicks].sort((a, b) => b.ts - a.ts).slice(0, 50);
  $("recent-empty").hidden = rows.length > 0;
  $("recent-table").hidden = !rows.length;
  $("recent-note").textContent = clicks.length > 50 ? `últimos 50 de ${fmtNum(clicks.length)}` : "";
  $("recent-table").querySelector("tbody").innerHTML = rows
    .map(
      (c) => `<tr>
      <td title="${esc(new Date(c.ts).toLocaleString("es"))}">${esc(fmtDateTime(c.ts))}</td>
      <td><a href="#" class="short" data-filter="${esc(c.key)}">/${esc(c.key)}</a></td>
      <td>${c.country ? `${flag(c.cc)} ${esc([c.city, c.country].filter(Boolean).join(", "))}${c.approx ? ' <span class="dim" title="Aproximada por zona horaria">≈</span>' : ""}` : '<span class="dim">—</span>'}</td>
      <td>${DEVICE_ICON[c.device] || ""} ${esc(c.device || "—")} <span class="dim">${esc(c.screen || "")}</span></td>
      <td>${esc(c.browser || "—")}</td>
      <td>${esc(c.os || "—")}</td>
      <td>${esc(c.ref || "Directo")}</td>
      <td class="dim">${esc(c.isp || "—")}</td>
    </tr>`
    )
    .join("");
}

$("recent-table").addEventListener("click", (e) => {
  const a = e.target.closest("[data-filter]");
  if (!a) return;
  e.preventDefault();
  setLinkFilter(a.dataset.filter);
});

// ---------- Exportar CSV ----------
$("export-btn").addEventListener("click", () => {
  const clicks = currentAllClicks().filter((c) => c.ts >= rangeStart()).sort((a, b) => b.ts - a.ts);
  if (!clicks.length) return showToast("No hay clicks para exportar");
  const cols = ["fecha", "link", "destino", "pais", "codigo_pais", "region", "ciudad", "lat", "lon", "dispositivo", "navegador", "sistema", "pantalla", "idioma", "zona_horaria", "referencia", "proveedor", "visitante"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = clicks.map((c) =>
    [new Date(c.ts).toISOString(), c.key, state.links[c.key] && state.links[c.key].url, c.country, c.cc, c.region, c.city, c.lat, c.lon, c.device, c.browser, c.os, c.screen, c.lang, c.tz, c.ref, c.isp, c.vid].map(q).join(",")
  );
  const blob = new Blob(["﻿" + cols.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `clicks-${state.linkFilter === "all" ? "todos" : state.linkFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ============================================================
//  CREAR / EDITAR / ELIMINAR
// ============================================================
$("new-link-btn").addEventListener("click", () => {
  const c = $("create-card");
  c.hidden = !c.hidden;
  if (!c.hidden) $("new-url").focus();
});

$("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("create-submit");
  $("create-error").textContent = "";
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const { shortUrl } = await createLink({ url: $("new-url").value, alias: $("new-alias").value, title: $("new-title").value });
    await copyText(shortUrl);
    showToast("Link creado y copiado: " + shortUrl.replace(/^https?:\/\//, ""));
    $("create-form").reset();
    $("create-card").hidden = true;
  } catch (err) {
    $("create-error").textContent = err.message;
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
});

// ---------- Modales ----------
function openModal(id) {
  $(id).hidden = false;
}
function closeModals() {
  document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
}
document.querySelectorAll(".modal").forEach((m) =>
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest("[data-close]")) closeModals();
  })
);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeModals());

// QR
let qrKey = null;
function openQr(key) {
  qrKey = key;
  const url = shortUrlFor(key);
  $("qr-url").textContent = url.replace(/^https?:\/\//, "");
  $("qr-box").innerHTML = "";
  new QRCode($("qr-box"), { text: url, width: 220, height: 220, colorDark: "#111111", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
  openModal("qr-modal");
}
$("qr-download").addEventListener("click", () => {
  const canvas = $("qr-box").querySelector("canvas");
  const img = $("qr-box").querySelector("img");
  const a = document.createElement("a");
  a.href = canvas ? canvas.toDataURL("image/png") : img.src;
  a.download = `qr-${qrKey}.png`;
  a.click();
});

// Editar
let editKey = null;
function openEdit(key) {
  editKey = key;
  const l = state.links[key];
  $("edit-key").textContent = shortUrlFor(key).replace(/^https?:\/\//, "");
  $("edit-title").value = l.title || "";
  $("edit-url").value = l.url || "";
  $("edit-error").textContent = "";
  openModal("edit-modal");
  $("edit-title").focus();
}
$("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = normalizeUrl($("edit-url").value);
  if (!url) {
    $("edit-error").textContent = "Ingresa una URL válida.";
    return;
  }
  const uid = state.user.uid;
  try {
    await db.ref().update({
      ["links/" + editKey]: url,
      [`users/${uid}/links/${editKey}/url`]: url,
      [`users/${uid}/links/${editKey}/title`]: $("edit-title").value.trim().slice(0, 120),
    });
    closeModals();
    showToast("Link actualizado");
  } catch (err) {
    $("edit-error").textContent = err.message;
  }
});

// Eliminar
let deleteKey = null;
function openDelete(key) {
  deleteKey = key;
  $("delete-key").textContent = "/" + key;
  openModal("delete-modal");
}
$("delete-confirm").addEventListener("click", async () => {
  const uid = state.user.uid;
  try {
    await db.ref().update({
      ["links/" + deleteKey]: null,
      ["owners/" + deleteKey]: null,
      ["clicks/" + deleteKey]: null,
      [`users/${uid}/links/${deleteKey}`]: null,
    });
    closeModals();
    showToast("Link eliminado");
  } catch (err) {
    showToast("No se pudo eliminar: " + err.message);
  }
});

// Refrescar tiempos relativos cada minuto
setInterval(() => state.user && scheduleRender(), 60000);
