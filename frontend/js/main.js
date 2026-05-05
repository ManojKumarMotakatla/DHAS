// ============================================
// DHAS - main.js
// Shared utility functions
// ============================================

// Redirect to login if not logged in (call on protected pages)
function requireLogin() {
  const user = localStorage.getItem("dhas_user");
  if (!user) {
    window.location.href = "login.html";
  }
}

// Format date
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Show toast notification
function showToast(msg, type = "success") {
  const toast = document.createElement("div");
  toast.className = `dhas-alert ${type}`;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%); z-index: 9999;
    min-width: 260px; text-align: center;
    animation: fadeIn 0.3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}