// ============================================================
// DHAS — frontend/js/config.js
// Auto-detects mobile vs PC access. One file to change for deploy.
//
// CHANGED — added window.openChat(role, partnerId):
//   THE BUG THIS FIXES:
//     chat.js decides whose identity to use ("ME") like this:
//       if (hasDoctor && hasPatient) {
//         const roleHint = sessionStorage.getItem("dhas_chat_role");
//         if (roleHint === "doctor") { ME = doctor } else { ME = patient }
//       }
//     i.e. it DEFAULTS TO PATIENT whenever both a doctor and a
//     patient session exist in the same browser (e.g. during dev/
//     testing, or anyone who is logged into both portals at once).
//
//     Every page that links to chat.html was responsible for setting
//     sessionStorage.dhas_chat_role BEFORE navigating. Some call
//     sites (my_doctors.html, doctor_dashboard.html's patient cards)
//     did this correctly. Others — the sidebar "Chat" link and the
//     profile-dropdown "Chat" link on BOTH dashboard.html and
//     doctor_dashboard.html, plus the dashboard.html quick-action
//     tile — just did window.location.href = "chat.html" with NO
//     role hint at all. On a doctor's own dashboard, that silently
//     opened chat.html identifying the doctor as a PATIENT (since
//     patient is the silent fallback), showing the wrong contact
//     list and wrong portal-colored UI.
//
//   THE FIX:
//     A single shared helper, used by EVERY chat entry point on
//     every page, so role-setting can't be forgotten again:
//       window.openChat("doctor")               -> doctor's own inbox
//       window.openChat("patient")               -> patient's own inbox
//       window.openChat("patient", doctorId)     -> patient opening a
//                                                    specific doctor
//       window.openChat("doctor", patientId)     -> doctor opening a
//                                                    specific patient
// ============================================================
(function () {
  "use strict";

  var PORT = "3007";
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

  // ── NEW: single source of truth for "how do I open chat.html" ──
  // role        = "doctor" | "patient"  -> who the CALLER is right now
  // partnerId   = optional. If given, opens straight into that
  //               conversation (chat.html?partner=ID). If omitted,
  //               just opens the inbox (chat.html).
  function openChat(role, partnerId) {
    if (role !== "doctor" && role !== "patient") {
      console.error("[DHAS] openChat() called with invalid role:", role);
      return;
    }
    sessionStorage.setItem("dhas_chat_role", role);
    var url = "chat.html";
    if (partnerId !== undefined && partnerId !== null && partnerId !== "") {
      url += "?partner=" + encodeURIComponent(partnerId);
    }
    window.location.href = url;
  }
  window.openChat = openChat;

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    console.log("[DHAS] Mobile/network mode. API_BASE =", API_BASE);
  }
})();