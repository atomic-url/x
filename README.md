# Otre-URL · acortador de links con estadísticas

Acortador de URLs con usuarios y un dashboard de estadísticas en tiempo real.
Funciona solo con **Firebase** (Authentication + Realtime Database), sin servidor propio.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` + `main.js` | Página pública: acortar links y redirigir `?search=ID` (registra cada click) |
| `dashboard.html` + `dashboard.js` + `dashboard.css` | Login / registro y panel de estadísticas |
| `common.js` | Configuración de Firebase y funciones compartidas |
| `style.css` | Estilos base |
| `database.rules.json` | Reglas de seguridad de la base de datos |

## Configuración (una sola vez)

1. **Activa el login por email**
   Firebase Console → *Authentication* → *Sign-in method* → **Email/Password** → Habilitar.

2. **Publica las reglas de seguridad**
   Firebase Console → *Realtime Database* → pestaña *Reglas* → pega el contenido de
   `database.rules.json` → **Publicar**.

3. **Autoriza tu dominio** (si no usas Firebase Hosting)
   *Authentication* → *Settings* → *Authorized domains* → agrega el dominio donde
   publicas la página (por ejemplo `tuusuario.github.io`). `localhost` ya viene incluido.

4. **Abre la página por http(s)**, no con doble clic (`file://`): Firebase Auth no funciona
   así. Para probar en local, usa la extensión *Live Server* de VS Code o
   `npx serve .` y abre `http://localhost:...`.

## Estructura de datos

```
links/{id}              "https://destino.com"      ← lo lee la redirección (público)
owners/{id}             uid del dueño
users/{uid}/links/{id}  { url, title, createdAt }
clicks/{id}/{pushId}    { ts, device, os, browser, lang, tz, screen, ref, vid,
                          country, cc, region, city, lat, lon, isp }
```

Los links creados antes de esta versión (sin dueño) siguen redirigiendo, pero no
aparecen en ningún dashboard.

## Qué se registra en cada click

- **Ubicación aproximada por IP** (país, región, ciudad, coordenadas y proveedor) con servicios
  gratuitos sin API key: [GeoJS](https://www.geojs.io) e [ipwho.is](https://ipwho.is) en paralelo, y
  [ipapi.co](https://ipapi.co) como respaldo. La IP no se guarda. Si todos están bloqueados
  (bloqueadores de anuncios, Brave…), el dashboard estima el país y la ciudad por la zona horaria
  y lo marca con ≈.
- El mapa usa los mosaicos gratuitos de [OpenStreetMap](https://www.openstreetmap.org) (sin API key).
- Dispositivo, sistema operativo, navegador, resolución de pantalla, idioma y zona horaria.
- Referencia: el sitio de origen, o lo que pongas en `&src=` / `&utm_source=`.
  Ejemplo: `?search=promo&src=instagram`.
- Un ID anónimo por navegador (localStorage) para contar visitantes únicos.

La redirección espera como máximo unos 4 segundos a la ubicación y al registro del click.
Si alguno falla, redirige de todas formas.

## App instalable (PWA)

| Archivo | Qué hace |
|---|---|
| `manifest.webmanifest` | Nombre, íconos, colores, atajos y "compartir con Otre-URL" |
| `sw.js` | Service worker: guarda la app para que abra rápido y sin conexión |
| `pwa.js` | Registra el service worker y maneja el botón **Instalar** |
| `icons/` | Íconos de la app (normales y *maskable* para Android) |

- **Instalar:** en Chrome, Edge o Android aparece el botón **⤓ Instalar**. En iPhone o iPad
  el botón explica cómo hacerlo: Safari → Compartir → *Agregar a inicio*.
- **Compartir un link a la app** (Android, con la app instalada): desde cualquier app,
  Compartir → *Otre-URL* abre el dashboard con el formulario ya lleno.
- **Atajos:** mantén presionado el ícono de la app → *Nuevo link*.
- **Requisito:** la página debe estar publicada con **https** (GitHub Pages, Firebase Hosting…)
  o abierta en `localhost`.
- **Al publicar cambios**, sube el número de `VERSION` en `sw.js` (por ejemplo `"v2"`) para que
  los usuarios reciban la versión nueva y se borre la copia vieja.
