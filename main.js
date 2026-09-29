// ============================================================
//  tiny · página pública: acortar links y redirigir
// ============================================================

const params = new URLSearchParams(location.search || location.hash.slice(1));
const searchKey = params.get("search");

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// ---------- Ubicación aproximada por IP ----------
// Se prueban varios servicios gratuitos sin API key. Si uno está bloqueado
// (bloqueadores de anuncios, Brave, límite diario…) se usa el siguiente.
function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .finally(() => clearTimeout(timer));
}

const GEO_PROVIDERS = [
  {
    name: "geojs",
    url: "https://get.geojs.io/v1/ip/geo.json",
    map: (g) => ({ country: g.country, cc: g.country_code, region: g.region, city: g.city, lat: g.latitude, lon: g.longitude, isp: g.organization_name }),
  },
  {
    name: "ipwho.is",
    url: "https://ipwho.is/?fields=success,country,country_code,region,city,latitude,longitude,connection",
    map: (g) => (g.success === false ? null : { country: g.country, cc: g.country_code, region: g.region, city: g.city, lat: g.latitude, lon: g.longitude, isp: g.connection && g.connection.isp }),
  },
  {
    name: "ipapi.co",
    url: "https://ipapi.co/json/",
    map: (g) => (g.error ? null : { country: g.country_name, cc: g.country_code, region: g.region, city: g.city, lat: g.latitude, lon: g.longitude, isp: g.org }),
  },
];

async function tryProvider(p, ms) {
  const raw = await fetchJson(p.url, ms);
  const g = p.map(raw);
  const lat = Number(g && g.lat);
  const lon = Number(g && g.lon);
  if (!g || !isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) throw new Error(p.name + ": sin datos");
  return { ...g, lat, lon, source: p.name };
}

async function getGeo() {
  // Los dos primeros en paralelo; el tercero solo si ambos fallan.
  try {
    return await Promise.any(GEO_PROVIDERS.slice(0, 2).map((p) => tryProvider(p, 2500)));
  } catch (err) {
    console.warn("Geolocalización: primeros servicios fallaron", err.errors || err);
  }
  try {
    return await tryProvider(GEO_PROVIDERS[2], 2000);
  } catch (err) {
    console.warn("Geolocalización no disponible:", err.message);
    return null;
  }
}

// ID anónimo por navegador para contar visitantes únicos
function visitorId() {
  try {
    let id = localStorage.getItem("tiny_vid");
    if (!id) {
      id = randomKey(16);
      localStorage.setItem("tiny_vid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function referrerLabel() {
  const src = params.get("src") || params.get("utm_source");
  if (src) return src.slice(0, 100);
  if (!document.referrer) return "Directo";
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host === location.hostname ? "Directo" : host.slice(0, 100);
  } catch {
    return "Directo";
  }
}

function cut(v, n) {
  return v == null ? null : String(v).slice(0, n);
}

async function handleRedirect(key) {
  const geoPromise = getGeo();
  let target;

  try {
    const snap = await db.ref("links/" + key).once("value");
    target = snap.val();
  } catch (err) {
    console.error("Error al acceder a Firebase:", err);
  }

  if (typeof target !== "string") {
    console.warn(`No se encontró la clave "${key}".`);
    $("redirect-loading").hidden = true;
    $("redirect-error").hidden = false;
    return;
  }

  $("redirect-link").href = target;

  // Datos del click
  const ua = parseUA();
  const geo = await withTimeout(geoPromise, 4000);
  const click = {
    ts: TIMESTAMP,
    device: ua.device,
    os: ua.os,
    browser: ua.browser,
    lang: cut(navigator.language || "", 20),
    tz: cut(Intl.DateTimeFormat().resolvedOptions().timeZone || "", 50),
    screen: `${screen.width}x${screen.height}`,
    ref: referrerLabel(),
    vid: visitorId(),
  };
  if (geo) {
    Object.assign(click, {
      country: cut(geo.country, 60),
      cc: cut(geo.cc, 3),
      region: cut(geo.region, 80),
      city: cut(geo.city, 80),
      lat: Math.round(geo.lat * 10000) / 10000,
      lon: Math.round(geo.lon * 10000) / 10000,
      isp: cut(geo.isp, 120),
    });
  }
  Object.keys(click).forEach((k) => (click[k] === null || click[k] === "") && delete click[k]);

  try {
    await withTimeout(db.ref("clicks/" + key).push(click), 1500);
  } catch (err) {
    console.warn("No se pudo registrar el click:", err);
  }

  location.replace(target);
}

// ---------- Estado de sesión (barra superior + formulario) ----------
auth.onAuthStateChanged((user) => {
  $("nav-guest").hidden = !!user;
  $("nav-user").hidden = !user;
  $("guest-cta").hidden = !!user;
  $("save-form").hidden = !user || !$("result").hidden;
  if (user) $("nav-email").textContent = user.email;
});

// ---------- Acortar ----------
async function saveLink() {
  const input = $("link-input");
  const button = $("save-button");

  $("form-error").textContent = "";
  input.classList.remove("invalid");
  button.classList.add("loading");
  button.disabled = true;

  try {
    const { key, shortUrl } = await createLink({ url: input.value, alias: $("alias-input").value });
    $("short-url").textContent = shortUrl.replace(/^https?:\/\//, "");
    $("short-url").href = shortUrl;
    $("short-url").dataset.url = shortUrl;
    $("stats-link").href = "dashboard.html?link=" + encodeURIComponent(key);
    $("save-form").hidden = true;
    $("result").hidden = false;
  } catch (err) {
    console.error(err);
    $("form-error").textContent = err.message || "Algo salió mal. Intenta de nuevo.";
    input.classList.add("invalid");
  } finally {
    button.classList.remove("loading");
    button.disabled = false;
  }
}

async function copyLink() {
  await copyText($("short-url").dataset.url);
  $("copy-button").textContent = "¡Copiado!";
  $("copy-button").classList.add("done");
  showToast("Link copiado al portapapeles");
  setTimeout(() => {
    $("copy-button").textContent = "Copiar";
    $("copy-button").classList.remove("done");
  }, 2000);
}

function resetForm() {
  $("result").hidden = true;
  $("save-form").hidden = false;
  $("link-input").value = "";
  $("alias-input").value = "";
  $("link-input").focus();
}

// ---------- Arranque (al final, cuando todo está definido) ----------
if (searchKey) {
  $("save-link").hidden = true;
  $("redirect").hidden = false;
  $("home-link").href = SITE_BASE;
  document.body.classList.add("redirecting");
  handleRedirect(searchKey);
} else {
  $("save-link").hidden = false;
}
