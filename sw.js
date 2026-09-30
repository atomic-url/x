// ============================================================
//  Otre-URL · Service Worker
//  Cambia VERSION cada vez que publiques cambios importantes.
// ============================================================
const VERSION = "v1";
const APP_CACHE = `otre-app-${VERSION}`;
const LIB_CACHE = `otre-libs-${VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./style.css",
  "./dashboard.css",
  "./common.js",
  "./main.js",
  "./dashboard.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

// Librerías con versión fija en la URL → se pueden guardar para siempre
const LIB_HOSTS = ["cdnjs.cloudflare.com", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

// Nunca pasar por caché: base de datos, login y servicios de ubicación
const BYPASS_HOSTS = [
  "firebaseio.com",
  "firebasedatabase.app",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "get.geojs.io",
  "ipwho.is",
  "ipapi.co",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("otre-") && k !== APP_CACHE && k !== LIB_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  // Páginas: primero la red (siempre la versión más nueva), sin conexión → copia guardada
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, true));
    return;
  }

  // Archivos propios (css/js/íconos): red primero, caché como respaldo
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, false));
    return;
  }

  // Librerías de CDN: caché primero
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
  // Todo lo demás (mosaicos del mapa, favicons…) va directo a la red.
});

async function networkFirst(req, isPage) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      // Las páginas se guardan sin parámetros (?search=…, ?link=…)
      const key = isPage ? stripSearch(req.url) : req;
      cache.put(key, res.clone());
    }
    return res;
  } catch (err) {
    const cached = (await cache.match(req, { ignoreSearch: true })) || (isPage && (await cache.match("./index.html")));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(LIB_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

function stripSearch(u) {
  const x = new URL(u);
  x.search = "";
  x.hash = "";
  if (x.pathname.endsWith("/")) x.pathname += "index.html";
  return x.href;
}
