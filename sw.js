/**
 * DHAS — sw.js  (v9 — network-first HTML, proper cache busting)
 * Place at project ROOT (same level as server.js)
 */

const CACHE_VERSION = "dhas-v9";
const API_CACHE     = "dhas-api-v9";
const FONT_CACHE    = "dhas-fonts-v9";
const CDN_CACHE     = "dhas-cdn-v9";

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

// API path prefixes — never serve as HTML navigation fallbacks
const API_PREFIXES = [
  "/profile",
  "/symptoms",
  "/reminders",
  "/reports",
  "/login",
  "/register",
  "/auth",
  "/reminder-logs",
  "/doctor",
  "/test"
];

// HTML pages — always network-first so changes show immediately
const HTML_EXTENSIONS = [".html", "/"];

function isAPIPath(pathname) {
  return API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isHTMLRequest(request) {
  const url = new URL(request.url);
  const { pathname } = url;
  return (
    request.mode === "navigate" ||
    pathname.endsWith(".html") ||
    pathname === "/" ||
    (!pathname.includes(".") && !isAPIPath(pathname))
  );
}

// ── INSTALL: cache core assets ────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      const results = await Promise.allSettled(
        CORE_ASSETS.map(url =>
          fetch(url, { cache: "reload" })
            .then(response => { if (response.ok) return cache.put(url, response); })
            .catch(() => {})
        )
      );
      const ok = results.filter(r => r.status === "fulfilled").length;
      console.log(`[SW v9] Cached ${ok}/${CORE_ASSETS.length} assets`);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clear old caches ────────────────────────────────
self.addEventListener("activate", event => {
  const validCaches = [CACHE_VERSION, API_CACHE, FONT_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !validCaches.includes(k))
          .map(k => {
            console.log(`[SW v9] Removing old cache: ${k}`);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // Google Fonts — stale while revalidate
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // CDN assets — cache first (they're versioned externally)
  if (
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("accounts.google.com")
  ) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // API calls — network first, short cache for offline
  if (isAPIPath(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // HTML pages — ALWAYS network first so updates show immediately
  if (isHTMLRequest(request)) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // JS/CSS/images — cache first with network fallback
  event.respondWith(cacheFirst(request, CACHE_VERSION));
});

// ── STRATEGIES ────────────────────────────────────────────────

// Network first for HTML — show fresh content, fall back to cache offline
async function networkFirstHTML(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok) {
      // Update cache with fresh copy
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline: serve from cache
    const cached = await cache.match(request);
    if (cached) return cached;

    // Ultimate fallback
    const fallback =
      (await cache.match("/404.html")) ||
      (await cache.match("/dashboard.html")) ||
      (await cache.match("/"));
    if (fallback) return fallback;

    return new Response("<h1>Offline</h1><p>Please check your connection.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html" }
    });
  }
}

// Cache first for static assets
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
    return new Response("", { status: 503 });
  }
}

// Network first for API
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

// Stale while revalidate for fonts
async function staleWhileRevalidate(request, cacheName) {
  const cache        = await caches.open(cacheName);
  const cached       = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response("", { status: 204 });
}

// ── MESSAGE HANDLER ───────────────────────────────────────────
self.addEventListener("message", event => {
  if (event.data?.type === "CHECK_ALARMS") {
    self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: "WAKE_CHECK" }))
    );
  }
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("push", event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "DHAS Reminder", {
        body:    data.body    || "Time to take your medicine!",
        icon:    data.icon    || "/icons/icon-192.svg",
        badge:   data.badge   || "/icons/icon-96.svg",
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
        icon:  "/icons/icon-192.svg",
        badge: "/icons/icon-96.svg"
      })
    );
  }
});