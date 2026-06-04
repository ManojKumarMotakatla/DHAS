// ============================================================
// DHAS — frontend/js/config.js
// Single source of truth for API base URL and auth helpers.
// Auto-detects mobile access vs localhost.
// MOBILE: open http://<YOUR-PC-IP>:3006 on phone (same WiFi)
// ============================================================

(function () {
  "use strict";

  // ── Auto-detect API base URL ──────────────────────────────
  // If served from localhost → use localhost
  // If served from a local network IP (mobile) → use that same IP
  var PORT = "3006";

  var hostname = window.location.hostname;
  var API_BASE;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    API_BASE = "http://localhost:" + PORT;
  } else {
    // Mobile or other device on local network — use same host + port
    // This is the key for mobile: when you open http://192.168.1.5:3006
    // on your phone, hostname = "192.168.1.5", so API calls go to the same IP
    API_BASE = "http://" + hostname + ":" + PORT;
  }

  // Override for production deployment:
  // API_BASE = "https://your-production-domain.com";

  window.API_BASE = API_BASE;

  // ── Auth header builder ───────────────────────────────────
  // Always sends JWT token if present. Used by every API call.
  function getAuthHeaders(extraHeaders) {
    var token = localStorage.getItem("dhas_token");
    var headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    if (extraHeaders && typeof extraHeaders === "object") {
      Object.assign(headers, extraHeaders);
    }
    return headers;
  }

  window.getAuthHeaders = getAuthHeaders;

  // ── Get the logged-in user object ─────────────────────────
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("dhas_user")) || null;
    } catch (_) {
      return null;
    }
  }
  window.getUser = getUser;

  // ── Redirect to login if not authenticated ─────────────────
  function requireLogin() {
    var user = getUser();
    if (!user) {
      window.location.href = "login.html";
    }
    return user;
  }
  window.requireLogin = requireLogin;

  // ── Debug info (remove in production) ─────────────────────
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    console.log("[DHAS] Running on local network. API_BASE =", API_BASE);
  }

})();