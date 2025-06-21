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

// Redirección automática si ?search=ID
(async () => {
  const key = new URLSearchParams(location.search || location.hash.slice(1)).get("search");
  if (!key) {
    document.getElementById("redirect").style.display = "none";
    return console.warn("No se especificó ninguna clave");
  }

  document.getElementById("save-link").style.display = "none";

  try {
    const snapshot = await db.ref("links/" + key).once("value");
    const data = snapshot.val();

    if (typeof data === "string") {
      document.getElementById("redirect-link").href = data;
      window.location.href = data;
    } else {
      console.warn(`No se encontró la clave "${key}" en Firebase.`);
    }
  } catch (err) {
    console.error("Error al acceder a Firebase:", err);
  }
})();

// Guardar una URL nueva
async function saveLink() {
    const url = document.getElementById("link-input").value.trim();
    if (!url) {
        alert("Ingresa una URL válida.");
        return;
    }

    const newRef = db.ref("links").push();
    await newRef.set(url);
    shortUrl = window.location.href + "?search=" + newRef.key;
    alert("New Url: " + shortUrl);

    document.getElementById("save-link").style.display = "none";
    document.getElementById("redirect").style.display = "block";
    document.getElementById("redirect-url").textContent = shortUrl;
    document.getElementById("redirect-link").href = shortUrl;
}
