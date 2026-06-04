/**
 * DHAS — sw.js  (improved)
 * Fixes P2.5: Proper offline caching for all core assets.
 * Strategy:
 *   - Core app shell → Cache First (fast loads)
 *   - API calls      → Network First (fresh data, fallback to cache)
 *   - Google Fonts   → Stale While Revalidate
 */

const CACHE_VERSION  = "dhas-v3";
const API_CACHE      = "dhas-api-v1";
const FONT_CACHE     = "dhas-fonts-v1";

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
  "/manifest.json"
];

// ── INSTALL: pre-cache core assets ───────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Add files one by one — don't fail the whole install if one is missing
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
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION && key !== API_CACHE && key !== FONT_CACHE)
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

  // Skip non-GET and cross-origin (except fonts / CDN)
  if (request.method !== "GET") return;

  // ── Google Fonts: Stale While Revalidate ──────────────────
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // ── CDN (Bootstrap, Tabler Icons): Cache First ────────────
  if (url.hostname.includes("cdn.jsdelivr.net") || url.hostname.includes("cdnjs.cloudflare.com") || url.hostname.includes("unpkg.com")) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // ── API calls: Network First ──────────────────────────────
  if (url.pathname.startsWith("/profile") ||
      url.pathname.startsWith("/symptoms") ||
      url.pathname.startsWith("/reminders") ||
      url.pathname.startsWith("/reports") ||
      url.pathname.startsWith("/login") ||
      url.pathname.startsWith("/register") ||
      url.pathname.startsWith("/auth")) {
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
    // Fallback to the 404 page for navigation requests
    if (request.mode === "navigate") {
      const fallback = await cache.match("/404.html") || await cache.match("/");
      return fallback || new Response("Offline — DHAS not available", { status: 503 });
    }
    return new Response("Offline", { status: 503 });
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
      JSON.stringify({ success: false, message: "You are offline. Please check your connection." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ── Strategy: Stale While Revalidate ─────────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 204 });
}

// ── Background sync: wake-up check for alarms ────────────────
self.addEventListener("message", event => {
  if (event.data && event.data.type === "CHECK_ALARMS") {
    // Forward to all clients so reminder.js can check alarm state
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: "WAKE_CHECK" }));
    });
  }
});

// ── Push notification click ───────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open dashboard
      return clients.openWindow("/dashboard.html");
    })
  );
});