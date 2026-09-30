// ============================================================
//  Otre-URL · PWA: service worker + botón "Instalar app"
// ============================================================
(function () {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("Service worker no registrado:", err));
    });
  }

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const buttons = () => document.querySelectorAll("[data-install]");
  const show = (v) => buttons().forEach((b) => (b.hidden = !v));

  let deferredPrompt = null;

  // Chrome / Edge / Android: el navegador avisa que la app se puede instalar
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    show(false);
    if (typeof showToast === "function") showToast("¡App instalada!");
  });

  document.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-install]")) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === "accepted") show(false);
    } else if (isIOS && typeof showToast === "function") {
      showToast("En Safari: toca Compartir ⬆︎ y luego «Agregar a inicio»", 6000);
    }
  });

  // iPhone/iPad no tiene aviso automático: mostramos el botón con instrucciones
  document.addEventListener("DOMContentLoaded", () => {
    if (isIOS && !isStandalone()) show(true);
    if (isStandalone()) document.documentElement.classList.add("standalone");
  });
})();
