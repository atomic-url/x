// ============================================================
//  tiny · módulo compartido (index.html y dashboard.html)
// ============================================================

// Configuración Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDwPNgxfKOnZemGaXCOLe3jzl3q_YNRsFQ",
  authDomain: "redirect-af2e4.firebaseapp.com",
  databaseURL: "https://redirect-af2e4-default-rtdb.firebaseio.com",
  projectId: "redirect-af2e4",
  storageBucket: "redirect-af2e4.appspot.com",
  messagingSenderId: "945130498479",
  appId: "1:945130498479:web:ef22174165705cb37f275a"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
auth.languageCode = "es"; // correos de Firebase (recuperar contraseña) en español
const TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;

const $ = (id) => document.getElementById(id);

// Carpeta donde vive index.html → base de los links cortos
const SITE_BASE = location.origin + location.pathname.replace(/(index|dashboard)\.html$/, "");
const shortUrlFor = (key) => SITE_BASE + "?search=" + encodeURIComponent(key);

// ---------- utilidades ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function flag(cc) {
  if (!cc || cc.length !== 2) return "🌐";
  return String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

function randomKey(len = 6) {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

// Normaliza y valida la URL (agrega https:// si falta)
function normalizeUrl(raw) {
  let url = String(raw || "").trim();
  if (!url) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}

let toastTimer;
function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Detección de dispositivo / navegador / sistema ----------
function parseUA(ua = navigator.userAgent) {
  const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  let device = "Escritorio";
  if (/bot|crawl|spider|slurp|facebookexternalhit|WhatsApp|TelegramBot|Discordbot|Slackbot|Twitterbot|LinkedInBot|preview/i.test(ua)) device = "Bot";
  else if (isIPadOS || /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) device = "Móvil";

  let os = "Otro";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua) || isIPadOS) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Otro";
  if (/Edg(e|A|iOS)?\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/FBAN|FBAV/i.test(ua)) browser = "Facebook";
  else if (/Instagram/i.test(ua)) browser = "Instagram";
  else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return { device, os, browser };
}

// ---------- Crear un link (dueño = usuario actual) ----------
async function createLink({ url, alias = "", title = "" }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Debes iniciar sesión.");

  const clean = normalizeUrl(url);
  if (!clean) throw new Error("Ingresa una URL válida.");

  alias = alias.trim();
  if (alias && !/^[A-Za-z0-9_-]{3,40}$/.test(alias)) {
    throw new Error("El alias debe tener de 3 a 40 caracteres: letras, números, - o _.");
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const key = alias || randomKey();
    const exists = (await db.ref("links/" + key).once("value")).exists();
    if (exists) {
      if (alias) throw new Error(`El alias "${alias}" ya está en uso.`);
      continue;
    }
    const updates = {};
    updates["links/" + key] = clean;
    updates["owners/" + key] = user.uid;
    updates[`users/${user.uid}/links/${key}`] = { url: clean, title: title.trim().slice(0, 120), createdAt: TIMESTAMP };
    await db.ref().update(updates);
    return { key, url: clean, shortUrl: shortUrlFor(key) };
  }
  throw new Error("No se pudo generar un ID único. Intenta de nuevo.");
}
