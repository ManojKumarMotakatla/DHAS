// ============================================================
// DHAS — config.js
// SINGLE SOURCE OF TRUTH for API base URL and auth helpers.
//
// FIX P1.5 — API URL was hardcoded as "http://localhost:3006"
//             in 9+ files. Change it here once and it updates
//             everywhere automatically.
//
// FIX P1.6 — getAuthHeaders() was copy-pasted into 8 files.
//             It now lives here only and is exposed on window
//             so every page can call window.getAuthHeaders().
//
// USAGE IN EVERY HTML PAGE:
//   <!-- Load config BEFORE any other JS file -->
//   <script src="js/config.js"></script>
//   <script src="js/auth.js"></script>
//   ... other scripts ...
//
// Then anywhere in JS:
//   fetch(window.API_BASE + "/login", { headers: window.getAuthHeaders() })
// ============================================================

(function () {
  "use strict";

  // ── Change this ONE line when deploying ───────────────────
  // Development:  "http://localhost:3006"
  // Production:   "https://your-real-domain.com"
  var API_BASE = "http://localhost:3006";

  // Expose globally so every script on every page can use it
  window.API_BASE = API_BASE;

  // ── Auth header builder ───────────────────────────────────
  // Reads the JWT token from localStorage and builds the
  // Authorization header. Returns a plain object you can
  // spread into fetch options or pass directly.
  //
  // Example:
  //   fetch(API_BASE + "/profile/1", { headers: getAuthHeaders() })
  //
  function getAuthHeaders(extraHeaders) {
    var token = localStorage.getItem("dhas_token");
    var headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    // Merge any extra headers the caller wants (optional)
    if (extraHeaders && typeof extraHeaders === "object") {
      Object.assign(headers, extraHeaders);
    }
    return headers;
  }

  // Expose on window — replaces ALL local copies across the app
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