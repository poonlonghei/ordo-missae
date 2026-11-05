const VERSION = "v12";
const SHELL = ["./", "index.html", "app.js", "style.css", "manifest.json", "icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/data/")) {
    // Data: network first so a rebuilt day shows up, cached copy when offline.
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request).then((m) => m || new Response("", { status: 503 }))));
  } else {
    // Shell: cached first, refresh in the background.
    e.respondWith(caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => cached);
      return cached || net;
    }));
  }
});
