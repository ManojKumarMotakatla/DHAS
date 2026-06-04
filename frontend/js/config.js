// ============================================================
// DHAS — config.js
// Single source of truth for API base URL and auth helpers.
// Auto-detects mobile access vs localhost.
// ============================================================

(function () {
  "use strict";

  // ── Auto-detect API base URL ──────────────────────────────
  // If the page is served from localhost → use localhost
  // If served from a local network IP (mobile) → use that same IP
  // Change the port (3006) if your backend uses a different port.
  var PORT = "3006";

  var API_BASE;
  var hostname = window.location.hostname;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    API_BASE = "http://localhost:" + PORT;
  } else {
    // Mobile or other device on local network — use same host
    API_BASE = "http://" + hostname + ":" + PORT;
  }

  // Override for production deployment — uncomment and set your domain:
  // API_BASE = "https://your-production-domain.com";

  window.API_BASE = API_BASE;

  // ── Auth header builder ───────────────────────────────────
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

  // ── Convenience: get the logged-in user object ────────────
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("dhas_user")) || null;
    } catch (_) {
      return null;
    }
  }
  window.getUser = getUser;

  // ── Convenience: redirect to login if not authenticated ───
  function requireLogin() {
    var user = getUser();
    if (!user) {
      window.location.href = "login.html";
    }
    return user;
  }
  window.requireLogin = requireLogin;

})();