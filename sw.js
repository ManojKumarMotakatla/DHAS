const CACHE_NAME = "dhas-cache-v1";

const urlsToCache = [
  "/",
  "/frontend/index.html",
  "/frontend/css/",
  "/frontend/js/"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});


// ===============================
// Notification Click Support
// ===============================

self.addEventListener("notificationclick", (event) => {

    event.notification.close();

    event.waitUntil(
        clients.openWindow("/")
    );
});