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

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const $ = (id) => document.getElementById(id);
const baseUrl = location.origin + location.pathname;

// Redirección automática si ?search=ID
(async () => {
  const key = new URLSearchParams(location.search || location.hash.slice(1)).get("search");
  if (!key) {
    $("save-link").hidden = false;
    $("link-input").focus();
    return;
  }

  $("save-link").hidden = true;
  $("redirect").hidden = false;
  $("home-link").href = baseUrl;

  try {
    const snapshot = await db.ref("links/" + key).once("value");
    const data = snapshot.val();

    if (typeof data === "string") {
      $("redirect-link").href = data;
      window.location.href = data;
    } else {
      console.warn(`No se encontró la clave "${key}" en Firebase.`);
      showNotFound();
    }
  } catch (err) {
    console.error("Error al acceder a Firebase:", err);
    showNotFound();
  }
})();

function showNotFound() {
  $("redirect-loading").hidden = true;
  $("redirect-error").hidden = false;
}

// Normaliza y valida la URL (agrega https:// si falta)
function normalizeUrl(raw) {
  let url = raw.trim();
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

// Guardar una URL nueva
async function saveLink() {
  const input = $("link-input");
  const button = $("save-button");
  const url = normalizeUrl(input.value);

  $("form-error").textContent = "";
  input.classList.remove("invalid");

  if (!url) {
    $("form-error").textContent = "Please enter a valid URL.";
    input.classList.add("invalid");
    input.focus();
    return;
  }

  button.classList.add("loading");
  button.disabled = true;

  try {
    const newRef = db.ref("links").push();
    await newRef.set(url);
    const shortUrl = baseUrl + "?search=" + newRef.key;

    $("short-url").textContent = shortUrl.replace(/^https?:\/\//, "");
    $("short-url").href = shortUrl;
    $("short-url").dataset.url = shortUrl;
    $("save-form").hidden = true;
    $("result").hidden = false;
  } catch (err) {
    console.error("Error al guardar en Firebase:", err);
    $("form-error").textContent = "Something went wrong. Please try again.";
  } finally {
    button.classList.remove("loading");
    button.disabled = false;
  }
}

async function copyLink() {
  const url = $("short-url").dataset.url;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const t = document.createElement("textarea");
    t.value = url;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  $("copy-button").textContent = "Copied!";
  $("copy-button").classList.add("done");
  showToast("Link copied to clipboard");
  setTimeout(() => {
    $("copy-button").textContent = "Copy";
    $("copy-button").classList.remove("done");
  }, 2000);
}

function resetForm() {
  $("result").hidden = true;
  $("save-form").hidden = false;
  $("link-input").value = "";
  $("link-input").focus();
}

let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
