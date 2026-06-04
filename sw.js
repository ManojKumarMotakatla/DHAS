/**
 * DHAS — sw.js  (v4 — full offline support)
 * Fixes P2.5: Proper offline caching for all core assets.
 *
 * Strategy:
 *   - Core app shell → Cache First (fast loads, works offline)
 *   - API calls      → Network First (fresh data, fallback to cache)
 *   - Google Fonts   → Stale While Revalidate
 *   - CDN assets     → Cache First (long-lived, versioned)
 */

const CACHE_VERSION = "dhas-v4";
const API_CACHE     = "dhas-api-v2";
const FONT_CACHE    = "dhas-fonts-v2";
const CDN_CACHE     = "dhas-cdn-v2";

// ── Core app shell files to pre-cache ────────────────────────
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
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// ── INSTALL: pre-cache core assets ───────────────────────────
self.addEventListener("install", event => {
  console.log("[SW] Installing v4...");
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return Promise.allSettled(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn(`[SW] Could not cache ${url}:`, err.message);
          })
        )
      );
    }).then(() => {
      console.log("[SW] Install complete");
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────────
self.addEventListener("activate", event => {
  const validCaches = [CACHE_VERSION, API_CACHE, FONT_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log("[SW] Activate complete");
      return self.clients.claim();
    })
  );
});

// ── FETCH: request interception strategy ─────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== "GET") return;

  // ── Google Fonts: Stale While Revalidate ──────────────────
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // ── CDN assets (Bootstrap, Tabler Icons, etc.): Cache First
  if (
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("accounts.google.com")
  ) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // ── API calls: Network First ──────────────────────────────
  if (
    url.pathname.startsWith("/profile") ||
    url.pathname.startsWith("/symptoms") ||
    url.pathname.startsWith("/reminders") ||
    url.pathname.startsWith("/reports") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/register") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/test")
  ) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // ── App shell: Cache First ────────────────────────────────
  event.respondWith(cacheFirst(request, CACHE_VERSION));
});

// ── Strategy: Cache First ─────────────────────────────────────
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
    // For navigation requests, return offline page
    if (request.mode === "navigate") {
      const fallback =
        (await cache.match("/404.html")) ||
        (await cache.match("/dashboard.html")) ||
        (await cache.match("/"));
      if (fallback) return fallback;
    }
    return new Response(
      JSON.stringify({ success: false, message: "You are offline. Please check your connection." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

// ── Strategy: Network First ───────────────────────────────────
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        success: false,
        message: "You are offline. Please check your connection."
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

// ── Strategy: Stale While Revalidate ─────────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache       = await caches.open(cacheName);
  const cached      = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 204 });
}

// ── Background sync: wake-up check for alarms ────────────────
self.addEventListener("message", event => {
  if (event.data && event.data.type === "CHECK_ALARMS") {
    self.clients.matchAll().then(clients => {
      clients.forEach(client =>
        client.postMessage({ type: "WAKE_CHECK" })
      );
    });
  }
  // Allow manual cache refresh from app
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Push notification click ───────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard.html";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Push message handler ──────────────────────────────────────
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