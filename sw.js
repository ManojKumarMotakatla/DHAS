/**
 * DHAS — sw.js  (v6 — full offline + mobile support)
 * Place this file at project ROOT (same level as server.js)
 */

const CACHE_VERSION = "dhas-v6";
const API_CACHE     = "dhas-api-v4";
const FONT_CACHE    = "dhas-fonts-v4";
const CDN_CACHE     = "dhas-cdn-v4";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/symptom.html",
  "/symptom_history.html",
  "/symptom_diet.html",
  "/symptom_remedies.html",
  "/results.html",
  "/reports.html",
  "/diet.html",
  "/remedies.html",
  "/reminder.html",
  "/saved_reminders.html",
  "/steps.html",
  "/profile.html",
  "/profile_details.html",
  "/change_password.html",
  "/language.html",
  "/login.html",
  "/register.html",
  "/404.html",
  "/theme.js",
  "/js/config.js",
  "/js/auth.js",
  "/js/main.js",
  "/js/health-data.js",
  "/js/symptom.js",
  "/js/reminder.js",
  "/js/steps.js",
  "/js/report.js",
  "/js/severity.js",
  "/js/language.js",
  "/css/style.css",
  "/manifest.json"
];

self.addEventListener("install", event => {
  console.log("[SW] Installing v6...");
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      // Cache assets individually, skip failures silently
      const results = await Promise.allSettled(
        CORE_ASSETS.map(url =>
          fetch(url, { cache: "no-cache" }).then(response => {
            if (response.ok) {
              return cache.put(url, response);
            }
          }).catch(err =>
            console.warn(`[SW] Could not cache ${url}:`, err.message)
          )
        )
      );
      const ok = results.filter(r => r.status === "fulfilled").length;
      console.log(`[SW] Cached ${ok}/${CORE_ASSETS.length} assets`);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  const validCaches = [CACHE_VERSION, API_CACHE, FONT_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !validCaches.includes(k)).map(k => {
          console.log("[SW] Removing old cache:", k);
          return caches.delete(k);
        })
      ))
      .then(() => {
        console.log("[SW] v6 activated");
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // Skip chrome-extension and non-http requests
  if (!url.protocol.startsWith("http")) return;

  // Google Fonts — stale while revalidate
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // CDN assets (icons, bootstrap, etc.) — cache first
  if (
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("accounts.google.com")
  ) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // API calls — network first (fresh data when online, cached when offline)
  if (
    url.pathname.startsWith("/profile") ||
    url.pathname.startsWith("/symptoms") ||
    url.pathname.startsWith("/reminders") ||
    url.pathname.startsWith("/reports") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/register") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/reminder-logs")
  ) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Everything else (HTML, CSS, JS, images) — cache first
  event.respondWith(cacheFirst(request, CACHE_VERSION));
});

// ── Cache strategies ──────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback for navigation
    if (request.mode === "navigate") {
      const fallback =
        (await cache.match("/404.html")) ||
        (await cache.match("/dashboard.html")) ||
        (await cache.match("/"));
      if (fallback) return fallback;
    }
    return new Response(
      JSON.stringify({ success: false, message: "You are offline. Please check your connection." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, message: "You are offline." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache        = await caches.open(cacheName);
  const cached       = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response("", { status: 204 });
}

// ── Messages from main thread ─────────────────────────────────

self.addEventListener("message", event => {
  if (event.data?.type === "CHECK_ALARMS") {
    self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: "WAKE_CHECK" }))
    );
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Notification click ────────────────────────────────────────

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ── Push notifications ────────────────────────────────────────

self.addEventListener("push", event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "DHAS Reminder", {
        body:    data.body    || "Time to take your medicine!",
        icon:    data.icon    || "/icons/icon-192.png",
        badge:   data.badge   || "/icons/icon-96.png",
        vibrate: [300, 100, 300],
        requireInteraction: true,
        tag:     data.tag     || "dhas-reminder",
        data:    { url: data.url || "/reminder.html" }
      })
    );
  } catch {
    event.waitUntil(
      self.registration.showNotification("DHAS Reminder", {
        body:  "Time to take your medicine!",
        icon:  "/icons/icon-192.png",
        badge: "/icons/icon-96.png"
      })
    );
  }
});