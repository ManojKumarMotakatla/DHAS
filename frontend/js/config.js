
// ============================================================
// DHAS — frontend/js/config.js
// Auto-detects mobile vs PC access. One file to change for deploy.
// ============================================================
(function () {
  "use strict";

  var PORT = "3006";
  var hostname = window.location.hostname;
  var API_BASE;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    API_BASE = "http://localhost:" + PORT;
  } else {
    // Mobile on same WiFi — use same host IP automatically
    API_BASE = "http://" + hostname + ":" + PORT;
  }

  // For production deployment, override here:
  // API_BASE = "https://your-domain.com";

  window.API_BASE = API_BASE;

  function getAuthHeaders(extraHeaders) {
    var token = localStorage.getItem("dhas_token");
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    if (extraHeaders && typeof extraHeaders === "object") {
      Object.assign(headers, extraHeaders);
    }
    return headers;
  }
  window.getAuthHeaders = getAuthHeaders;

  function getUser() {
    try { return JSON.parse(localStorage.getItem("dhas_user")) || null; }
    catch (_) { return null; }
  }
  window.getUser = getUser;

  function requireLogin() {
    var user = getUser();
    if (!user) window.location.href = "login.html";
    return user;
  }
  window.requireLogin = requireLogin;

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    console.log("[DHAS] Mobile/network mode. API_BASE =", API_BASE);
  }
})();

