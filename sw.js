// Funcionamiento sin conexión: después de abrir la app una vez, sus archivos, el diccionario
// y los modelos de MediaPipe quedan guardados en el teléfono.
const CACHE = "senas-a-voz-v1";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "listen.js",
  "lsm.js",
  "alphabet.js",
  "palabras.js",
  "frases.js",
  "speech.js",
  "text.js",
  "senas-lsm.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
// Archivos externos con versión fija en la URL: se guardan la primera vez y ya no cambian.
const CDN = ["https://cdn.jsdelivr.net/", "https://storage.googleapis.com/mediapipe-models/"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;
  if (CDN.some((p) => url.startsWith(p))) {
    // Primero lo guardado; si no está, se descarga y se guarda.
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  if (new URL(url).origin !== self.location.origin) return;
  // Archivos de la app: primero la red (para recibir actualizaciones) y, sin conexión, lo guardado.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
