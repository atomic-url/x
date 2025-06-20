async function getEntireURL(key) {
    const response = await fetch('./DB.json');
    const data = await response.json();
    return data[key] || null;
}

// Obtener la URL y asignarla al enlace
(async () => {
    const key = new URLSearchParams(location.search || location.hash.slice(1)).get("search");
    const url = await getEntireURL(key);
    if (url) {
        document.getElementById("redirect-link").href = url;
    } else {
        console.error(`No se encontró la clave "${key}" en el JSON.`);
    }
})();
