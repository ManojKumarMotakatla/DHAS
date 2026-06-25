/**
 * DHAS — sw.js  (v10 — dashboard pages now network-first, no more stale dashboards)
 * Place at project ROOT (same level as server.js)
 *
 * CHANGE FROM v9:
 *   Added /dashboard.html and /doctor_dashboard.html to CHAT_DEV_PREFIXES
 *   (renamed DEV_RELOAD_PREFIXES to be more accurate). These pages were
 *   being served cache-first, so editing them required a hard refresh.
 *   Now they go through networkFirst() — same as chat.html — so a normal
 *   reload always fetches the latest version from the server when online.
 *
 *   CACHE_VERSION bumped (v11 -> v12) to evict stale cached copies of
 *   dashboard.html and doctor_dashboard.html immediately on next load.
 */

const CACHE_VERSION = "dhas-v12";
const API_CACHE     = "dhas-api-v8";
const FONT_CACHE    = "dhas-fonts-v8";
const CDN_CACHE     = "dhas-cdn-v8";

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
  "/js/alarm-engine.js",
  "/js/steps.js",
  "/js/report.js",
  "/js/severity.js",
  "/js/language.js",
  "/css/style.css",
  "/manifest.json"
];

// API path prefixes — these must NEVER be served as HTML navigation fallbacks
const API_PREFIXES = [
  "/profile",
  "/symptoms",
  "/reminders",
  "/reports",
  "/login",
  "/register",
  "/auth",
  "/reminder-logs",
  "/test",
  "/chat",
  "/keys",
  "/doctor"
];

// Files that are served network-first (always try live network before cache).
// This ensures edits to these files are visible on a normal reload without
// needing a hard refresh or a CACHE_VERSION bump.
// Includes chat files (active development) AND dashboard pages which are
// frequently edited and must never show stale content.
const DEV_RELOAD_PREFIXES = [
  "/dashboard.html",
  "/doctor_dashboard.html",
  "/chat.html",
  "/js/chat.js",
  "/js/crypto.js",
  "/js/socket.io.min.js"
];

function isAPIPath(pathname) {
  return API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isDevReloadFile(pathname) {
  return DEV_RELOAD_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      const results = await Promise.allSettled(
        CORE_ASSETS.map(url =>
          fetch(url, { cache: "no-cache" })
            .then(response => { if (response.ok) return cache.put(url, response); })
            .catch(() => {})
        )
      );
      const ok = results.filter(r => r.status === "fulfilled").length;
      console.log(`[SW v10] Cached ${ok}/${CORE_ASSETS.length} assets`);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  const validCaches = [CACHE_VERSION, API_CACHE, FONT_CACHE, CDN_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !validCaches.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

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

  // CDN assets — cache first
  if (
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("accounts.google.com")
  ) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // Dev/dashboard files — network-first so edits show on normal reload
  if (isDevReloadFile(url.pathname)) {
    event.respondWith(networkFirst(request, CACHE_VERSION));
    return;
  }

  // API calls — network first, fallback to cache when offline
  if (isAPIPath(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Everything else (HTML, CSS, JS) — cache first
  event.respondWith(cacheFirst(request, CACHE_VERSION));
});

async function cacheFirst(request, cacheName) {
  const url    = new URL(request.url);
  const isAPI  = isAPIPath(url.pathname);

  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    if (request.mode === "navigate" && isAPI) {
      // Fall through to network
    } else {
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.mode === "navigate" && !isAPI) {
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
    const response = await fetch(request, { cache: "no-store" });
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

/* ══════════════════════════════════════════════════════════════════════════
   DHAS ALARM ENGINE — runs inside the Service Worker
   ══════════════════════════════════════════════════════════════════════════ */

let _swReminders = [];
let _swAlarmInterval = null;

function _sw_to24(h, m, ampm) {
    let hr = parseInt(h, 10);
    if (ampm === "PM" && hr !== 12) hr += 12;
    if (ampm === "AM" && hr === 12) hr = 0;
    return [hr, parseInt(m, 10)];
}

function _sw_shouldFireToday(r) {
    const now = new Date(), dow = now.getDay(), dom = now.getDate();
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    if (r.startDate) {
        const s = new Date(r.startDate + "T00:00:00");
        if (mid < s) return false;
    }
    if (r.duration && r.duration !== "forever") {
        const base = r.startDate
            ? new Date(r.startDate + "T00:00:00")
            : (r.createdAt ? new Date(r.createdAt) : new Date());
        base.setHours(0, 0, 0, 0);
        if (Math.floor((mid - base) / 86400000) >= parseInt(r.duration)) return false;
    }
    switch (r.sched || "daily") {
        case "daily":     return true;
        case "alternate": {
            if (!r.altBase) return true;
            const base = new Date(r.altBase);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const bDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
            return Math.round((today - bDay) / 86400000) % 2 === 0;
        }
        case "weekly": case "twice_week": case "three_week": case "custom":
            return (r.days || []).map(Number).includes(dow);
        case "monthly": return dom === (parseInt(r.monthDay) || 1);
        default: return false;
    }
}

const _swFired = {};

function _sw_checkAlarms() {
    if (!_swReminders.length) return;
    const now = new Date(), hh = now.getHours(), mm = now.getMinutes();

    _swReminders.forEach(r => {
        if (!_sw_shouldFireToday(r)) return;
        (r.times || []).forEach(t => {
            const [aH, aM] = _sw_to24(t.h, t.m, t.ampm);
            if (isNaN(aH) || isNaN(aM)) return;
            if ((hh * 60 + mm) !== (aH * 60 + aM)) return;
            const key = `${r.id}-${t.label}-${aH}-${aM}`;
            if (_swFired[key] && (Date.now() - _swFired[key]) < 5 * 60 * 1000) return;
            _swFired[key] = Date.now();

            self.registration.showNotification(`💊 ${r.medicine}`, {
                body:    `${t.label}: ${t.display || ""}\n${r.scheduleLabel || ""}`,
                icon:    "/icons/icon-192.svg",
                badge:   "/icons/icon-96.svg",
                vibrate: [300, 100, 300, 100, 300],
                requireInteraction: true,
                tag:     `dhas-${r.id}-${t.label}`,
                data:    { url: "/reminder.html" }
            });

            self.clients.matchAll({ type: "window" }).then(clients => {
                clients.forEach(c => c.postMessage({ type: "DHAS_CHECK_NOW" }));
            });
        });
    });
}

function _sw_startTicker() {
    if (_swAlarmInterval) clearInterval(_swAlarmInterval);
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 200;
    _sw_checkAlarms();
    setTimeout(() => {
        _sw_checkAlarms();
        _swAlarmInterval = setInterval(_sw_checkAlarms, 60 * 1000);
    }, msUntilNextMinute);
}

self.addEventListener("message", event => {
  if (event.data?.type === "DHAS_SET_REMINDERS") {
    _swReminders = event.data.reminders || [];
    console.log(`[SW] Loaded ${_swReminders.length} reminders for alarm checking`);
    _sw_startTicker();
  }

  if (event.data?.type === "CHECK_ALARMS") {
    self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: "WAKE_CHECK" }))
    );
  }

  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("periodicsync", event => {
  if (event.tag === "dhas-alarm-check") {
    event.waitUntil((async () => {
      console.log("[SW] Periodic background sync — checking alarms");
      _sw_checkAlarms();
    })());
  }
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