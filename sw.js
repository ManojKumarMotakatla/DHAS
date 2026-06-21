/**
 * DHAS — sw.js  (v9 — chat files now network-first, no more stale chat.html)
 * Place at project ROOT (same level as server.js)
 *
 * CHANGE FROM v8:
 *   Previously every non-API, non-CDN GET request (including chat.html,
 *   js/chat.js, js/crypto.js, js/socket.io.min.js) went through
 *   cacheFirst(). That's great for stable pages, but those four files are
 *   under active development this project — every edit got served from
 *   the OLD cached copy until a hard refresh (which bypasses the SW) or
 *   a CACHE_VERSION bump. Meta tags like <meta http-equiv="Cache-Control">
 *   in chat.html do NOTHING here: the Service Worker intercepts the
 *   fetch event before the browser even looks at response headers from
 *   a previous load.
 *
 *   Fix: a dedicated list of "dev" files now goes through networkFirst()
 *   instead, the same strategy already used for API calls. They still get
 *   cached as a fallback for offline use, but a live network response
 *   always wins when you're online — so editing chat.js / chat.html and
 *   reloading the tab (NOT even a hard refresh) shows your latest code.
 *
 *   CACHE_VERSION is also bumped (v10 -> v11) to evict whatever stale
 *   chat.html / chat.js / crypto.js got cached under the old cacheFirst
 *   behaviour, so this fix actually takes effect on next load instead of
 *   serving yesterday's cached copy of itself.
 */

const CACHE_VERSION = "dhas-v11";
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
  "/chat",      // chat REST API (contacts, messages, send, upload, file, report)
  "/keys",      // E2E public-key bulletin board API
  "/doctor"     // doctor REST API
];

// FIX: Files under ACTIVE DEVELOPMENT for the chat feature. These are
// served network-first (always try the live network before falling back
// to cache) instead of cache-first, so edits show up on a normal reload —
// no hard refresh, no CACHE_VERSION bump needed every time you change them.
// Socket.IO's transport itself bypasses the SW entirely (it's a websocket/
// XHR polling connection, not a simple GET this handler sees the same way),
// but the *library file* socket.io.min.js is still a plain GET and was
// being cached just like chat.html was.
const CHAT_DEV_PREFIXES = [
  "/chat.html",
  "/js/chat.js",
  "/js/crypto.js",
  "/js/socket.io.min.js"
];

function isAPIPath(pathname) {
  return API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function isChatDevFile(pathname) {
  return CHAT_DEV_PREFIXES.some(prefix => pathname.startsWith(prefix));
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
      console.log(`[SW v9] Cached ${ok}/${CORE_ASSETS.length} assets`);
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

  // FIX: Chat dev files (chat.html, chat.js, crypto.js, socket.io.min.js)
  // — network-first so you see your latest edits without a hard refresh.
  if (isChatDevFile(url.pathname)) {
    event.respondWith(networkFirst(request, CACHE_VERSION));
    return;
  }

  // API calls — network first, fallback to cache when offline
  // These are handled separately so their cached responses are
  // NEVER served as HTML navigation fallbacks
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
    // Safety check: never serve a cached API JSON response as a page navigation
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
    // Offline fallback — only serve HTML pages for navigation requests,
    // and only when the request is NOT an API call
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
    // FIX: "no-store" / "reload" semantics — explicitly bypass the HTTP
    // cache for these requests too, not just our own SW cache layer,
    // so dev tools "disable cache" isn't the only thing that helps.
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
   Fires system notifications even when screen is off / browser minimised.
   ══════════════════════════════════════════════════════════════════════════ */

// In-SW reminder store (populated by the page via postMessage)
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

// SW-side dedup — simple in-memory map (cleared on SW restart, that's fine)
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

            // Show system notification (works with screen off)
            self.registration.showNotification(`💊 ${r.medicine}`, {
                body:    `${t.label}: ${t.display || ""}\n${r.scheduleLabel || ""}`,
                icon:    "/icons/icon-192.svg",
                badge:   "/icons/icon-96.svg",
                vibrate: [300, 100, 300, 100, 300],
                requireInteraction: true,
                tag:     `dhas-${r.id}-${t.label}`,
                data:    { url: "/reminder.html" }
            });

            // Also wake the page (if open) so it can play the in-app sound
            self.clients.matchAll({ type: "window" }).then(clients => {
                clients.forEach(c => c.postMessage({ type: "DHAS_CHECK_NOW" }));
            });
        });
    });
}

function _sw_startTicker() {
    if (_swAlarmInterval) clearInterval(_swAlarmInterval);
    // Align to the top of each minute so exact-minute match is always caught
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 200;
    _sw_checkAlarms(); // immediate check
    setTimeout(() => {
        _sw_checkAlarms();
        _swAlarmInterval = setInterval(_sw_checkAlarms, 60 * 1000);
    }, msUntilNextMinute);
}

self.addEventListener("message", event => {
  // Page sends updated reminder list
  if (event.data?.type === "DHAS_SET_REMINDERS") {
    _swReminders = event.data.reminders || [];
    console.log(`[SW] Loaded ${_swReminders.length} reminders for alarm checking`);
    _sw_startTicker();
  }

  // Legacy ping from old reminder.js
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